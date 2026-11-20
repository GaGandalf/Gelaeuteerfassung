// ===== Berechnungskern (entspricht Factsheet "Töne_Rippe") =====
// Reine Rechenfunktionen ohne Bezug zur Oberfläche. DATA kommt aus daten.js.
// ref = Abstand des Referenztons zum Nominal in 1/16-Halbtönen (Tabelle läuft absteigend).
const PARTIALS = [
  { key: 'unterton', label: 'Unterton', ref: +192 },
  { key: 'nominal', label: 'Nominal', ref: 0, computed: true },
  { key: 'prime', label: 'Prime', ref: 0 },
  { key: 'terz', label: 'Terz', ref: -50 },
  { key: 'quinte', label: 'Quinte', ref: -112 },
  { key: 'oktave', label: 'Oktave', ref: -192 },
  { key: 'dezime', label: 'Dezime', ref: -256 },
  { key: 'undezime', label: 'Undezime', ref: -272, note: 'gleiche 16tel wie Schlagton' },
  { key: 'duodezime', label: 'Duodezime', ref: -304 },
  { key: 'doppeloktave', label: 'Doppeloktave', ref: -384 },
];

// Rippenklassen nach RS (Rippenstärke); obere Grenze jeweils ausschliesslich
const RIPPEN_KLASSEN = [
  { bis: -6, name: 'Sehr leichte Rippe', kurz: 'sehr leicht' },
  { bis: 0, name: 'Leichte Rippe', kurz: 'leicht' },
  { bis: 6, name: 'Mittlere Rippe', kurz: 'mittel' },
  { bis: 12, name: 'Schwere Rippe', kurz: 'schwer' },
  { bis: Infinity, name: 'Sehr schwere Rippe', kurz: 'sehr schwer' },
];
function ripKlasseIdx(rs) { return rs === null ? -1 : RIPPEN_KLASSEN.findIndex((k) => rs < k.bis); }

function toneFreq(i, a1) { return a1 * Math.pow(2, ((DATA.anchor - i) * 6.25) / 1200); }
function validIdx(i) { return Number.isInteger(i) && i >= 0 && i < DATA.tones.length; }
function nearestIdx(f, a1) {
  if (!(f > 0)) return null;
  // Tabelle absteigend; erster Treffer des Minimums wie MATCH(MIN(ABS(...)))
  let best = null, bd = Infinity;
  for (let i = 0; i < DATA.tones.length; i++) {
    const d = Math.abs(toneFreq(i, a1) - f);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function baseTone(name) {
  if (!name) return '';
  return name.split(';')[0].trim().split(' ')[0];
}
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[’'\s]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function computeBell(bell, a1) {
  const f = bell.f || {};
  const rows = {};
  for (const p of PARTIALS) {
    if (p.computed) continue;
    const fm = num(f[p.key]);
    const idx = nearestIdx(fm, a1);
    rows[p.key] = { measured: fm, idx, bezug: idx === null ? null : toneFreq(idx, a1), ton: idx === null ? '' : DATA.tones[idx] };
  }
  // Nominal = Oktave-Ton eine Oktave tiefer (Excel D12)
  const okt = rows.oktave.idx;
  const nIdx = okt === null ? null : okt + 192;
  const nOk = nIdx !== null && validIdx(nIdx);
  rows.nominal = { measured: nOk ? toneFreq(nIdx, a1) : null, idx: nOk ? nIdx : null, bezug: null, ton: nOk ? DATA.tones[nIdx] : '' };
  for (const p of PARTIALS) {
    const r = rows[p.key];
    const ri = nOk ? nIdx + p.ref : null;
    r.refIdx = ri !== null && validIdx(ri) ? ri : null;
    r.refTon = r.refIdx === null ? '' : DATA.tones[r.refIdx];
    r.refHz = r.refIdx === null ? null : toneFreq(r.refIdx, a1);
    // Abweichung in 1/16-Halbtönen (positiv = höher als Referenz)
    r.dev = (r.idx !== null && r.refIdx !== null && !p.computed) ? r.refIdx - r.idx : null;
  }
  // Rippe: RS = D · f(Nominal) · I / 3875 − 100
  const D = num(bell.durchmesser);
  const fN = rows.nominal.measured;
  const I = num(bell.korrektur) ?? 1;
  const rs = D && fN ? (D * fN * I) / 3875 - 100 : null;
  const autoSchlag = baseTone(rows.nominal.ton);
  const schlagton = bell.schlagton || (DATA.rip.tones.includes(autoSchlag) ? autoSchlag : '');
  let ripKg = null, ripGroup = null, ripD = null;
  if (rs !== null && schlagton && DATA.rip.kg[schlagton]) {
    let g = -1;
    DATA.rip.rs.forEach((v, k) => { if (v <= rs) g = k; });
    // Excel: INDEX(Rippentabelle[], …, MATCH(RS; C3:AN3; 1)) – die Tabelle beginnt bei Spalte B,
    // der MATCH-Bereich bei C. Dadurch liefert Excel das kg der Spalte links vom Treffer
    // (= Gewicht der vorherigen Rippengruppe). Das wird hier 1:1 nachgebildet.
    if (g >= 1) {
      ripGroup = g - 1;
      const kg = DATA.rip.kg[schlagton][g - 1];
      ripD = DATA.rip.d[schlagton][g - 1];
      if (kg !== null && kg !== undefined) ripKg = Math.ceil(kg / 100) * 100;
    }
  }
  const mittel = D && fN ? 11.42 * Math.pow(D / 1000, 11 / 3) * Math.pow(fN, 2 / 3) : null;
  const range = mittel === null ? null : [
    { label: '+11 %', v: mittel * 1.11 }, { label: '+3.5 %', v: mittel * 1.035 }, { label: 'Mittel', v: mittel },
    { label: '−3.5 %', v: mittel * 0.965 }, { label: '−11 %', v: mittel * 0.89 },
  ];
  const klasse = rs === null ? null : RIPPEN_KLASSEN[ripKlasseIdx(rs)].name;
  return { rows, rs, schlagton, autoSchlag, ripKg, ripGroup, ripD, range, klasse, I };
}

// Anzeige der Tonnamen mit Oktavstrichen: gis0/as0 → gis°/as°, g1 → g', g2 → g'', A1 → A₁
function tn(name) {
  if (!name) return '';
  return String(name).replace(/([A-Za-z]+)(\d)/g, (m, n, d) => {
    if (n[0] === n[0].toUpperCase()) return n + (d === '1' ? '₁' : d === '2' ? '₂' : d === '0' ? '' : d);
    return n + (d === '0' ? '°' : "'".repeat(Number(d)));
  });
}

