// ===== Zustand, Darstellung, Eingaben und Speicher =====
const $ = (id) => document.getElementById(id);
const PKEYS = PARTIALS.filter((p) => !p.computed).map((p) => p.key);

// Schlüssel im Browser-Speicher (localStorage)
const LS = {
  draft: 'gelaeut-draft-v1', // aktuelles Geläut inkl. ungespeicherter Änderungen
  local: 'gelaeut-local-v1', // gespeicherte Geläute { id: geläut }
  open: 'gelaeut-tree-open', // aufgeklappte Gruppen in der Seitenleiste
  mode: 'gelaeut-mode', // Export als Ton / Hz / beides
  kaOpen: 'gelaeut-ka-open', // Klanganalyse auf- oder zugeklappt
};

function newBell() {
  return { name: '', gussjahr: '', giesser: '', durchmesser: '', gewicht: '', korrektur: '1', schlagton: '', f: Object.fromEntries(PKEYS.map((k) => [k, ''])) };
}
function newGelaeut() {
  return { id: null, name: '', land: 'CH', region: '', ort: '', a1: 435, bells: [newBell()] };
}
function demoGelaeut() {
  const base = { unterton: 193.2, prime: 389.1, terz: 462.5, quinte: 578, oktave: 776.4, dezime: 979, undezime: 1031, duodezime: 1166, doppeloktave: 1556 };
  const mk = (name, jahr, ratio, d, tweak) => {
    const b = newBell();
    Object.assign(b, { name, gussjahr: String(jahr), giesser: 'Beispielgiesserei', durchmesser: String(Math.round(d)) });
    for (const k of PKEYS) b.f[k] = (base[k] * ratio * (tweak[k] || 1)).toFixed(1);
    return b;
  };
  return {
    id: null, demo: true, name: 'Beispiel-Geläut', land: 'CH', region: 'Uri', ort: 'Beispielort', a1: 435,
    bells: [
      mk('Grosse Glocke', 1898, 1, 1110, {}),
      mk('Mittlere Glocke', 1898, Math.pow(2, 2 / 12), 985, { terz: 0.996, quinte: 1.004 }),
      mk('Kleine Glocke', 1923, Math.pow(2, 5 / 12), 828, { prime: 1.006, dezime: 0.995 }),
    ],
  };
}

const state = { g: null, sel: 0, dirty: false, saved: [], mode: 'ton' };

// ===== Hilfen =====
const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const fmtKg = (v) => (v === null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('de-CH'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200);
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function a1() { return Number(state.g.a1) || 435; }
function bell() { return state.g.bells[state.sel]; }
function saveDraft() { lsSet(LS.draft, { g: state.g, sel: state.sel, dirty: state.dirty }); }
function armButton(btn, label, fn) {
  // Zweistufige Bestätigung statt confirm()
  const reset = () => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = btn.dataset.label; };
  if (btn.dataset.armed) { reset(); fn(); return; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed) reset(); }, 3500);
}

// ===== Ungespeicherte Änderungen / Status =====
function setDirty(d) {
  state.dirty = d;
  if (d && state.g.demo) { state.g.demo = false; $('demoBanner').hidden = true; }
  const s = $('status');
  if (d) { s.textContent = 'Ungespeicherte Änderungen'; s.className = 'status dirty'; }
  else if (state.g.id) { s.textContent = 'Gespeichert'; s.className = 'status ok'; }
  else { s.textContent = 'Noch nicht gespeichert'; s.className = 'status'; }
  saveDraft();
}

