// ===== Spektrum-Analyse (wie Audacity "Frequenzanalyse": Spektrum, Hann-Fenster) =====
const Spectrum = (() => {
  // --- FFT (radix-2, in place) ---
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // Gemitteltes Leistungsspektrum (Welch, 50 % Überlappung)
  function analyze(samples, sr, N, start = 0, end = samples.length) {
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const half = N / 2, pow = new Float64Array(half + 1);
    const re = new Float64Array(N), im = new Float64Array(N);
    const hop = N / 2;
    let frames = 0;
    const len = end - start;
    const last = len <= N ? start : end - N;
    for (let s = start; s <= last; s += hop) {
      for (let i = 0; i < N; i++) { const v = s + i < end ? samples[s + i] : 0; re[i] = v * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= half; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
      frames++;
      if (len <= N) break;
    }
    let max = 1e-30;
    for (let k = 1; k <= half; k++) { pow[k] /= frames; if (pow[k] > max) max = pow[k]; }
    const db = new Float32Array(half + 1);
    for (let k = 0; k <= half; k++) db[k] = 10 * Math.log10(Math.max(pow[k], 1e-30) / max);
    return { db, df: sr / N, sr, N, frames };
  }

  // Lokale Maxima mit Prominenz, Frequenz per Parabel-Interpolation verfeinert
  function findPeaks(spec, fmin, fmax, minProm = 3) {
    const { db, df } = spec, out = [];
    const k0 = Math.max(2, Math.floor(fmin / df)), k1 = Math.min(db.length - 3, Math.ceil(fmax / df));
    for (let k = k0; k <= k1; k++) {
      const b = db[k];
      if (!(b > db[k - 1] && b >= db[k + 1])) continue;
      const f = k * df;
      const w = Math.max(4, Math.round((f * 0.03) / df)); // ~ halber Halbton Umgebung
      let ml = b, mr = b;
      for (let j = 1; j <= w && k - j >= 0; j++) { if (db[k - j] > b) { ml = -Infinity; break; } ml = Math.min(ml, db[k - j]); }
      for (let j = 1; j <= w && k + j < db.length; j++) { if (db[k + j] > b) { mr = -Infinity; break; } mr = Math.min(mr, db[k + j]); }
      if (ml === -Infinity || mr === -Infinity) continue;
      const prom = b - Math.max(ml, mr);
      if (prom < minProm) continue;
      const a = db[k - 1], c = db[k + 1], den = a - 2 * b + c;
      const p = den !== 0 ? (0.5 * (a - c)) / den : 0;
      out.push({ f: (k + p) * df, db: b - 0.25 * (a - c) * p, prom, k });
    }
    return out;
  }

  function dbAt(spec, f) {
    const x = (f - (spec.off || 0)) / spec.df, k = Math.floor(x), t = x - k;
    if (k < 0 || k + 1 >= spec.db.length) return -200;
    return spec.db[k] * (1 - t) + spec.db[k + 1] * t;
  }

  // Beispielklang: Glocke mit Teiltönen, Abklingen und Rauschen
  function demoBell(sr = 44100, secs = 6, ratio = 1) {
    const partials = [[193.2, .55, 1.2], [389.1, .7, 1.8], [462.5, .5, 2.4], [578, .25, 2.6], [776.4, 1, 3], [979, .35, 3.6], [1031, .18, 3.8], [1166, .3, 4.2], [1556, .22, 5], [1945, .12, 6], [2410, .08, 7], [3120, .05, 8]];
    const n = sr * secs, out = new Float32Array(n);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / sr; let v = 0;
      for (const [f0, a, d] of partials) { const f = f0 * ratio; v += a * Math.exp(-d * t * 0.6) * Math.sin(2 * Math.PI * f * t + f); }
      out[i] = v * 0.18 + rnd() * 0.004 * (1 + 4 * Math.exp(-t * 6));
    }
    return out;
  }
  // Kompakt speichern: bis fmax, höchstens 6000 Punkte (Maximum je Gruppe), 0.5-dB-Schritte, Spitzen mit voller Genauigkeit
  function pack(spec, info, fmax = 10000) {
    const { db, df } = spec;
    const kmax = Math.min(db.length - 1, Math.ceil(fmax / df));
    const factor = Math.max(1, Math.ceil((kmax + 1) / 6000));
    const n = Math.ceil((kmax + 1) / factor), bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let m = -300; for (let k = i * factor; k < Math.min(kmax + 1, (i + 1) * factor); k++) if (db[k] > m) m = db[k];
      bytes[i] = Math.max(0, Math.min(255, Math.round(-m * 2)));
    }
    let bin = ''; for (let i = 0; i < n; i += 4096) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
    const pk = findPeaks(spec, 15, Math.min(fmax * 1.05, spec.sr / 2 - df * 3), 3)
      .sort((a, b) => b.db - a.db).slice(0, 300)
      .map((p) => [Math.round(p.f * 100) / 100, Math.round(p.db * 10) / 10, Math.round(p.prom * 10) / 10]);
    return { v: 1, ...info, sr: spec.sr, N: spec.N, frames: spec.frames, df: df * factor, off: ((factor - 1) / 2) * df, fmax, q: btoa(bin), pk };
  }
  function unpack(o) {
    const bin = atob(o.q), db = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) db[i] = -bin.charCodeAt(i) / 2;
    return { spec: { db, df: o.df, off: o.off || 0, sr: o.sr, N: o.N, frames: o.frames }, peaks: (o.pk || []).map(([f, d, p]) => ({ f, db: d, prom: p })) };
  }
  return { analyze, findPeaks, dbAt, demoBell, pack, unpack };
})();

