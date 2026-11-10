/*
 * Reuse Trading - Containers invullen (Sequoia ERP)
 * ------------------------------------------------------------------
 * Vult het "Containers" scherm (Container #, Seal #, Pack QTY,
 * Net (KGS), Gross (KGS)) op basis van twee documenten. Je kiest zelf
 * welk document je in welk vakje sleept, en je kan al invullen met
 * slechts één van de twee:
 *
 *   - BILL OF LADING (PDF, MSC-formulier) -> Container #, Seal #, Pack QTY, Gross
 *   - PACKING LIST   (PDF)                -> Net (+ Seal/Gross als controle)
 *
 * Met beide documenten: BL is de basis, PL vult het Net aan en dient
 * als controle (verschillen worden gemarkeerd).
 *
 * Het scherm is een Vue.js-app: rijen worden via de echte "Add new
 * Container"-knop bijgemaakt en waarden via input-events gezet, zodat
 * Sequoia alles correct bewaart. De knop bewaart of verwijdert nooit
 * zelf; jij klikt Save.
 *
 * Aanpassen: enkel dit bestand. Daarna: py build_bookmarklet.py
 */
(function () {
  'use strict';

  var PDFJS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var ID = 'reuseContainerFiller';

  if (!/comtrade_orders\/containers/i.test(location.href)) {
    alert('Open eerst een order op het tabblad "Containers" in Sequoia, en klik dan op deze knop.');
    return;
  }
  var already = document.getElementById(ID);
  if (already) { already.remove(); var oc = document.getElementById(ID + '_css'); if (oc) oc.remove(); return; }

  /* ---------------- versie ---------------- */
  var VERSION = 'v2026-11-10h · bewerkbaar + OCR · MSC/Hapag/Maersk/CMA · multi-seal + komma-gewichten';

  /* Map waar collega's een BL die NIET kan worden ingelezen achterlaten, zodat ze
     later aan de herkenning kan worden toegevoegd ("laten aanleren"). */
  var SUBMIT_DIR = "P:\\TRADING\\Claude applicaties\\DOCUMENTATION\\Container SEQ - APPLICATIE\\_Niet ingelezen BL's";

  /* ---------------- state ---------------- */
  var state = { bl: null, pl: null, blNumber: null, plNumber: null, plTotalNet: null };

  /* ---------------- styles ---------------- */
  var css =
    '#' + ID + '{position:fixed;top:24px;right:24px;width:480px;max-height:90vh;overflow:auto;z-index:2147483647;background:#fff;border:1px solid #cfd6dd;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);font-family:Calibri,Segoe UI,Arial,sans-serif;font-size:14px;color:#2b3640}' +
    '#' + ID + ' .rf-hd{background:#2f4050;color:#fff;padding:10px 14px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between}' +
    '#' + ID + ' .rf-hd b{font-size:15px;font-weight:600}' +
    '#' + ID + ' .rf-x{cursor:pointer;font-size:20px;line-height:1;opacity:.85;padding:0 4px}#' + ID + ' .rf-x:hover{opacity:1}' +
    '#' + ID + ' .rf-bd{padding:14px}' +
    '#' + ID + ' .rf-zones{display:flex;gap:10px}' +
    '#' + ID + ' .rf-zone{flex:1;border:2px dashed #9fb3c8;border-radius:8px;padding:14px 10px;text-align:center;color:#5b6b7b;cursor:pointer;background:#f7fafc;transition:.15s;font-size:13px}' +
    '#' + ID + ' .rf-zone .rf-zt{font-weight:600;color:#2f4050;display:block;margin-bottom:3px}' +
    '#' + ID + ' .rf-zone small{display:block;margin-top:4px;color:#8a99a8;font-size:11px;word-break:break-word}' +
    '#' + ID + ' .rf-zone.rf-over{border-color:#4a90d9;background:#eaf3fb}' +
    '#' + ID + ' .rf-zone.on{border-style:solid;border-color:#27804e;background:#eaf6ef}' +
    '#' + ID + ' .rf-zone.on .rf-zt{color:#27804e}' +
    '#' + ID + ' .rf-zone.err{border-color:#c0392b;background:#fdecec}' +
    '#' + ID + ' .rf-msg{margin-top:10px;font-size:13px;white-space:pre-line;color:#5b6b7b}' +
    '#' + ID + ' .rf-msg.rf-warn{color:#b9770e}#' + ID + ' .rf-msg.rf-err{color:#c0392b}#' + ID + ' .rf-msg.rf-ok{color:#27804e}' +
    '#' + ID + ' table.rf-tb{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}' +
    '#' + ID + ' table.rf-tb th,#' + ID + ' table.rf-tb td{border:1px solid #e1e7ed;padding:3px 5px;text-align:left}' +
    '#' + ID + ' table.rf-tb th{background:#eef2f6;font-weight:600}' +
    '#' + ID + ' table.rf-tb td.num{text-align:right;font-variant-numeric:tabular-nums}' +
    '#' + ID + ' table.rf-tb td.flag{background:#fff3d9}' +
    '#' + ID + ' table.rf-tb td{padding:1px 2px}' +
    '#' + ID + ' input.rf-c{width:100%;box-sizing:border-box;border:1px solid transparent;background:transparent;font:inherit;color:inherit;padding:2px 3px;border-radius:3px}' +
    '#' + ID + ' input.rf-c:hover{border-color:#dbe3ea}#' + ID + ' input.rf-c:focus{border-color:#4a90d9;background:#fff;outline:none}' +
    '#' + ID + ' input.rf-c.rf-cn{text-align:right;font-variant-numeric:tabular-nums}' +
    '#' + ID + ' input.rf-c.miss{background:#fde8e8}' +
    '#' + ID + ' td.flag input.rf-c{color:#a6690a}' +
    '#' + ID + ' .rf-del{cursor:pointer;color:#c0392b;font-weight:700;padding:0 4px}#' + ID + ' .rf-del:hover{color:#a01f10}' +
    '#' + ID + ' .rf-add{margin-top:6px;font-size:12px;color:#4a90d9;cursor:pointer;display:inline-block}#' + ID + ' .rf-add:hover{text-decoration:underline}' +
    '#' + ID + ' .rf-hint{margin-top:4px;font-size:11px;color:#8a99a8}' +
    '#' + ID + ' .rf-ocr{display:inline-block;margin-top:6px;background:#4a90d9;color:#fff;padding:5px 10px;border-radius:5px;cursor:pointer;font-weight:600}#' + ID + ' .rf-ocr:hover{background:#3a7bc0}' +
    '#' + ID + ' .rf-opt{margin-top:9px;font-size:12px;color:#5b6b7b;display:flex;align-items:center;gap:6px}' +
    '#' + ID + ' .rf-tot{margin-top:8px;font-size:12px;color:#5b6b7b}' +
    '#' + ID + ' .rf-btn{margin-top:12px;width:100%;background:#4a90d9;color:#fff;border:0;border-radius:6px;padding:10px;font-size:14px;font-weight:600;cursor:pointer}' +
    '#' + ID + ' .rf-btn:hover{background:#3a7bc0}#' + ID + ' .rf-btn:disabled{background:#a9c4e2;cursor:default}';
  var style = document.createElement('style'); style.id = ID + '_css'; style.textContent = css;
  document.head.appendChild(style);

  /* ---------------- overlay ---------------- */
  var box = document.createElement('div'); box.id = ID;
  box.innerHTML =
    '<div class="rf-hd"><b>Containers invullen</b><span class="rf-x" title="Sluiten" style="margin-left:auto">&times;</span></div>' +
    '<div class="rf-bd">' +
      '<div class="rf-zones">' +
        '<div class="rf-zone rf-zone-bl"><span class="rf-zt">1. Bill of Lading</span>sleep hier (of klik)<small></small></div>' +
        '<div class="rf-zone rf-zone-pl"><span class="rf-zt">2. Packing List</span>sleep hier (of klik)<small></small></div>' +
      '</div>' +
      '<input type="file" accept="application/pdf,.pdf" data-kind="bl" style="display:none">' +
      '<input type="file" accept="application/pdf,.pdf" data-kind="pl" style="display:none">' +
      '<div class="rf-msg"></div>' +
      '<div class="rf-result"></div>' +
    '</div>';
  document.body.appendChild(box);
  try { console.log('Containers-tool ' + VERSION); } catch (e) {}   /* versie enkel in console voor support, niet in beeld */

  var msgEl = box.querySelector('.rf-msg');
  var resEl = box.querySelector('.rf-result');
  var zoneBL = box.querySelector('.rf-zone-bl');
  var zonePL = box.querySelector('.rf-zone-pl');
  var inpBL = box.querySelector('input[data-kind="bl"]');
  var inpPL = box.querySelector('input[data-kind="pl"]');

  box.querySelector('.rf-x').onclick = function () { box.remove(); style.remove(); };
  wireZone(zoneBL, inpBL, 'bl');
  wireZone(zonePL, inpPL, 'pl');

  function wireZone(zone, input, kind) {
    zone.onclick = function () { input.click(); };
    input.onchange = function () { if (input.files && input.files[0]) onFile(input.files[0], kind); };
    ['dragenter', 'dragover'].forEach(function (e) { zone.addEventListener(e, function (ev) { ev.preventDefault(); ev.stopPropagation(); zone.classList.add('rf-over'); }); });
    ['dragleave', 'drop'].forEach(function (e) { zone.addEventListener(e, function (ev) { ev.preventDefault(); ev.stopPropagation(); zone.classList.remove('rf-over'); }); });
    zone.addEventListener('drop', function (ev) { var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) onFile(f, kind); });
  }

  function msg(t, c) { msgEl.className = 'rf-msg' + (c ? ' rf-' + c : ''); msgEl.textContent = t || ''; }
  function zoneName(f) { return f.length > 28 ? f.slice(0, 25) + '...' : f; }

  /* ---------------- pdf.js ---------------- */
  function loadPdfjs() {
    return new Promise(function (res, rej) {
      if (window.pdfjsLib) return res();
      var s = document.createElement('script'); s.src = PDFJS_URL;
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {} res(); };
      s.onerror = function () { rej(new Error('pdf.js kon niet geladen worden (internet/firewall?)')); };
      document.head.appendChild(s);
    });
  }

  /* PDF inlezen -> formuliervelden (BL) + tekst-items met positie (PL) */
  function readPdf(buf) {
    return window.pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
      var jobs = [], p;
      for (p = 1; p <= pdf.numPages; p++) {
        jobs.push(pdf.getPage(p).then(function (page) { return Promise.all([page.getAnnotations(), page.getTextContent()]); }));
      }
      return Promise.all(jobs).then(function (pages) {
        var fields = {}, items = [];
        pages.forEach(function (pr, pi) {
          pr[0].forEach(function (a) { if (a.fieldName !== undefined && a.fieldValue != null && a.fieldValue !== '' && !(a.fieldName in fields)) fields[a.fieldName] = a.fieldValue; });
          pr[1].items.forEach(function (it) { if (it.str.trim()) items.push({ p: pi, x: it.transform[4], y: it.transform[5], s: it.str.trim() }); });
        });
        return { fields: fields, items: items, text: items.map(function (i) { return i.s; }).join(' ') };
      });
    });
  }

  function clean(s) { return String(s).replace(/,/g, ''); }
  /* Robuuste getal-parser: begrijpt zowel punt- als komma-decimalen en duizendtal-
     scheidingstekens. "22076,00"->22076, "246,360"->246360, "25.200,00"/"25,200.00"->25200,
     "21720.000"->21720. (Komma gevolgd door exact 3 cijfers = duizendtal; anders decimaal.) */
  function toNum(s) {
    var t = String(s).replace(/[^\d.,]/g, ''); if (!t) return NaN;
    var hasC = t.indexOf(',') >= 0, hasD = t.indexOf('.') >= 0;
    if (hasC && hasD) { if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(/,/g, '.'); else t = t.replace(/,/g, ''); }
    else if (hasC) { var p = t.split(','); if (p.length > 2) t = p.join(''); else if (p[1] && p[1].length === 3) t = p.join(''); else t = p.join('.'); }
    else if (hasD) { var pd = t.split('.'); if (pd.length > 2) t = pd.join(''); }
    return parseFloat(t);
  }
  function num(s) { var n = toNum(s); return isNaN(n) ? null : n; }
  function fmt(s) { var n = toNum(s); return isNaN(n) ? (s || '') : n.toFixed(2); }

  /* ---------------- OCR (voor beeld-/gescande BL's zonder tekstlaag) ----------------
     De data staat als afbeelding in de PDF: pdf.js rendert elke pagina naar een
     canvas, Tesseract.js (lokaal in de browser, van CDN) herkent de tekst. Traag en
     niet 100% exact — daarom corrigeer je nadien in de bewerkbare tabel.
     Let op: pdf.js' render-promise blijft bij sommige PDF's "hangen" terwijl het
     canvas tóch (traag) invult — daarom pollen we op inhoud i.p.v. de promise.    */
  var TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  function loadTesseract() {
    return new Promise(function (res, rej) {
      if (window.Tesseract) return res();
      var s = document.createElement('script'); s.src = TESS_URL;
      s.onload = res; s.onerror = function () { rej(new Error('OCR-bibliotheek kon niet laden (internet/firewall?)')); };
      document.head.appendChild(s);
    });
  }
  function canvasHasInk(ctx, c) {
    try { var d = ctx.getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 0; i < d.length; i += 4) { if (d[i] < 120) { if (++n > 500) return true; } } } catch (e) {}
    return false;
  }
  function ocrLines(file, onProg) {
    return loadTesseract()
      .then(function () { return file.arrayBuffer(); })
      .then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
      .then(async function (pdf) {
        var lines = [];
        for (var p = 1; p <= pdf.numPages; p++) {
          onProg('OCR: pagina ' + p + '/' + pdf.numPages + ' voorbereiden…');
          var page = await pdf.getPage(p);
          var vp = page.getViewport({ scale: 2 });
          var canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.cssText = 'position:fixed;left:-99999px;top:0'; document.body.appendChild(canvas);
          var ctx = canvas.getContext('2d');
          page.render({ canvasContext: ctx, viewport: vp });                 /* promise niet awaiten (kan hangen) */
          var ok = false;
          for (var w = 0; w < 25 && !ok; w++) { await sleep(800); ok = canvasHasInk(ctx, canvas); }
          if (ok) {
            await sleep(600);
            var res = await window.Tesseract.recognize(canvas, 'eng', { logger: function (m) { if (m.status === 'recognizing text') onProg('OCR: pagina ' + p + '/' + pdf.numPages + ' — ' + Math.round((m.progress || 0) * 100) + '%'); } });
            (res.data.text || '').split(/\r?\n/).forEach(function (l) { var t = l.trim(); if (t) lines.push(t); });
          }
          canvas.remove();
        }
        return lines;
      });
  }

  /* ---------------- Bill of Lading (formuliervelden) ---------------- */
  function isBL(fields) { return Object.keys(fields).some(function (k) { return /^rmarks\d+$/.test(k); }); }
  function joinFields(fields, re) { return Object.keys(fields).filter(function (k) { return re.test(k); }).sort().map(function (k) { return fields[k]; }).join('\n'); }
  function parseBL(fields) {
    var marks = joinFields(fields, /^rmarks\d+$/);
    var gross = joinFields(fields, /^rgross\d+$/);
    var desc  = joinFields(fields, /^rdesc\d+$/);
    var re = /([A-Z]{4}\d{7})\/[^\r\n]*?\/(\d+)[\r\n]+\s*Seal:\s*([A-Za-z0-9\-\/]+)/g;
    var cs = [], m;
    while ((m = re.exec(marks))) cs.push({ num: m[1], seal: m[3] });
    var grossList = (gross.match(/([\d.,]+)\s*kg/gi) || []).map(function (s) { return clean(s.replace(/[^\d.,]/g, '')); });
    var qtyList   = (desc.match(/(\d+)\s*FLEXI\s*TANK/gi) || []).map(function (s) { return (s.match(/\d+/) || ['1'])[0]; });
    return cs.map(function (c, i) { return { num: c.num, seal: c.seal, qty: qtyList[i] || '1', gross: grossList[i] || '' }; });
  }

  /* tekst-items -> regels heropbouwen, PER PAGINA (pagina's delen dezelfde
     y-range; door pagina in de sleutel te houden lopen ze niet door elkaar) */
  function toLines(items) {
    var arr = items.slice().sort(function (a, b) { return ((a.p || 0) - (b.p || 0)) || (b.y - a.y) || (a.x - b.x); });
    var lines = [], cur = null;
    arr.forEach(function (it) {
      if (!cur || cur.p !== (it.p || 0) || Math.abs(cur.y - it.y) > 5) { cur = { p: (it.p || 0), y: it.y, items: [it] }; lines.push(cur); }
      else cur.items.push(it);
    });
    return lines.map(function (l) { return l.items.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(' ').replace(/\s+/g, ' ').trim(); });
  }

  /* ---------------- Packing List (tekstlaag) ----------------
     Werkt over verschillende PL-indelingen. Per regel met een container:
       - Seal = token direct na het containernummer (mag numeriek zijn, bv. CMA).
       - Gewichten = de getallen ná de seal. Gross = grootste getal; Net = het
         grootste getal dat KLEINER is dan Gross maar minstens de helft ervan
         (zo wordt de tarra/"empty" en een S-NO/qty niet als Net genomen — Net
         wordt dus gekozen t.o.v. de Gross).
       - Eenheid: als het grootste gewicht < 1000 staat de PL in ton (MT); dan
         ×1000 naar kg (bv. CMA 23.64 MT -> 23640 kg, Net 21.45 -> 21450).       */
  function parsePL(items) { return parsePLlines(toLines(items)); }
  function parsePLlines(lines) {
    var rows = [], seen = {};
    lines.forEach(function (line) {
      var toks = line.split(/\s+/), ci = -1, i;
      for (i = 0; i < toks.length; i++) { if (/^[A-Z]{4}\d{7}$/.test(toks[i].replace(/[^A-Za-z0-9]/g, ''))) { ci = i; break; } }
      if (ci < 0) return;
      var num = toks[ci].replace(/[^A-Za-z0-9]/g, '').match(/([A-Z]{4}\d{7})/)[1]; if (seen[num]) return; seen[num] = 1;
      var seal = (toks[ci + 1] || '').replace(/[^A-Za-z0-9\-\/]/g, '');
      var nums = [];
      for (var j = ci + 2; j < toks.length; j++) { var v = toNum(toks[j]); if (!isNaN(v)) nums.push(v); }
      if (!nums.length) { rows.push({ num: num, seal: seal, qty: '1', net: '', gross: '' }); return; }
      var gross = Math.max.apply(null, nums);
      var scale = gross < 1000 ? 1000 : 1;                                    /* MT -> kg */
      var netC = nums.filter(function (n) { return n < gross && n >= gross * 0.5; });
      var net = netC.length ? Math.max.apply(null, netC) : '';
      rows.push({ num: num, seal: seal, qty: '1', net: net === '' ? '' : (net * scale).toFixed(3), gross: (gross * scale).toFixed(3) });
    });
    return rows;
  }

  /* ---------------- Draft/tekst-BL (geen formuliervelden) ----------------
     Werkt over rederijen heen (MSC, Hapag-Lloyd, Maersk, CMA CGM, ...). Per blok:
       - container: 4 letters + 7 cijfers; spaties worden weggehaald vóór het
         matchen (pdf.js splitst soms binnenin, bv. "T GBU3783353").
       - Gross = het grootste gewicht mét decimalen op de container-regel (zo
         wordt de TARE-kolom, bv. CMA "23330.000 2180 25.000", niet meegenomen).
       - Pack QTY = getal vóór het verpakkingswoord (FLEXIBAG/BARREL/TANK/...).
       - Seal: (1) een aparte regel met enkel een seal-token (MSC), anders
         (2) het stuk na het woord SEAL op de seal-regel (Maersk "Shipper Seal :",
         CMA "SEAL 101496"), anders (3) een seal-token verderop (Hapag). Seals
         mogen numeriek zijn (CMA).
       - Net: staat bij sommige rederijen op de seal-regel (Hapag); anders leeg
         (dan komt Net uit Auto-fill-from-Products of de PL).                    */
  var CNRAW = /([A-Z]{4}\d{7})/;
  var PKG = /(\d+)\s*(?:FLEXI\s*BAG|FLEXIBAG|FLEXI\s*TANK|FLEXITANK|TANK|BARREL|DRUM|BAG|PALLET|CARTON|PACKAGE|PIECE|PCS|UNIT|CASE|CTN|IBC)S?\b/i;
  var KW  = /^(CRUDE|PALM|KERNEL|OIL|EDIBLE|GRADE|KGM|KGS|KG|CBM|MT|NUMBER|QUANTITY|SEAL|SEALS|TARE|MARKS|NOS|HS|CODE|NET|GROSS|WEIGHT|CONT|DRY|VAN|FCL|TOTAL|SAID|CONTAIN|GLUCOSE|STANDARD|RECTANGULAR|SHIPPER|STOW|COUNT|LOAD|CONTAINER|CONTAINERS|WITH|HEATING|PADS|COPY|DRAFT|VERIFY|ORIGINAL|ST|GP|SLAC|IBCS|SB|DT|STEARIN|RBD|GENERAL|PURPOSE|FLEXIBLE|BAG|BAGS)$/i;
  var SEALTOK = /^[A-Za-z]{2,4}[A-Za-z0-9\-]{3,}$/;
  function despace(l) { return String(l).replace(/\s+/g, ''); }
  function contNum(line) { var m = despace(line).match(CNRAW); return m ? m[1] : ''; }
  function weights(s) { return (String(s).match(/\d[\d.,]*/g) || []).map(toNum).filter(function (n) { return n >= 1000; }); }
  function lastWeight(s) { var w = weights(s); return w.length ? w[w.length - 1] : null; }
  function grossOf(line) {
    var dec = (String(line).match(/\d[\d.,]*[.,]\d+/g) || []).map(toNum).filter(function (n) { return n >= 1000; });
    if (dec.length) return Math.max.apply(null, dec);   /* Gross heeft decimalen; TARE meestal niet */
    return lastWeight(line);
  }
  function isCont(l) { return CNRAW.test(despace(l)) && (PKG.test(l) || /\d{3,}[.,]\d/.test(l) || /\bKGS?\b|\bKGM\b/i.test(l)); }
  function firstSeal(str) {
    var toks = String(str).split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      var raw = toks[i]; if (/\d[.,]\d/.test(raw)) continue;                 /* gewicht */
      var tk = raw.replace(/[^A-Za-z0-9\-]/g, '');
      if (!tk || KW.test(tk) || /^[A-Z]{4}\d{7}$/.test(tk)) continue;        /* leeg/keyword/container */
      if ((SEALTOK.test(tk) && /\d/.test(tk)) || /^\d{4,}$/.test(tk)) return tk;
    }
    return '';
  }
  /* eerste token van een regel als het een geldig seal-token is (voor meerdere
     seals onder een "SEALS:"-kop, elk op een eigen regel — Hapag) */
  function leadingSeal(line) {
    var tk = String(line).trim().split(/\s+/)[0]; if (!tk) return '';
    tk = tk.replace(/[^A-Za-z0-9\-]/g, '');
    if (!tk || KW.test(tk) || /^[A-Z]{4}\d{7}$/.test(tk) || /\d[.,]\d/.test(tk)) return '';
    if ((SEALTOK.test(tk) && /\d/.test(tk)) || /^\d{4,}$/.test(tk)) return tk;
    return '';
  }
  function sealNet(block) {
    var s = -1; for (var i = 0; i < block.length; i++) { if (/SEAL/i.test(block[i])) { s = i; break; } }
    /* Meervoud "SEALS:" met elke seal op een eigen volgregel -> samenvoegen met ";" */
    if (s >= 0 && /\bSEALS\b/i.test(block[s])) {
      var seals = [], netv = '';
      for (var k = s + 1; k < block.length; k++) {
        if (isCont(block[k])) break;
        var ls = leadingSeal(block[k]); if (!ls) break;
        seals.push(ls);
        if (!netv) { var wv = weights(block[k].replace(ls, ' ')); if (wv.length) netv = wv[0].toFixed(3); }
      }
      if (seals.length) return { seal: seals.join(';'), net: netv };
    }
    if (s < 0) return { seal: firstSeal(block[0]), net: '' };   /* geen "SEAL"-woord (bv. Maersk-variant): seal-token van de containerregel */
    var j, sv;
    for (j = s + 1; j <= s + 2 && j < block.length; j++) {                   /* 1) aparte seal-regel (MSC) */
      var t = block[j].trim(); if (t.split(/\s+/).length === 1) { sv = firstSeal(t); if (sv) return { seal: sv, net: '' }; }
    }
    var after = block[s].replace(/^.*?\bSEALS?\b[^A-Za-z0-9]*(?:NUMBER[^A-Za-z0-9]*)?/i, '');   /* 2) na "SEAL" op de regel (Maersk/CMA) */
    sv = firstSeal(after); if (sv) { var nw = lastWeight(after.replace(sv, ' ')); return { seal: sv, net: nw != null ? nw.toFixed(3) : '' }; }
    for (j = s; j <= s + 2 && j < block.length; j++) {                       /* 3) seal-token verderop (Hapag, met net) */
      sv = firstSeal(block[j]); if (sv) { var nw2 = lastWeight(block[j].replace(sv, ' ')); return { seal: sv, net: nw2 != null ? nw2.toFixed(3) : '' }; }
    }
    return { seal: '', net: '' };
  }
  /* Sommige BL's zetten het Net niet op de seal-regel maar verderop in het blok
     (bv. MSC: "Tare Weight: ... ( 720 jerricans - 24480.000 kgs )"). We nemen het
     grootste gewicht dat < Gross is maar ≥ helft ervan (dus geen tarra), en stoppen
     bij juridische/afsluitende tekst zodat clausule-getallen niet meetellen.        */
  var STOP = /ADDITIONAL CLAUSES|ABOVE PARTICULARS|Continued on|SHIPPED ON BOARD|PLACE AND DATE|SIGNED on behalf|Proper Shipping|Carrier has no liability|^Total\s*:|^\d{1,3}\.\s/i;
  function blockNet(block, gv, sealTok) {
    if (!gv) return '';
    var sealNum = sealTok ? parseFloat((sealTok.match(/\d+/) || [''])[0]) : NaN;
    var cand = [];
    for (var i = 0; i < block.length && i < 12; i++) {
      if (i > 0 && STOP.test(block[i])) break;
      weights(block[i]).forEach(function (w) { if (w < gv - 0.001 && w >= gv * 0.5 && w !== sealNum) cand.push(w); });
    }
    return cand.length ? Math.max.apply(null, cand).toFixed(3) : '';
  }
  function parseBLlines(lines) {
    var idx = []; lines.forEach(function (l, i) { if (isCont(l)) idx.push(i); }); idx.push(lines.length);
    var rows = [], seen = {};
    for (var b = 0; b < idx.length - 1; b++) {
      var block = lines.slice(idx[b], idx[b + 1]);
      var num = contNum(block[0]); if (!num || seen[num]) continue; seen[num] = 1;
      var gw = grossOf(block[0]), gross = gw != null ? gw.toFixed(3) : '';
      var qm = block[0].match(PKG), qty = qm ? qm[1] : '1';
      var sn = sealNet(block);
      var net = sn.net || blockNet(block, gw, sn.seal);
      rows.push({ num: num, seal: sn.seal, qty: qty, net: net, gross: gross });
    }
    return rows;
  }
  function parseBLtext(items) { return parseBLlines(toLines(items)); }

  /* ---------------- documenten verwerken ---------------- */
  function applyBL(rows, text, file, viaOcr) {
    state.bl = rows; state.blViaOcr = !!viaOcr;
    var mbl = (text || '').match(/BILL\s+OF\s+LADING\s+No\.?\s*:?\s*([A-Z0-9]+)/i);
    state.blNumber = (mbl ? mbl[1] : '') || '';
    zoneBL.classList.remove('err'); zoneBL.classList.add('on');
    zoneBL.querySelector('small').textContent = zoneName(file.name) + ' (' + rows.length + (viaOcr ? ', OCR' : '') + ')';
  }
  function applyPL(rows, text, file, viaOcr) {
    state.pl = { rows: rows }; state.plViaOcr = !!viaOcr;
    var mb = (text || '').match(/B\/?L\s*No\.?\s*:?\s*([A-Z0-9]+)/i); state.plNumber = mb ? mb[1] : null;
    var mn = (text || '').match(/Total\s+Net\s+Weight\s+([\d.,]+)/i); state.plTotalNet = mn ? num(mn[1]) : null;
    zonePL.classList.remove('err'); zonePL.classList.add('on');
    zonePL.querySelector('small').textContent = zoneName(file.name) + ' (' + rows.length + (viaOcr ? ', OCR' : '') + ')';
  }
  /* Verwijzing naar de inzendmap: toont het mappad + een "kopieer"-knop zodat een
     collega een niet-leesbare BL daar kan plaatsen om te laten toevoegen. */
  function submitHtml(file) {
    return '<div style="margin-top:9px;font-size:12px;line-height:1.5;border-top:1px solid #e5eaef;padding-top:8px">' +
      'Lukt het inlezen niet? Plaats <b>' + zoneName(file ? file.name : 'de BL') + '</b> in de map ' +
      'zodat ze voor de volgende keer kan worden toegevoegd:<br>' +
      '<code style="display:inline-block;margin:4px 0;background:#f0f3f6;padding:3px 6px;border-radius:4px;font-size:11px;word-break:break-all">' + SUBMIT_DIR + '</code><br>' +
      '<span class="rf-copy" style="color:#4a90d9;cursor:pointer;text-decoration:underline">&#128203; Kopieer mappad</span>' +
      ' &middot; je kan de container ondertussen ook zelf in de tabel invullen en gewoon verdergaan.</div>';
  }
  function wireCopy(scope) {
    var c = (scope || msgEl).querySelector('.rf-copy'); if (!c) return;
    c.onclick = function () {
      try { navigator.clipboard.writeText(SUBMIT_DIR); c.textContent = '✓ Mappad gekopieerd'; }
      catch (e) { c.textContent = SUBMIT_DIR; }
    };
  }
  function offerOcr(kind, file) {
    var zone = kind === 'bl' ? zoneBL : zonePL;
    zone.classList.add('err'); zone.classList.remove('on'); zone.querySelector('small').textContent = file.name;
    if (kind === 'bl') state.bl = null; else state.pl = null;
    msgEl.className = 'rf-msg rf-warn';
    msgEl.innerHTML = 'Geen leesbare tekst in deze ' + (kind === 'bl' ? 'Bill of Lading' : 'Packing List') +
      ' — de gegevens staan als afbeelding/scan.<br><span class="rf-ocr">&#128196; Lees met tekstherkenning (OCR)</span>' +
      submitHtml(file);
    var b = msgEl.querySelector('.rf-ocr'); if (b) b.onclick = function () { runOcr(kind, file); };
    wireCopy(msgEl);
  }
  function runOcr(kind, file) {
    msg('OCR wordt gestart… de PDF-lezer + tekstherkenning worden eenmalig ingeladen (kan even duren).');
    ocrLines(file, function (p) { msg(p); }).then(function (lines) {
      var rows = kind === 'bl' ? parseBLlines(lines) : parsePLlines(lines);
      if (!rows.length) { msgEl.className = 'rf-msg rf-warn'; msgEl.innerHTML = 'OCR vond geen containers in dit document.' + submitHtml(file); wireCopy(msgEl); return; }
      var txt = lines.join(' ');
      if (kind === 'bl') applyBL(rows, txt, file, true); else applyPL(rows, txt, file, true);
      recompute();
    }).catch(function (err) { msg('OCR-fout: ' + (err && err.message ? err.message : err), 'err'); });
  }
  function onFile(file, kind) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { msg('Kies een PDF-bestand.', 'err'); return; }
    (kind === 'bl' ? zoneBL : zonePL).classList.remove('err');
    msg('Bezig met inlezen van "' + file.name + '"...');
    loadPdfjs()
      .then(function () { return file.arrayBuffer(); })
      .then(function (buf) { return readPdf(buf); })
      .then(function (r) {
        if (kind === 'bl') {
          var blRows = isBL(r.fields) ? parseBL(r.fields) : parseBLtext(r.items);   /* finale BL = velden, draft BL = tekst */
          if (!blRows.length) { offerOcr('bl', file); return; }
          applyBL(blRows, r.text, file, false);
        } else {
          var rows = parsePL(r.items);
          if (!rows.length) { offerOcr('pl', file); return; }
          applyPL(rows, r.text, file, false);
        }
        recompute();
      })
      .catch(function (err) { msg('Fout: ' + (err && err.message ? err.message : err), 'err'); });
  }

  /* ---------------- samenvoegen ---------------- */
  function recompute() {
    var bl = state.bl, pl = state.pl;
    if (!bl && !pl) { resEl.innerHTML = ''; return; }
    var plByNum = {}; if (pl) pl.rows.forEach(function (r) { plByNum[r.num] = r; });
    var blByNum = {}; if (bl) bl.forEach(function (r) { blByNum[r.num] = r; });
    var order = bl ? bl.map(function (r) { return r.num; }) : pl.rows.map(function (r) { return r.num; });
    var netCount = 0, sealDiffs = 0, grossDiffs = 0;
    var rows = order.map(function (n) {
      var b = blByNum[n], p = plByNum[n];
      var r = {
        num: n,
        sealBL: b ? b.seal : '',
        sealPL: p ? p.seal : '',
        qty: (b && b.qty) || (p && p.qty) || '1',
        gross: (b && b.gross) || (p && p.gross) || '',
        grossPL: p ? p.gross : '',
        net: (p && p.net) ? p.net : ((b && b.net) ? b.net : '')   /* PL wint; anders BL-net (bv. Hapag); anders leeg */
      };
      if (r.net) netCount++;
      if (b && p && r.sealBL && r.sealPL && r.sealBL !== r.sealPL) sealDiffs++;
      if (b && p && r.gross && r.grossPL && Math.abs(num(r.gross) - num(r.grossPL)) > 0.5) grossDiffs++;
      return r;
    });
    render(rows, { netCount: netCount, sealDiffs: sealDiffs, grossDiffs: grossDiffs, both: !!(bl && pl) });
  }

  /* ---------------- voorbeeld + knop ---------------- */
  function usePLseal() { var cb = box.querySelector('#rf-plseal'); return cb && cb.checked; }
  function effectiveSeal(r) {
    if (r.sealBL && r.sealPL) return (usePLseal() && r.sealPL) ? r.sealPL : r.sealBL;
    return r.sealBL || r.sealPL;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function cellInput(f, val, cls, title) {
    return '<input class="rf-c' + (cls ? ' ' + cls : '') + '" data-f="' + f + '" value="' + esc(val) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>';
  }
  function rowHtml(r, k, stat) {
    var sealDiff = stat.both && r.sealBL && r.sealPL && r.sealBL !== r.sealPL;
    var sealVal = r.seal != null ? r.seal : effectiveSeal(r);
    var sealTitle = sealDiff ? 'BL: ' + r.sealBL + '  /  PL: ' + r.sealPL : '';
    return '<tr><td class="idx">' + (k + 1) + '</td>' +
      '<td>' + cellInput('num', r.num, '') + '</td>' +
      '<td' + (sealDiff ? ' class="flag"' : '') + '>' + cellInput('seal', sealVal, '', sealTitle) + '</td>' +
      '<td>' + cellInput('qty', r.qty || '1', 'rf-cn') + '</td>' +
      '<td>' + cellInput('net', r.net ? fmt(r.net) : '', 'rf-cn' + (r.net ? '' : ' miss')) + '</td>' +
      '<td>' + cellInput('gross', r.gross ? fmt(r.gross) : '', 'rf-cn') + '</td>' +
      '<td><span class="rf-del" title="Rij verwijderen">&times;</span></td></tr>';
  }

  /* lees de (evt. bewerkte) tabel terug uit het scherm */
  function readTable() {
    var out = [];
    [].forEach.call(resEl.querySelectorAll('table.rf-tb tbody tr'), function (tr) {
      function g(f) { var e = tr.querySelector('[data-f="' + f + '"]'); return e ? e.value.trim() : ''; }
      var numv = g('num'); if (!numv) return;
      out.push({ num: numv, seal: g('seal'), qty: g('qty') || '1', net: g('net') ? fmt(g('net')) : '', gross: g('gross') ? fmt(g('gross')) : '' });
    });
    return out;
  }
  function refreshTotals() {
    var rows = readTable(), sn = 0, sg = 0;
    rows.forEach(function (r) { sn += num(r.net) || 0; sg += num(r.gross) || 0; });
    var el = box.querySelector('#rf-totvals'); if (el) el.textContent = rows.length + ' containers · Net: ' + fmt(sn) + ' · Gross: ' + fmt(sg);
    var b = box.querySelector('.rf-btn'); if (b && !b.disabled) b.textContent = 'Vul ' + rows.length + ' containers in Sequoia';
  }

  function render(rows, stat) {
    var html = '<table class="rf-tb"><thead><tr><th>#</th><th>Container</th><th>Seal</th><th>Qty</th><th>Net</th><th>Gross</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r, k) { html += rowHtml(r, k, stat); });
    html += '</tbody></table>';
    html += '<span class="rf-add">+ rij toevoegen</span>';
    html += '<div class="rf-hint">Alle cellen zijn aanpasbaar — corrigeer gerust vóór je invult.</div>';
    if (stat.sealDiffs) html += '<label class="rf-opt"><input type="checkbox" id="rf-plseal">Bij verschil de <b>&nbsp;Packing-List-seal</b>&nbsp; gebruiken i.p.v. de BL-seal</label>';
    html += '<div class="rf-tot"><b id="rf-totvals"></b>' + (stat.both ? ' (BL + Net uit PL)' : (state.bl ? ' (uit BL)' : ' (uit PL)')) + '</div>';
    resEl.innerHTML = html;

    var warn = [];
    if (state.blViaOcr || state.plViaOcr) warn.push('⚠ Via OCR (tekstherkenning) ingelezen — controleer ALLE waarden, er kunnen leesfouten in zitten (bv. O/0, I/1).');
    if (!state.bl) warn.push('Geen Bill of Lading geladen: containers komen uit de Packing List.');
    if (!state.pl) warn.push('Geen Packing List geladen: Net ontbreekt. Je kan al invullen; Net vul je later aan (of laat de PL erin vallen).');
    if (state.pl && stat.netCount < rows.length) warn.push('Net gekoppeld voor ' + stat.netCount + '/' + rows.length + ' containers.');
    if (stat.sealDiffs) warn.push(stat.sealDiffs + ' seal(s) verschillen tussen BL en PL (oranje) — controleer/corrigeer in de tabel.');
    if (stat.grossDiffs) warn.push(stat.grossDiffs + ' gross-gewicht(en) verschillen tussen BL en PL.');
    if (state.plTotalNet != null && Math.abs(state.plTotalNet - (readTableSum())) > 1) warn.push('Som Net wijkt af van PL-totaal (' + fmt(state.plTotalNet) + ') — controleer.');
    if (state.blNumber && state.plNumber && state.blNumber.replace(/\W/g, '') !== state.plNumber.replace(/\W/g, '')) warn.push('Let op: BL-nummer (' + state.blNumber + ') en PL-B/L-nummer (' + state.plNumber + ') verschillen.');
    if (warn.length) msg(warn.join('\n'), 'warn'); else msg('Alles gekoppeld en gecontroleerd. Cellen zijn aanpasbaar.', 'ok');

    var btn = document.createElement('button'); btn.className = 'rf-btn';
    resEl.appendChild(btn);
    var cb = box.querySelector('#rf-plseal'); if (cb) cb.onchange = function () { recompute(); };

    /* interacties: live totalen, rij verwijderen, rij toevoegen */
    resEl.querySelector('table.rf-tb').addEventListener('input', refreshTotals);
    resEl.addEventListener('click', function (ev) {
      if (ev.target.classList.contains('rf-del')) { var tr = ev.target.closest('tr'); if (tr) { tr.remove(); renumber(); refreshTotals(); } }
    });
    resEl.querySelector('.rf-add').onclick = function () {
      var tb = resEl.querySelector('table.rf-tb tbody');
      var tmp = document.createElement('tbody'); tmp.innerHTML = rowHtml({ num: '', seal: '', qty: '1', net: '', gross: '' }, tb.children.length, {});
      tb.appendChild(tmp.firstChild); renumber(); refreshTotals();
    };
    function renumber() { [].forEach.call(resEl.querySelectorAll('table.rf-tb tbody tr td.idx'), function (td, i) { td.textContent = (i + 1); }); }

    refreshTotals();
    btn.onclick = function () {
      var out = readTable();
      if (!out.length) { msg('Geen rijen om in te vullen.', 'err'); return; }
      btn.disabled = true; btn.textContent = 'Bezig met invullen...';
      Promise.resolve(fill(out)).then(function (ok) {
        if (ok) { btn.textContent = '✓ Ingevuld'; if (msgEl.className.indexOf('rf-warn') < 0) msg('Klaar. Controleer de rijen en klik zelf op Save in Sequoia.', 'ok'); }
        else { btn.disabled = false; refreshTotals(); }
      });
    };
  }
  function readTableSum() { var s = 0; readTable().forEach(function (r) { s += num(r.net) || 0; }); return s; }

  /* ---------------- Sequoia-formulier vullen (Vue-app!) ----------------
     - Rijen bijmaken via de ECHTE "Add new Container"-knop (één per keer + settle).
       Zelf DOM-rijen klonen werkt niet: Vue negeert die en Save bewaart ze niet.
     - Waarden via een 'input'-event -> Vue v-model -> opslag + juiste totalen.
     - Lege waarden worden NIET geschreven (zo overschrijft een BL-only run geen
       bestaand Net). We verwijderen NOOIT rijen (Delete wist serverzijdig) en
       slaan NOOIT zelf op.                                                */
  function rowUnits() { return [].slice.call(document.querySelectorAll('div.widget-box.ui-sortable-handle')).filter(function (w) { return w.querySelector('[id^="inputContainerNumber_"]'); }); }
  function hasData(w) { var e = w.querySelector('[id^="inputContainerNumber_"]'); return e && e.value.trim() !== ''; }
  function addButton() { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return /add new container/i.test(b.textContent || ''); })[0]; }
  function autoFillButton() { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return /auto fill from products/i.test(b.textContent || ''); })[0]; }
  function setV(w, suffix, val) {
    if (val === '' || val == null) return false;
    var el = w.querySelector('[id^="inputContainer' + suffix + '_"]'); if (!el) return false;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitCount(min, ms) { return new Promise(function (res) { var t0 = Date.now(); (function loop() { if (rowUnits().length >= min || Date.now() - t0 > ms) return res(); setTimeout(loop, 40); })(); }); }

  function fill(rows) {
    var add = addButton();
    if (rowUnits().length === 0 && !add) {
      if (autoFillButton()) msg('Deze order heeft nog geen containerrijen. Klik in Sequoia eerst op "Auto fill from Products" (dat maakt de rijen aan en vult Pack QTY/Net vanuit de order), en klik daarna opnieuw op deze knop.', 'err');
      else msg('Kon het Containers-formulier niet vinden. Sta je op het juiste tabblad, met minstens één containerrij?', 'err');
      return Promise.resolve(false);
    }
    var filled = rowUnits().filter(hasData);
    if (filled.length) {
      if (!confirm('Deze order heeft al ' + filled.length + ' ingevulde container(s).\nDe waarden worden overschreven met de ' + rows.length + ' containers uit de documenten. Doorgaan?')) return Promise.resolve(false);
    }
    return (async function () {
      var guard = 0;
      while (rowUnits().length < rows.length && guard < rows.length + 10) {
        var n = rowUnits().length;
        var b = addButton(); if (b) b.click();
        await waitCount(n + 1, 3000);
        await sleep(250);
        guard++;
      }
      var u = rowUnits();
      if (u.length < rows.length) { msg('Kon niet genoeg rijen aanmaken (' + u.length + '/' + rows.length + '). Probeer opnieuw.', 'err'); return false; }
      for (var k = 0; k < rows.length; k++) {
        setV(u[k], 'Number',      rows[k].num);
        setV(u[k], 'SealNumber',  rows[k].seal);
        setV(u[k], 'PackQty',     rows[k].qty);
        setV(u[k], 'NetWeight',   rows[k].net);
        setV(u[k], 'GrossWeight', rows[k].gross);
      }
      await sleep(300);
      var extra = rowUnits().length - rows.length;
      if (extra > 0) { msg('Ingevuld. Let op: er staan nog ' + extra + ' extra containerrij(en). Verwijder die zelf met de rode Delete-knop vóór je opslaat.', 'warn'); }
      return true;
    })();
  }
})();