// ===== Länder und Regionen =====
const LAENDER = {
  CH: { name: 'Schweiz', label: 'Kanton', regionen: ['Aargau', 'Appenzell Ausserrhoden', 'Appenzell Innerrhoden', 'Basel-Landschaft', 'Basel-Stadt', 'Bern', 'Freiburg', 'Genf', 'Glarus', 'Graubünden', 'Jura', 'Luzern', 'Neuenburg', 'Nidwalden', 'Obwalden', 'Schaffhausen', 'Schwyz', 'Solothurn', 'St. Gallen', 'Tessin', 'Thurgau', 'Uri', 'Waadt', 'Wallis', 'Zug', 'Zürich'] },
  DE: { name: 'Deutschland', label: 'Bundesland', regionen: ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'] },
  FR: {
    name: 'Frankreich', label: 'Departement',
    regionen: ['01 – Ain', '02 – Aisne', '03 – Allier', '04 – Alpes-de-Haute-Provence', '05 – Hautes-Alpes', '06 – Alpes-Maritimes', '07 – Ardèche', '08 – Ardennes', '09 – Ariège', '10 – Aube', '11 – Aude', '12 – Aveyron', '13 – Bouches-du-Rhône', '14 – Calvados', '15 – Cantal', '16 – Charente', '17 – Charente-Maritime', '18 – Cher', '19 – Corrèze', '2A – Corse-du-Sud', '2B – Haute-Corse', "21 – Côte-d'Or", "22 – Côtes-d'Armor", '23 – Creuse', '24 – Dordogne', '25 – Doubs', '26 – Drôme', '27 – Eure', '28 – Eure-et-Loir', '29 – Finistère', '30 – Gard', '31 – Haute-Garonne', '32 – Gers', '33 – Gironde', '34 – Hérault', '35 – Ille-et-Vilaine', '36 – Indre', '37 – Indre-et-Loire', '38 – Isère', '39 – Jura', '40 – Landes', '41 – Loir-et-Cher', '42 – Loire', '43 – Haute-Loire', '44 – Loire-Atlantique', '45 – Loiret', '46 – Lot', '47 – Lot-et-Garonne', '48 – Lozère', '49 – Maine-et-Loire', '50 – Manche', '51 – Marne', '52 – Haute-Marne', '53 – Mayenne', '54 – Meurthe-et-Moselle', '55 – Meuse', '56 – Morbihan', '57 – Moselle', '58 – Nièvre', '59 – Nord', '60 – Oise', '61 – Orne', '62 – Pas-de-Calais', '63 – Puy-de-Dôme', '64 – Pyrénées-Atlantiques', '65 – Hautes-Pyrénées', '66 – Pyrénées-Orientales', '67 – Bas-Rhin', '68 – Haut-Rhin', '69 – Rhône', '70 – Haute-Saône', '71 – Saône-et-Loire', '72 – Sarthe', '73 – Savoie', '74 – Haute-Savoie', '75 – Paris', '76 – Seine-Maritime', '77 – Seine-et-Marne', '78 – Yvelines', '79 – Deux-Sèvres', '80 – Somme', '81 – Tarn', '82 – Tarn-et-Garonne', '83 – Var', '84 – Vaucluse', '85 – Vendée', '86 – Vienne', '87 – Haute-Vienne', '88 – Vosges', '89 – Yonne', '90 – Territoire de Belfort', '91 – Essonne', '92 – Hauts-de-Seine', '93 – Seine-Saint-Denis', '94 – Val-de-Marne', "95 – Val-d'Oise", '971 – Guadeloupe', '972 – Martinique', '973 – Guyane', '974 – La Réunion', '976 – Mayotte'],
  },
  AT: { name: 'Österreich', label: 'Bundesland', regionen: ['Burgenland', 'Kärnten', 'Niederösterreich', 'Oberösterreich', 'Salzburg', 'Steiermark', 'Tirol', 'Vorarlberg', 'Wien'] },
};
const LAND_ORDER = ['CH', 'DE', 'FR', 'AT'];
function fillRegions() {
  const land = LAENDER[state.g.land];
  $('gRegionLabel').textContent = land ? land.label : 'Kanton / Bundesland';
  const sel = $('gRegion');
  sel.disabled = !land;
  sel.innerHTML = `<option value="">${land ? '— bitte wählen —' : 'zuerst Land wählen'}</option>` + (land ? land.regionen.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('') : '');
  sel.value = land && land.regionen.includes(state.g.region) ? state.g.region : '';
}

// ===== Darstellung =====
function renderAll() {
  $('gName').value = state.g.name || '';
  $('gOrt').value = state.g.ort || '';
  $('gLand').value = state.g.land || '';
  fillRegions();
  $('gA1').value = String(a1());
  $('demoBanner').hidden = !state.g.demo;
  renderBell(); renderSaved();
  setDirty(state.dirty);
}
// Alles, was von der gewählten Glocke oder der Glockenliste abhängt
function renderBell() { renderTabs(); renderBellForm(); renderComputed(); renderOverview(); }
function selectBell(i) { state.sel = i; renderBell(); saveDraft(); }

// Glockensilhouette (Krone, Schulter, Flanke, Schlagring); Grösse nach Durchmesser
const BELL_PATH = 'M44 4h12v7h-12z M50 11c-13 0-21 6-23 18-2 13-2 27-7 39-3 8-9 13-15 17-2 2-1 5 2 5h86c3 0 4-3 2-5-6-4-12-9-15-17-5-12-5-26-7-39-2-12-10-18-23-18z';
function bellSvg(scale, unknown) {
  const s = Math.max(0.42, Math.min(1, scale));
  return `<svg class="bell-ico${unknown ? ' unknown' : ''}" viewBox="0 0 100 92" style="width:${Math.round(64 * s)}px" aria-hidden="true"><path d="${BELL_PATH}"/></svg>`;
}

function renderTabs() {
  const el = $('tabs');
  const ds = state.g.bells.map((b) => num(b.durchmesser));
  const dmax = Math.max(0, ...ds.filter((d) => d > 0));
  el.innerHTML = state.g.bells.map((b, i) => {
    const r = computeBell(b, a1()), d = ds[i];
    const nom = r.rows.nominal.ton;
    return `<button type="button" class="tab" role="tab" aria-selected="${i === state.sel}" data-i="${i}">
      <span class="tab-pic">${bellSvg(d > 0 && dmax ? d / dmax : 0.6, !(d > 0))}</span>
      <span class="tab-txt"><b>${i + 1}</b>${nom ? `<em>${esc(tn(baseTone(nom)))}</em>` : ''}</span>
      <span class="tab-name">${esc(b.name || 'Ohne Namen')}</span>
      <small>${d > 0 ? `Ø ${fmtKg(d)} mm` : 'Ø —'}</small>
    </button>`;
  }).join('') + '<button type="button" class="tab add" id="btnAddBell"><span class="plus">+</span>Glocke hinzufügen</button>';
}
$('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.id === 'btnAddBell') {
    state.g.bells.push(newBell()); state.sel = state.g.bells.length - 1;
    setDirty(true); renderBell(); $('b_name').focus();
  } else selectBell(+t.dataset.i);
});