// ===== Darstellung (mit Zoom) =====
function SpectrumChart(canvas, opts) {
  const S = {
    spec: null, peaks: [], allPeaks: [], log: true, fmin: 20, fmax: 10000, range: 90, labels: 10,
    snap: true, hover: null, pinned: null, a1: 435, onPin: null, onHover: null, onView: null, ...opts,
  };
  const ctx = canvas.getContext('2d');
  const PAD = { l: 44, r: 12, t: 30, b: 26 };
  const css = (n) => getComputedStyle(canvas).getPropertyValue(n).trim();
  let W = 0, H = 0, dpr = 1;
  let V = null; // sichtbarer Bereich [u0, u1] in Achsen-Einheiten (log f oder f); null = ganzer Bereich

  const U = (f) => (S.log ? Math.log(f) : f), F = (u) => (S.log ? Math.exp(u) : u);
  const base = () => [U(S.fmin), U(S.fmax)];
  const view = () => V || base();
  const minSpan = () => (S.log ? Math.log(1.01) : 2);
  const plotW = () => W - PAD.l - PAD.r, plotH = () => H - PAD.t - PAD.b;
  const xOf = (f) => { const [u0, u1] = view(); return PAD.l + ((U(f) - u0) / (u1 - u0)) * plotW(); };
  const uOfX = (x) => { const [u0, u1] = view(); return u0 + ((x - PAD.l) / plotW()) * (u1 - u0); };
  const fOf = (x) => F(uOfX(x));
  const vmin = () => F(view()[0]), vmax = () => F(view()[1]);
  const yOf = (d) => PAD.t + (Math.min(0, Math.max(-S.range, d)) / -S.range) * plotH();
  const toneOf = (f) => { if (typeof nearestIdx !== 'function') return ''; const i = nearestIdx(f, S.a1); return i === null ? '' : (typeof tn === 'function' ? tn(DATA.tones[i]) : DATA.tones[i]); };
  const fmtF = (f) => f.toFixed(1);
  const zoomed = () => !!V;

  // --- Zoom ---
  function setView(u0, u1) {
    const [b0, b1] = base();
    let span = Math.min(b1 - b0, Math.max(minSpan(), u1 - u0));
    if (span >= (b1 - b0) - 1e-9) { V = null; } else {
      u0 = Math.max(b0, Math.min(u0, b1 - span));
      V = [u0, u0 + span];
    }
    draw(); S.onView && S.onView(info());
  }
  function zoomAt(u, factor) { const [u0, u1] = view(), span = (u1 - u0) * factor; setView(u - (u - u0) * (span / (u1 - u0)), u - (u - u0) * (span / (u1 - u0)) + span); }
  function zoomCenter(factor) {
    const [u0, u1] = view();
    const c = S.pinned && S.pinned.f >= vmin() && S.pinned.f <= vmax() ? U(S.pinned.f) : (u0 + u1) / 2;
    zoomAt(c, factor);
  }
  function resetZoom() { V = null; draw(); S.onView && S.onView(info()); }
  function info() { const [b0, b1] = base(), [u0, u1] = view(); return { zoomed: zoomed(), factor: (b1 - b0) / (u1 - u0), from: F(u0), to: F(u1) }; }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw();
  }
  function setData(spec, peaks) {
    S.spec = spec;
    S.allPeaks = peaks || (spec ? Spectrum.findPeaks(spec, 15, Math.min(spec.sr / 2 - spec.df * 3, 22000), 3) : []);
    S.pinned = null; S.hover = null; V = null;
    pickLabels(); draw(); S.onView && S.onView(info());
  }
  function pickLabels() {
    const vis = S.allPeaks.filter((p) => p.f >= S.fmin && p.f <= S.fmax && p.prom >= 6);
    S.peaks = vis.sort((a, b) => b.db - a.db).slice(0, S.labels);
  }
  function set(o) {
    const resetV = ('log' in o && o.log !== S.log) || ('fmin' in o && +o.fmin !== S.fmin) || ('fmax' in o && +o.fmax !== S.fmax);
    Object.assign(S, o); if (resetV) V = null;
    pickLabels(); draw(); if (resetV && S.onView) S.onView(info());
  }

  // --- Achsenteilung, passt sich dem Zoom an ---
  function niceStep(span, target) {
    const raw = span / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function ticks() {
    const major = [], minor = [], a = vmin(), b = vmax();
    if (S.log && b / a >= 6) {
      for (let dec = 1; dec <= 100000; dec *= 10) for (let m = 1; m < 10; m++) {
        const f = m * dec; if (f < a || f > b) continue;
        (m === 1 || m === 2 || m === 5 ? major : minor).push(f);
      }
      return { major, minor, step: 1 };
    }
    const step = niceStep(b - a, Math.max(3, Math.floor(plotW() / 85)));
    for (let f = Math.ceil(a / step) * step; f <= b + 1e-9; f += step) major.push(+f.toFixed(6));
    const ms = step / 5;
    for (let f = Math.ceil(a / ms) * ms; f <= b; f += ms) if (Math.abs(f / step - Math.round(f / step)) > 1e-6) minor.push(f);
    return { major, minor, step };
  }
  function tickLabel(f, step) {
    if (step >= 1000 && f % 1000 === 0) return f / 1000 + 'k';
    if (step === 1 && f >= 1000 && f % 1000 === 0) return f / 1000 + 'k';
    const dec = step < 1 ? Math.min(2, Math.ceil(-Math.log10(step))) : 0;
    return f.toFixed(dec);
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const C = { grid: css('--grid'), axis: css('--muted'), ink: css('--ink'), fill: css('--spec'), line: css('--spec-line'), mark: css('--mark'), pin: css('--pin'), panel: css('--panel') };
    ctx.font = '11px ' + css('--f-mono');
    const { major, minor, step } = ticks();
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid; ctx.globalAlpha = 0.5;
    for (const f of minor) { const x = Math.round(xOf(f)) + 0.5; ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const f of major) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
      ctx.fillText(tickLabel(f, step), x, H - PAD.b + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ystep = S.range > 60 ? 20 : 10;
    for (let d = 0; d >= -S.range; d -= ystep) {
      const y = Math.round(yOf(d)) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
      ctx.fillText(d + (d === 0 ? ' dB' : ''), PAD.l - 6, y);
    }
    if (zoomed()) {
      const z = info();
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = C.axis; ctx.font = '600 11px ' + css('--f-mono');
      ctx.fillText(`Zoom ×${z.factor < 10 ? z.factor.toFixed(1) : Math.round(z.factor)} · ${z.from.toFixed(z.to - z.from < 50 ? 1 : 0)}–${z.to.toFixed(z.to - z.from < 50 ? 1 : 0)} Hz`, W - PAD.r, 6);
    }
    if (!S.spec) return;
    // Spektrum: je Pixelspalte das Maximum der Frequenzbins, beim Hineinzoomen interpoliert
    const { db, df } = S.spec, x0 = PAD.l, x1 = W - PAD.r, bottom = H - PAD.b;
    ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, 0, plotW(), H); ctx.clip();
    ctx.beginPath(); ctx.moveTo(x0, bottom);
    const off = S.spec.off || 0;
    for (let x = x0; x <= x1; x++) {
      const fa = fOf(x - 0.5), fb = fOf(x + 0.5);
      let v;
      const ka = Math.max(0, Math.ceil((fa - off) / df)), kb = Math.min(db.length - 1, Math.floor((fb - off) / df));
      if ((fb - fa) / df >= 1 && kb >= ka) { v = -300; for (let k = ka; k <= kb; k++) if (db[k] > v) v = db[k]; }
      else v = Spectrum.dbAt(S.spec, fOf(x));
      ctx.lineTo(x, yOf(v));
    }
    ctx.lineTo(x1, bottom); ctx.closePath();
    ctx.fillStyle = C.fill; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    // Beschriftung: die höchsten Spitzen im sichtbaren Bereich
    const a = vmin(), b = vmax();
    const vis = S.allPeaks.filter((p) => p.f >= a && p.f <= b && p.f >= S.fmin && p.f <= S.fmax && p.prom >= (zoomed() ? 3 : 6)).sort((p, q) => q.db - p.db);
    const cap = Math.min(zoomed() ? Math.max(S.labels, 8) : S.labels, Math.max(4, Math.floor(plotW() / 55)));
    const boxes = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '600 11px ' + css('--f-mono');
    for (const p of vis.slice(0, cap)) {
      const x = xOf(p.f), y = yOf(p.db);
      const txt = fmtF(p.f), w = ctx.measureText(txt).width + 6;
      let ly = y - 6, ok = false;
      for (let tries = 0; tries < 4 && !ok; tries++) {
        const bx = { l: x - w / 2, r: x + w / 2, t: ly - 13, b: ly };
        ok = bx.t >= 2 && !boxes.some((o) => bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t);
        if (ok) boxes.push(bx); else ly -= 14;
      }
      ctx.fillStyle = C.mark;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      if (!ok) continue;
      if (ly < y - 8) { ctx.strokeStyle = C.mark; ctx.globalAlpha = .4; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, ly); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = C.panel; ctx.globalAlpha = .82; ctx.fillRect(x - w / 2, ly - 13, w, 13); ctx.globalAlpha = 1;
      ctx.fillStyle = C.mark; ctx.fillText(txt, x, ly);
    }
    if (S.pinned && S.pinned.f >= a && S.pinned.f <= b) cursor(S.pinned, C.pin, false);
    if (S.hover) cursor(S.hover, C.ink, true);
    ctx.restore();
  }

  function cursor(c, color, withBox) {
    const x = xOf(c.f), y = yOf(c.db);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(c.snapped ? [] : [4, 3]);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, PAD.t); ctx.lineTo(Math.round(x) + 0.5, H - PAD.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, c.snapped ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
    if (withBox) {
      ctx.font = '600 12px ' + css('--f-mono');
      const l1 = `${fmtF(c.f)} Hz`, l2 = `${c.db.toFixed(1)} dB  ${toneOf(c.f)}`;
      const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 14;
      let bx = x + 10; if (bx + w > W - PAD.r) bx = x - 10 - w;
      const by = H - PAD.b - 44;
      ctx.fillStyle = css('--tip-bg'); ctx.fillRect(bx, by, w, 36);
      ctx.fillStyle = css('--tip-fg'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(l1, bx + 7, by + 4);
      ctx.font = '11px ' + css('--f-mono'); ctx.fillText(l2, bx + 7, by + 20);
    }
    ctx.restore();
  }

  // Zeiger: frei folgen, nahe einer Spitze einrasten
  function locate(clientX, touch) {
    if (!S.spec) return null;
    const r = canvas.getBoundingClientRect(), x = Math.min(Math.max(clientX - r.left, PAD.l), W - PAD.r);
    const f = fOf(x);
    if (S.snap) {
      const rad = touch ? 16 : 9, a = vmin(), b = vmax();
      let best = null, bd = rad;
      for (const p of S.allPeaks) {
        if (p.f < a || p.f > b) continue;
        const d = Math.abs(xOf(p.f) - x);
        if (d < bd || (best && d === bd && p.db > best.db)) { bd = d; best = p; }
      }
      if (best) return { f: best.f, db: best.db, snapped: true };
    }
    return { f, db: Spectrum.dbAt(S.spec, f), snapped: false };
  }

  // --- Zeiger-Gesten: Maus (bewegen, ziehen = verschieben, Rad = zoomen), Finger (streichen, zwei Finger = zoomen/verschieben) ---
  const pts = new Map();
  let mode = null, start = null;
  const localX = (e) => e.clientX - canvas.getBoundingClientRect().left;
  const hover = (c) => { S.hover = c; draw(); S.onHover && S.onHover(c); };
  function pinchState() {
    const [p, q] = [...pts.values()];
    return { dist: Math.max(10, Math.abs(p.x - q.x)), mid: (p.x + q.x) / 2 };
  }
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: localX(e) });
    if (pts.size === 2) {
      const ps = pinchState(), [u0, u1] = view();
      mode = 'pinch'; start = { ...ps, span: u1 - u0, uMid: uOfX(ps.mid) };
      hover(null); return;
    }
    if (pts.size > 2) return;
    if (e.pointerType === 'mouse') { mode = 'mouse'; start = { x: localX(e), view: view(), moved: false }; }
    else { mode = 'scrub'; hover(locate(e.clientX, true)); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.get(e.pointerId).x = localX(e);
    if (mode === 'pinch' && pts.size >= 2) {
      const ps = pinchState(), span = start.span * (start.dist / ps.dist);
      const u0 = start.uMid - ((ps.mid - PAD.l) / plotW()) * span;
      setView(u0, u0 + span); return;
    }
    if (mode === 'mouse') {
      const dx = localX(e) - start.x;
      if (Math.abs(dx) > 4) start.moved = true;
      if (start.moved) {
        const [u0, u1] = start.view, du = (dx / plotW()) * (u1 - u0);
        canvas.style.cursor = 'grabbing'; setView(u0 - du, u1 - du); S.hover = null; return;
      }
    }
    if (mode === 'scrub' || e.pointerType === 'mouse') hover(locate(e.clientX, e.pointerType !== 'mouse'));
  });
  function end(e, cancelled) {
    pts.delete(e.pointerId);
    if (mode === 'pinch') { if (pts.size === 0) mode = null; return; }
    if (!cancelled && (mode === 'scrub' || (mode === 'mouse' && !start.moved))) {
      const c = locate(e.clientX, e.pointerType !== 'mouse');
      if (c) { S.pinned = c; S.onPin && S.onPin(c); }
    }
    if (e.pointerType !== 'mouse') S.hover = null;
    canvas.style.cursor = '';
    mode = null; draw();
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && mode !== 'mouse') hover(null); });
  canvas.addEventListener('wheel', (e) => {
    if (!S.spec) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    zoomAt(uOfX(Math.min(Math.max(localX(e), PAD.l), W - PAD.r)), Math.exp(d * 0.0015));
    if (S.hover) hover(locate(e.clientX, false));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => resetZoom());
  // Tastatur: Pfeile springen von Spitze zu Spitze, + / − zoomen, 0 zeigt alles
  canvas.addEventListener('keydown', (e) => {
    if (!S.spec) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomCenter(0.5); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomCenter(2); return; }
    if (e.key === '0') { e.preventDefault(); resetZoom(); return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const vis = S.allPeaks.filter((p) => p.f >= S.fmin && p.f <= S.fmax && p.prom >= 6).sort((a, b) => a.f - b.f);
    if (!vis.length) return;
    const cur = S.pinned ? S.pinned.f : (e.key === 'ArrowRight' ? 0 : Infinity);
    const nx = e.key === 'ArrowRight' ? vis.find((p) => p.f > cur + 1e-6) : [...vis].reverse().find((p) => p.f < cur - 1e-6);
    if (nx) {
      S.pinned = { f: nx.f, db: nx.db, snapped: true }; S.onPin && S.onPin(S.pinned);
      if (V && (nx.f < vmin() || nx.f > vmax())) { const [u0, u1] = view(), sp = u1 - u0; setView(U(nx.f) - sp / 2, U(nx.f) + sp / 2); }
      else draw();
    }
  });
  new ResizeObserver(resize).observe(canvas);
  return {
    setData, set, draw, state: S, zoomIn: () => zoomCenter(0.5), zoomOut: () => zoomCenter(2), resetZoom,
    pin(p) {
      S.pinned = { f: p.f, db: p.db, snapped: true };
      if (V && (p.f < vmin() || p.f > vmax())) { const [u0, u1] = view(), sp = u1 - u0; setView(U(p.f) - sp / 2, U(p.f) + sp / 2); } else draw();
    },
  };
}

