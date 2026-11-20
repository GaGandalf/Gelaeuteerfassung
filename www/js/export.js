// ===== Datei-Ausgabe: Excel, Text, JSON =====
// Android-App: Datei ablegen und über das Teilen-Menü weitergeben; sonst normaler Browser-Download.
async function offerFile(filename, blob) {
  // Android-App (Capacitor)
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem) {
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      const w = await cap.Plugins.Filesystem.writeFile({ path: filename, data: b64, directory: 'CACHE' });
      await cap.Plugins.Share.share({ title: filename, url: w.uri, dialogTitle: 'Datei speichern oder senden' });
    } catch (e) { if (!String(e && e.message).toLowerCase().includes('cancel')) toast('Datei konnte nicht weitergegeben werden.'); }
    return;
  }
  // Browser / PWA
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ===== Excel-Export auf Basis "Glockendaten_Basis.xlsx" =====
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colN = (L) => [...L].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);

async function buildXlsx() {
  const bin = Uint8Array.from(atob(BASIS_B64), (c) => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(bin);
  const P = new DOMParser(), S = new XMLSerializer();
  const sheet = P.parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'), 'application/xml');
  const sst = P.parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml');
  const table = P.parseFromString(await zip.file('xl/tables/table1.xml').async('string'), 'application/xml');

  const sstRoot = sst.documentElement;
  const sstIndex = new Map();
  [...sstRoot.getElementsByTagNameNS(NS, 'si')].forEach((si, i) => sstIndex.set(si.textContent, i));
  const strIdx = (text) => {
    if (sstIndex.has(text)) return sstIndex.get(text);
    const si = sst.createElementNS(NS, 'si'); const t = sst.createElementNS(NS, 't');
    t.setAttribute('xml:space', 'preserve'); t.textContent = text; si.appendChild(t); sstRoot.appendChild(si);
    const i = sstIndex.size; sstIndex.set(text, i); return i;
  };

  const sheetData = sheet.getElementsByTagNameNS(NS, 'sheetData')[0];
  const rowEl = (r) => {
    let el = [...sheetData.getElementsByTagNameNS(NS, 'row')].find((x) => Number(x.getAttribute('r')) === r);
    if (!el) { el = sheet.createElementNS(NS, 'row'); el.setAttribute('r', r); sheetData.appendChild(el); }
    return el;
  };
  const cellEl = (r, c) => {
    const row = rowEl(r), ref = colL(c) + r;
    const cells = [...row.getElementsByTagNameNS(NS, 'c')];
    let el = cells.find((x) => x.getAttribute('r') === ref);
    if (el) return el;
    el = sheet.createElementNS(NS, 'c'); el.setAttribute('r', ref);
    // Stil der letzten Vorlagenspalte (G) übernehmen
    const tpl = cells.find((x) => x.getAttribute('r') === 'G' + r) || cells[cells.length - 1];
    if (tpl && tpl.getAttribute('s')) el.setAttribute('s', tpl.getAttribute('s'));
    const after = cells.find((x) => colN(x.getAttribute('r').replace(/\d+/g, '')) > c);
    row.insertBefore(el, after || null);
    return el;
  };
  const setCell = (r, c, v) => {
    const el = cellEl(r, c);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.removeAttribute('t');
    if (v === '' || v === null || v === undefined) return;
    const vEl = sheet.createElementNS(NS, 'v');
    if (typeof v === 'number') vEl.textContent = String(v);
    else { el.setAttribute('t', 's'); vEl.textContent = String(strIdx(String(v))); }
    el.appendChild(vEl);
  };

  const g = state.g, n = g.bells.length, cols = Math.max(5, n), lastCol = 2 + cols;
  setCell(2, 3, `a' = ${a1()}Hz`);
  const comp = g.bells.map((b) => computeBell(b, a1()));
  for (let i = 0; i < cols; i++) {
    const c = 3 + i;
    setCell(3, c, String(i + 1));
    OV_ROWS.forEach((row, k) => setCell(4 + k, c, g.bells[i] ? row.get(g.bells[i], comp[i]) : ''));
  }

  if (cols > 5) {
    const L = colL(lastCol);
    sheet.getElementsByTagNameNS(NS, 'dimension')[0]?.setAttribute('ref', `B2:${L}54`);
    [...sheetData.getElementsByTagNameNS(NS, 'row')].forEach((r) => r.hasAttribute('spans') && r.setAttribute('spans', `2:${lastCol}`));
    const colDef = [...sheet.getElementsByTagNameNS(NS, 'col')].find((x) => x.getAttribute('min') === '3');
    if (colDef) colDef.setAttribute('max', String(lastCol));
    const tRoot = table.documentElement;
    tRoot.setAttribute('ref', `B3:${L}18`);
    const af = tRoot.getElementsByTagNameNS(NS, 'autoFilter')[0];
    af.setAttribute('ref', `B3:${L}18`);
    const tcs = tRoot.getElementsByTagNameNS(NS, 'tableColumns')[0];
    const existing = [...tcs.getElementsByTagNameNS(NS, 'tableColumn')];
    existing.forEach((x) => x.removeAttribute('totalsRowFunction'));
    for (let i = 6; i <= cols; i++) {
      const tc = table.createElementNS(NS, 'tableColumn');
      tc.setAttribute('id', String(i + 1)); tc.setAttribute('name', String(i));
      tcs.appendChild(tc);
      const fc = table.createElementNS(NS, 'filterColumn');
      fc.setAttribute('colId', String(i)); fc.setAttribute('hiddenButton', '1');
      af.appendChild(fc);
    }
    tcs.setAttribute('count', String(cols + 1));
  }
  const total = [...sstRoot.getElementsByTagNameNS(NS, 'si')].length;
  sstRoot.setAttribute('uniqueCount', String(total));
  sstRoot.setAttribute('count', String(total + 200));

  zip.file('xl/worksheets/sheet1.xml', S.serializeToString(sheet));
  zip.file('xl/sharedStrings.xml', S.serializeToString(sst));
  zip.file('xl/tables/table1.xml', S.serializeToString(table));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
$('btnExport').onclick = async () => {
  try {
    const blob = await buildXlsx();
    const name = slug(state.g.name || 'Geläut').replace(/-/g, '_');
    await offerFile(`Glockendaten_${name}.xlsx`, blob);
  } catch (e) { console.error(e); toast('Export fehlgeschlagen.'); }
};

// ===== Text-Export (z. B. für Mitteilungen) =====
// Ton in Glockenschreibweise: Oktave als ° ' '' …, Doppelnamen bleiben (cis'/des')
function toneLabel(name) {
  if (!name) return '';
  const first = name.split(';')[0].trim();
  const m = first.match(/^(\S+)(?:\s+([+-]\d+))?$/);
  if (!m) return tn(first);
  const d = m[2] ? Number(m[2]) : 0;
  return `${tn(m[1])} ${d > 0 ? '+' + d : d < 0 ? '-' + Math.abs(d) : '±0'}`;
}
const chNum = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
function roundKg(v) { const s = v < 100 ? 5 : v < 1000 ? 10 : 50; return Math.round(v / s) * s; }
function gelaeutText() {
  const out = [];
  state.g.bells.forEach((b, i) => {
    const r = computeBell(b, a1());
    const lines = [`*Glocke ${i + 1}*`];
    if ((b.name || '').trim()) lines.push(b.name.trim());
    if (r.rows.nominal.ton) lines.push(`Ton: ${toneLabel(r.rows.nominal.ton)}`);
    const g = num(b.gewicht);
    if (g) lines.push(`Gewicht: ${chNum(g)}kg`);
    else if (r.range) lines.push(`Gewicht: ca. ${chNum(roundKg(r.range[2].v))}kg`);
    const d = num(b.durchmesser);
    if (d) lines.push(`Durchmesser: ${chNum(d)}mm`);
    const jahr = String(b.gussjahr || '').trim(), giesser = String(b.giesser || '').trim();
    if (jahr && giesser) lines.push(`Gussjahr: ${jahr} von ${giesser}`);
    else if (jahr) lines.push(`Gussjahr: ${jahr}`);
    else if (giesser) lines.push(`Giesser: ${giesser}`);
    out.push(lines.join('\r\n'));
  });
  return out.join('\r\n\r\n') + '\r\n';
}
$('btnTxt').onclick = () => {
  const name = slug(state.g.name || 'Geläut').replace(/-/g, '_');
  offerFile(`Gelaeut_${name}.txt`, new Blob([gelaeutText()], { type: 'text/plain;charset=utf-8' }));
};
$('btnTxtCopy').onclick = async () => {
  const txt = gelaeutText().replace(/\r\n/g, '\n');
  try { await navigator.clipboard.writeText(txt); toast('Text kopiert.'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); toast(ok ? 'Text kopiert.' : 'Kopieren nicht möglich – bitte „Text (.txt)“ verwenden.');
  }
};

// JSON sichern / laden
$('btnJsonOut').onclick = () => {
  const body = { format: 'gelaeut-erfassung', version: 1, gelaeut: snapshotForSave() };
  offerFile(`Gelaeut_${slug(state.g.name || 'gelaeut')}.json`, new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
};
$('jsonIn').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    const g = j.gelaeut || j;
    if (!Array.isArray(g.bells)) throw new Error('format');
    state.g = { id: null, name: g.name || '', land: g.land || '', region: g.region || '', ort: g.ort || '', a1: g.a1 || 435, bells: g.bells.map((b) => ({ ...newBell(), ...b, f: { ...newBell().f, ...(b.f || {}) } })) };
    state.sel = 0; state.dirty = true; renderAll();
    toast('Geläut geladen. Mit „Geläut speichern“ in die Liste übernehmen.');
  } catch { toast('Die Datei ist kein gültiges Geläut (JSON).'); }
});