function renderBellForm() {
  const b = bell();
  for (const k of ['name', 'gussjahr', 'giesser', 'durchmesser', 'gewicht']) $('b_' + k).value = b[k] ?? '';
  $('b_korrektur').value = String(b.korrektur ?? '1');
  // Teilton-Tabelle: Eingabe | Bezug | Ton | Referenz | Referenz Hz | Abweichung
  $('ptBody').innerHTML = PARTIALS.map((p) => {
    const tonCell = `<td class="ton"><span id="c_${p.key}_t">—</span><small class="mref" id="c_${p.key}_mr"></small></td>`;
    const refCells = `<td class="ton dim c-rt" id="c_${p.key}_rt">—</td><td class="n num dim c-rhz" id="c_${p.key}_rh">—</td>`;
    if (p.computed) {
      return `<tr class="nom"><th>${p.label}<small>aus der Oktave</small></th><td class="n num" id="c_${p.key}_m">—</td><td class="n dim c-bez">—</td>${tonCell}${refCells}<td></td></tr>`;
    }
    return `<tr><th><label for="f_${p.key}">${p.label}</label>${p.note ? `<small>${p.note}</small>` : ''}</th>`
      + `<td class="n"><input class="in" id="f_${p.key}" data-f="${p.key}" inputmode="decimal" autocomplete="off" value="${esc(b.f[p.key])}"></td>`
      + `<td class="n num dim c-bez" id="c_${p.key}_b">—</td>${tonCell}${refCells}<td class="devc" id="c_${p.key}_d"></td></tr>`;
  }).join('');
  $('bellNo').textContent = `Glocke ${state.sel + 1} von ${state.g.bells.length}`;
  $('btnLeft').disabled = state.sel === 0;
  $('btnRight').disabled = state.sel === state.g.bells.length - 1;
  $('btnDel').disabled = state.g.bells.length === 1;
  if (window.KA) KA.showBell();
}