// ===== Wellenform mit Bereichsauswahl =====
function WaveStrip(canvas, onSelect) {
  const ctx = canvas.getContext('2d');
  let data = null, sr = 44100, sel = null, W = 0, H = 0, dpr = 1, env = null, marks = null, markBlock = 1024;
  const css = (n) => getComputedStyle(canvas).getPropertyValue(n).trim();
  function resize() { dpr = devicePixelRatio || 1; const r = canvas.getBoundingClientRect(); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; env = null; draw(); }
  function envelope() {
    const cols = Math.max(1, Math.floor(W)), per = data.length / cols, mins = new Float32Array(cols), maxs = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      let lo = 0, hi = 0; const a = Math.floor(c * per), b = Math.min(data.length, Math.floor((c + 1) * per));
      for (let i = a; i < b; i += Math.max(1, Math.floor((b - a) / 400))) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      mins[c] = lo; maxs[c] = hi;
    }
    let peak = 1e-9; for (let c = 0; c < cols; c++) peak = Math.max(peak, -mins[c], maxs[c]);
    return { mins, maxs, peak };
  }
  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!data) return;
    env = env || envelope();
    const mid = H / 2;
    if (sel) {
      ctx.fillStyle = css('--sel'); ctx.fillRect(sel[0] / data.length * W, 0, (sel[1] - sel[0]) / data.length * W, H);
    }
    if (marks) { // übersteuerte Stellen
      ctx.fillStyle = css('--pin'); ctx.globalAlpha = .28;
      for (let b = 0; b < marks.length; b++) if (marks[b]) { const x = (b * markBlock) / data.length * W; ctx.fillRect(x, 0, Math.max(1, markBlock / data.length * W), H); }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = css('--wave');
    for (let c = 0; c < env.mins.length; c++) {
      const a = mid - (env.maxs[c] / env.peak) * (mid - 3), b = mid - (env.mins[c] / env.peak) * (mid - 3);
      ctx.fillRect(c, a, 1, Math.max(1, b - a));
    }
    ctx.fillStyle = css('--muted'); ctx.font = '10px ' + css('--f-mono'); ctx.textBaseline = 'top';
    const dur = data.length / sr, step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((v) => (dur / v) * 46 <= W) || 300;
    for (let t = step; t < dur; t += step) { const x = t / dur * W; ctx.fillRect(x, H - 5, 1, 5); ctx.fillText(t + ' s', x + 2, 2); }
  }
  let anchor = null;
  const idx = (e) => { const r = canvas.getBoundingClientRect(); return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * data.length); };
  canvas.addEventListener('pointerdown', (e) => { if (!data) return; try { canvas.setPointerCapture(e.pointerId); } catch {} anchor = idx(e); sel = [anchor, anchor]; draw(); });
  canvas.addEventListener('pointermove', (e) => { if (anchor === null) return; const i = idx(e); sel = [Math.min(anchor, i), Math.max(anchor, i)]; draw(); });
  canvas.addEventListener('pointerup', () => {
    if (anchor === null) return; anchor = null;
    if (sel[1] - sel[0] < sr * 0.05) sel = [0, data.length]; // Tippen = alles
    draw(); onSelect(sel);
  });
  new ResizeObserver(resize).observe(canvas);
  return {
    set(d, rate) { data = d; sr = rate; sel = [0, d.length]; env = null; marks = null; draw(); },
    setMarks(f, block = 1024) { marks = f; markBlock = block; draw(); },
    get sel() { return sel; }, setSel(s) { sel = s; draw(); },
  };
}