// Abweichung in 1/16-Halbtönen als Zahl und kleiner Balken (voller Ausschlag = 1 Halbton)
function devHtml(dev) {
  const a = Math.abs(dev), cls = a === 0 ? 'z' : a <= 4 ? 's' : 'l';
  const w = Math.min(a, 16) / 16 * 50;
  const pos = dev > 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
  const title = a === 0 ? 'genau auf dem Referenzton' : `${a}/16 Halbton ${dev > 0 ? 'höher' : 'tiefer'} als die Referenz`;
  return `<span class="devwrap" title="${title}"><span class="devbar ${cls}"><i style="${pos}"></i></span><span class="dev ${cls}">${dev > 0 ? '+' : dev < 0 ? '−' : '±'}${a}</span></span>`;
}

function renderComputed() {
  const b = bell();
  const r = computeBell(b, a1());
  $('bellTitle').textContent = b.name || 'Name der Glocke';
  for (const p of PARTIALS) {
    const row = r.rows[p.key];
    if (p.computed) $(`c_${p.key}_m`).textContent = fmt(row.measured, 2);
    else {
      $(`c_${p.key}_b`).textContent = fmt(row.bezug, 2);
      $(`c_${p.key}_d`).innerHTML = row.dev === null ? '' : devHtml(row.dev);
    }
    $(`c_${p.key}_t`).textContent = tn(row.ton) || '—';
    $(`c_${p.key}_rt`).textContent = tn(row.refTon) || '—';
    $(`c_${p.key}_mr`).textContent = row.refTon ? 'Ref. ' + tn(row.refTon) : '';
    $(`c_${p.key}_rh`).textContent = fmt(row.refHz, 2);
  }
  // Schlagton-Auswahl
  const sel = $('b_schlagton');
  const auto = DATA.rip.tones.includes(r.autoSchlag) ? r.autoSchlag : '';
  sel.innerHTML = `<option value="">${auto ? `automatisch (${esc(tn(auto))})` : 'automatisch (aus Nominal)'}</option>` +
    DATA.rip.tones.map((t) => `<option value="${esc(t)}">${esc(tn(t))}</option>`).join('');
  sel.value = b.schlagton || '';
  renderRippe(r, b);
}

// Rippe: Kennzahlen, RS-Skala mit Zeiger und Gewichtsvergleich
function renderRippe(r, b) {
  $('o_rs').textContent = r.rs === null ? '—' : r.rs.toFixed(2);
  $('o_klasse').textContent = r.klasse || '—';
  $('o_ripkg').innerHTML = r.ripKg !== null
    ? `<strong>${fmtKg(r.ripKg)} kg</strong> <span class="dim small">(Spalte D${r.ripGroup + 1}, Ø ${r.ripD} mm)</span>`
    : (r.rs === null ? '—' : '<span class="dim">ausserhalb der Rippentabelle</span>');
  const idx = ripKlasseIdx(r.rs);
  [...$('o_scale').querySelectorAll('.seg-z')].forEach((c, i) => c.classList.toggle('on', i === idx));
  // Skala von −12 bis +18 (fünf gleich breite Klassen à 6)
  const mark = $('o_rsMark');
  mark.hidden = r.rs === null;
  if (r.rs !== null) {
    const pct = Math.max(0, Math.min(100, ((r.rs + 12) / 30) * 100));
    mark.style.left = pct + '%';
    mark.querySelector('b').textContent = (r.rs > 0 ? '+' : '') + r.rs.toFixed(1);
  }
  renderWeight(r, b);
}

function renderWeight(r, b) {
  const box = $('o_wchart'), known = num(b.gewicht);
  $('o_range').innerHTML = r.range
    ? r.range.map((x) => `<tr class="${x.label === 'Mittel' ? 'mid' : ''}"><td>${x.label}</td><td class="n">${fmtKg(x.v)} kg</td></tr>`).join('')
    : '';
  if (!r.range) {
    box.innerHTML = '<p class="dim small wempty">Durchmesser und Oktave eingeben, dann erscheint hier die geschätzte Gewichtsspanne.</p>';
    return;
  }
  const [p11, p35, mid, m35, m11] = r.range.map((x) => x.v);
  const marks = [{ v: mid, cls: 'mid', label: 'Mittel', top: true }];
  if (r.ripKg !== null) marks.push({ v: r.ripKg, cls: 'rtab', label: 'Rippentabelle' });
  if (known > 0) marks.push({ v: known, cls: 'known', label: 'Bekanntes Gewicht' });
  const vals = [m11, p11, ...marks.map((m) => m.v)];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || hi * 0.1;
  const x0 = lo - pad, x1 = hi + pad, X = (v) => ((v - x0) / (x1 - x0)) * 100;
  // Beschriftung am Rand nach innen ausrichten, damit sie nicht abgeschnitten wird
  const edge = (x) => (x > 82 ? ' r' : x < 18 ? ' l' : '');
  const ticks = [[m11, '−11 %'], [m35, '−3.5 %'], [p35, '+3.5 %'], [p11, '+11 %']];
  box.innerHTML = `
    <div class="wtrack">
      <div class="wband outer" style="left:${X(m11)}%;width:${X(p11) - X(m11)}%" title="−11 % bis +11 %"></div>
      <div class="wband inner" style="left:${X(m35)}%;width:${X(p35) - X(m35)}%" title="−3.5 % bis +3.5 %"></div>
      ${ticks.map(([v, t]) => `<span class="wtick" style="left:${X(v)}%">${t}</span>`).join('')}
      ${marks.map((m) => `<div class="wmark ${m.cls}" style="left:${X(m.v)}%"><span class="${edge(X(m.v))}">${m.label}<b>${fmtKg(m.v)} kg</b></span></div>`).join('')}
    </div>`;
}

// Werte für Übersicht und Export
const OV_ROWS = [
  { label: 'Glockenname', get: (b) => b.name || '', txt: true },
  { label: 'Giesser', get: (b) => b.giesser || '', txt: true },
  { label: 'Gussjahr', get: (b) => num(b.gussjahr) ?? (b.gussjahr || '') },
  { label: 'Durchmesser [mm]', get: (b) => num(b.durchmesser) ?? '' },
  { label: 'Gewicht [kg]', get: (b) => num(b.gewicht) ?? '' },
  ...['nominal', 'unterton', 'prime', 'terz', 'quinte', 'oktave', 'dezime', 'undezime', 'duodezime', 'doppeloktave'].map((k) => ({
    label: { quinte: 'Quint' }[k] || PARTIALS.find((p) => p.key === k).label, key: k,
    get: (b, r) => partialValue(r.rows[k]),
  })),
];
function partialValue(row) {
  if (!row || row.measured === null) return '';
  const hz = Math.round(row.measured * 10) / 10;
  if (state.mode === 'hz') return hz;
  if (state.mode === 'beides') return row.ton ? `${tn(row.ton)} (${hz.toFixed(1)} Hz)` : `${hz.toFixed(1)} Hz`;
  return tn(row.ton) || '';
}
function renderOverview() {
  $('ovA1').textContent = `a′ = ${a1()} Hz`;
  const cols = Math.max(5, state.g.bells.length);
  const comp = state.g.bells.map((b) => computeBell(b, a1()));
  const cur = (i) => (i === state.sel ? ' cur' : '');
  let h = '<thead><tr><th class="lbl">Glocke</th>';
  for (let i = 0; i < cols; i++) {
    h += i < state.g.bells.length
      ? `<th class="${cur(i)}"><button type="button" data-i="${i}" title="Glocke ${i + 1} bearbeiten">${i + 1}</button></th>`
      : `<th class="dim">${i + 1}</th>`;
  }
  h += '</tr></thead><tbody>';
  for (const row of OV_ROWS) {
    h += `<tr class="${row.key === 'nominal' ? 'nom' : ''}"><th>${row.label}</th>`;
    for (let i = 0; i < cols; i++) {
      const b = state.g.bells[i];
      const v = b ? row.get(b, comp[i]) : '';
      h += `<td class="${row.txt ? 'txt' : ''}${cur(i)}">${esc(typeof v === 'number' && row.key ? v.toFixed(1) : v)}</td>`;
    }
    h += '</tr>';
  }
  $('ovTable').innerHTML = h + '</tbody>';
  renderMotiv();
}
$('ovTable').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-i]'); if (!btn) return;
  selectBell(+btn.dataset.i);
  $('sheet').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ===== Läutemotiv des Geläuts (aus den Nominalen) =====
// Nominale aller Glocken → Motiv-Analyse; ohne = Glockennummern ohne Nominal
function gelaeutMotiv() {
  const mit = [], ohne = [];
  state.g.bells.forEach((b, i) => {
    const idx = computeBell(b, a1()).rows.nominal.idx;
    if (idx === null) ohne.push(i + 1);
    else mit.push({ i, s: semitoneOfIdx(idx), ton: tn(baseTone(DATA.tones[idx])) });
  });
  return { mit, ohne, r: mit.length >= 2 ? motivAnalyse(mit) : null };
}
// Für den Export: „Gloria auf g'“ oder '' wenn kein Motiv gefunden
function motivText() {
  const { r } = gelaeutMotiv();
  return r && r.ganz ? `${r.ganz.name} auf ${r.glocken[0].ton}` : '';
}
function renderMotiv() {
  const box = $('motivBox');
  const keepOpen = box.querySelector('details')?.open;
  const { mit, ohne, r } = gelaeutMotiv();
  const head = '<div class="eyebrow">Läutemotiv</div>';
  const ohneTxt = ohne.length ? `<p class="hint">${ohne.length === 1 ? 'Glocke' : 'Glocken'} ${ohne.join(', ')} ohne Nominal (Oktave fehlt) – nicht berücksichtigt.</p>` : '';
  if (mit.length < 2) {
    box.innerHTML = `${head}<p class="motiv-none">Für die Motiverkennung bei mindestens zwei Glocken die Oktave eintragen.</p>`;
    return;
  }
  const g = r.glocken, lo = g[0].s, hi = g[g.length - 1].s;
  const bellNos = (list) => list.map((x) => x.i + 1).join(' · ');
  const names = (m) => (m.other.length ? `<span class="motiv-other">Auch: ${esc(m.other.join('; '))}</span>` : '')
    + (m.teil ? '<span class="motiv-other">nur als Teilgeläut gebräuchlich</span>' : '');
  // Tonleiste: ein Feld je Halbton von der tiefsten bis zur höchsten Glocke
  const span = hi - lo + 1;
  let strip = '';
  if (span <= 40) {
    const at = new Map();
    for (const x of g) { if (!at.has(x.s)) at.set(x.s, []); at.get(x.s).push(x); }
    strip = `<div class="motiv-strip" style="grid-template-columns:repeat(${span},minmax(0,1fr))" aria-hidden="true">`
      + Array.from({ length: span }, (_, k) => {
        const xs = at.get(lo + k);
        return xs ? `<span class="on"><i>${esc(xs[0].ton)}</i><b>${xs.map((x) => x.i + 1).join('+')}</b></span>` : '<span></span>';
      }).join('') + '</div>';
  }
  const main = r.ganz
    ? `<p class="motiv-main"><strong>${esc(r.ganz.name)}</strong> auf ${esc(g[0].ton)}</p>${names(r.ganz)}`
    : `<p class="motiv-main motiv-none">Kein bekanntes Motiv für ${g.length === 2 ? 'beide' : 'alle ' + g.length} Glocken</p>`;
  const tones = `<p class="motiv-tones">${g.map((x) => esc(x.ton)).join('  ')}</p>`;
  const teile = r.teile.length
    ? `<details class="motiv-teile"${keepOpen ? ' open' : ''}><summary>Mit Teilen des Geläuts läutbar: ${r.teile.length} ${r.teile.length === 1 ? 'Motiv' : 'Motive'}</summary><ul>`
      + r.teile.map((t) => `<li><span><b>${esc(t.motiv.name)}</b> auf ${esc(t.glocken[0].ton)}${t.motiv.teil ? ' <small>(Teilgeläut)</small>' : ''}</span><span class="mono dim">${t.glocken.map((x) => esc(x.ton)).join(' ')}</span><span class="motiv-nos">Glocken ${bellNos(t.glocken)}</span></li>`).join('')
      + '</ul></details>'
    : '';
  box.innerHTML = `<div class="motiv-head"><div>${head}${main}${tones}</div>${strip}</div>${ohneTxt}${teile}`;
}

// Seitenleiste: gespeicherte Geläute, gruppiert nach Land → Region (alphabetisch)
function renderSaved() {
  const box = $('savedList');
  $('savedEmpty').hidden = state.saved.length > 0;
  const openSet = new Set(lsGet(LS.open) || []);
  const cur = state.saved.find((s) => s.id === state.g.id);
  if (cur) { const lk = cur.land || '_'; openSet.add(lk); openSet.add(lk + '|' + (cur.region || '_')); }
  const tree = new Map();
  for (const s of state.saved) {
    const lk = LAENDER[s.land] ? s.land : '_', rk = s.region || '_';
    if (!tree.has(lk)) tree.set(lk, new Map());
    const rm = tree.get(lk); if (!rm.has(rk)) rm.set(rk, []);
    rm.get(rk).push(s);
  }
  const lands = [...LAND_ORDER.filter((k) => tree.has(k)), ...(tree.has('_') ? ['_'] : [])];
  const coll = (x, y) => x.localeCompare(y, 'de', { numeric: true });
  box.innerHTML = '';
  for (const lk of lands) {
    const rm = tree.get(lk), total = [...rm.values()].reduce((n, l) => n + l.length, 0);
    const dl = document.createElement('details'); dl.dataset.key = lk; dl.open = openSet.has(lk);
    dl.innerHTML = `<summary>${esc(lk === '_' ? 'Ohne Land' : LAENDER[lk].name)}<span class="cnt">${total}</span></summary>`;
    const regs = [...rm.keys()].sort((x, y) => (x === '_') - (y === '_') || coll(x, y));
    for (const rk of regs) {
      const list = rm.get(rk).sort((x, y) => coll(x.name || '', y.name || ''));
      const dr = document.createElement('details'); dr.className = 'lvl2'; dr.dataset.key = lk + '|' + rk; dr.open = openSet.has(dr.dataset.key);
      const label = rk === '_' ? (lk === '_' ? 'Ohne Angabe' : `Ohne ${LAENDER[lk].label}`) : rk;
      dr.innerHTML = `<summary>${esc(label)}<span class="cnt">${list.length}</span></summary>`;
      const ul = document.createElement('ul'); ul.className = 'saved-list';
      for (const s of list) {
        const li = document.createElement('li');
        if (s.id === state.g.id) li.className = 'active';
        const n = (s.bells || []).length;
        const when = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('de-CH') : '';
        li.innerHTML = `<button type="button" class="saved-open"><strong>${esc(s.name || 'Ohne Namen')}</strong><span>${esc(s.ort ? s.ort + ' · ' : '')}${n} ${n === 1 ? 'Glocke' : 'Glocken'}${when ? ' · ' + when : ''}</span></button><button type="button" class="icon-btn" title="Geläut löschen">Löschen</button>`;
        li.children[0].onclick = () => openSaved(s);
        li.children[1].onclick = (e) => armButton(e.currentTarget, 'Sicher?', () => deleteSaved(s));
        ul.appendChild(li);
      }
      if (lk === '_') dl.appendChild(ul); else { dr.appendChild(ul); dl.appendChild(dr); }
    }
    box.appendChild(dl);
  }
  // Nur eigene Klicks merken (das automatische Öffnen der aktuellen Gruppe nicht)
  box.querySelectorAll('summary').forEach((sm) => sm.addEventListener('click', () => setTimeout(() => {
    const d = sm.parentElement, set = new Set(lsGet(LS.open) || []);
    if (d.open) set.add(d.dataset.key); else set.delete(d.dataset.key);
    lsSet(LS.open, [...set]);
  }, 0)));
}

// ===== Eingaben =====
function onBellInput(e) {
  const t = e.target;
  const b = bell();
  if (t.dataset.f) b.f[t.dataset.f] = t.value;
  else if (t.dataset.k) b[t.dataset.k] = t.value;
  else return;
  setDirty(true);
  renderComputed();
  renderOverview();
  if (['name', 'durchmesser'].includes(t.dataset.k) || t.dataset.f === 'oktave') renderTabs();
}
$('sheet').addEventListener('input', onBellInput);
$('sheet').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') onBellInput(e); });
$('gName').addEventListener('input', (e) => { state.g.name = e.target.value; setDirty(true); });
$('gOrt').addEventListener('input', (e) => { state.g.ort = e.target.value; setDirty(true); });
$('gLand').addEventListener('change', (e) => { state.g.land = e.target.value; state.g.region = ''; fillRegions(); setDirty(true); });
$('gRegion').addEventListener('change', (e) => { state.g.region = e.target.value; setDirty(true); });
$('gA1').addEventListener('change', (e) => { state.g.a1 = Number(e.target.value); setDirty(true); renderTabs(); renderComputed(); renderOverview(); });
function setMode(m) {
  state.mode = m;
  [...$('modeSeg').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}
$('modeSeg').addEventListener('click', (e) => {
  const m = e.target.dataset.mode; if (!m) return;
  setMode(m); lsSet(LS.mode, m); renderOverview();
});

// Glocken verwalten
function moveBell(dir) {
  const i = state.sel, j = i + dir, arr = state.g.bells;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  state.sel = j; setDirty(true); renderBell();
}
$('btnLeft').onclick = () => moveBell(-1);
$('btnRight').onclick = () => moveBell(1);
$('btnDup').onclick = () => {
  const c = clone(bell()); c.name = c.name ? c.name + ' (Kopie)' : '';
  state.g.bells.splice(state.sel + 1, 0, c); state.sel++;
  setDirty(true); renderBell();
};
$('btnDel').onclick = (e) => armButton(e.currentTarget, 'Wirklich entfernen?', () => {
  if (state.g.bells.length < 2) return;
  state.g.bells.splice(state.sel, 1);
  state.sel = Math.min(state.sel, state.g.bells.length - 1);
  setDirty(true); renderBell();
});

// ===== Speicher (auf dem Gerät, im localStorage) =====
function snapshotForSave() {
  const g = clone(state.g);
  return { name: g.name || '', land: g.land || '', region: g.region || '', ort: g.ort || '', a1: Number(g.a1) || 435, bells: g.bells, updatedAt: Date.now() };
}
function slug(s) { return (s || 'gelaeut').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gelaeut'; }

function localAll() { return lsGet(LS.local) || {}; }
function writeLocal(all) {
  // Ohne try/catch: ein voller Speicher soll als Fehler gemeldet werden
  localStorage.setItem(LS.local, JSON.stringify(all));
}
function loadLocalList() {
  state.saved = Object.entries(localAll()).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  renderSaved();
}
function save() {
  if (!state.g.name.trim()) { $('gName').focus(); toast('Bitte zuerst Kirche / Patrozinium eingeben.'); return; }
  const body = snapshotForSave();
  const id = state.g.id || `${slug(body.name)}-${Date.now().toString(36)}`;
  try {
    const all = localAll(); all[id] = body; writeLocal(all);
  } catch (err) {
    const s = $('status');
    s.textContent = err && err.name === 'QuotaExceededError' ? 'Speicher voll – bitte alte Geläute löschen oder Spektren entfernen.' : 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
    s.className = 'status err';
    return;
  }
  state.g.id = id; state.g.demo = false;
  loadLocalList(); setDirty(false);
  DBX.changed(id);
  toast(`„${body.name}“ gespeichert.`);
}
function openSaved(s) {
  state.g = { id: s.id, name: s.name || '', land: s.land || '', region: s.region || '', ort: s.ort || '', a1: s.a1 || 435, bells: clone(s.bells && s.bells.length ? s.bells : [newBell()]) };
  state.sel = 0; state.dirty = false;
  renderAll();
  toast(`„${s.name || 'Geläut'}“ geladen.`);
}
function deleteSaved(s) {
  try { const all = localAll(); delete all[s.id]; writeLocal(all); } catch { toast('Löschen fehlgeschlagen.'); return; }
  if (state.g.id === s.id) { state.g.id = null; setDirty(true); }
  loadLocalList();
  DBX.removed(s.id);
  toast(`„${s.name || 'Geläut'}“ gelöscht.`);
}
$('btnSave').onclick = save;
$('btnNew').onclick = () => { state.g = newGelaeut(); state.sel = 0; state.dirty = false; renderAll(); $('gName').focus(); };
$('btnDemoClear').onclick = () => $('btnNew').click();
