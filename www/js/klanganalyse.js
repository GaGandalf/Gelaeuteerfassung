// ===== Klanganalyse je Glocke: Datei laden oder aufnehmen, Spektrum zeigen, Spitzen als Teiltöne übernehmen =====
const KA = (() => {
  const PK = PARTIALS.filter((p) => !p.computed);
  const audio = new WeakMap(); // Aufnahme der aktuellen Sitzung je Glocke
  let ac = null, src = null;
  const audioCtx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  const prefKey = 'gelaeut-ka-view';
  const tone = (f) => { const i = nearestIdx(f, a1()); return i === null ? '' : tn(DATA.tones[i]); };
  const chart = SpectrumChart($('ka_chart'), {
    onHover(c) {
      $('ka_cur').textContent = c ? c.f.toFixed(1) + ' Hz' : '—';
      $('ka_curDb').textContent = c ? c.db.toFixed(1) + ' dB' + (c.snapped ? ' · Spitze' : '') : '';
      $('ka_ton').textContent = c ? tone(c.f) : '—';
    },
    onPin(c) { $('ka_pin').textContent = c.f.toFixed(1) + ' Hz'; $('ka_pinT').textContent = tone(c.f); markRow(c.f); },
    onView(z) { $('ka_zall').disabled = !z.zoomed; },
  });
  $('ka_zin').onclick = () => chart.zoomIn();
  $('ka_zout').onclick = () => chart.zoomOut();
  $('ka_zall').onclick = () => chart.resetZoom();
  const wave = WaveStrip($('ka_wave'), () => analyze());

  function view() {
    const v = { log: $('ka_axis').value === 'log', fmin: +$('ka_fmin').value, fmax: +$('ka_fmax').value, range: +$('ka_range').value, labels: +$('ka_labels').value, snap: $('ka_snap').checked, a1: a1() };
    chart.set(v); table();
    lsSet(prefKey, { axis: $('ka_axis').value, fmin: $('ka_fmin').value, fmax: $('ka_fmax').value, range: $('ka_range').value, labels: $('ka_labels').value, snap: v.snap, size: $('ka_size').value });
  }
  function info(b, rec) {
    const s = b.spek;
    if (rec) return `<strong>${esc(rec.name)}</strong> · ${(rec.samples.length / rec.sr).toFixed(1)} s · Ausschnitt ${(rec.sel[0] / rec.sr).toFixed(2)}–${(rec.sel[1] / rec.sr).toFixed(2)} s${rec.clip && rec.clip.clipped ? ` · <span class="err">${rec.clip.seconds.toFixed(1)} s übersteuert (rot markiert, nicht ausgewertet)</span>` : ''}`;
    if (s) return `<strong>${esc(s.file || 'Aufnahme')}</strong> · Ausschnitt ${(+s.a).toFixed(2)}–${(+s.b).toFixed(2)} s · gespeichert ${new Date(s.date).toLocaleDateString('de-CH')}. Für eine neue Auswertung (anderer Ausschnitt oder FFT-Grösse) die Aufnahme erneut laden.`;
    return 'WAV, MP3, M4A, OGG oder FLAC hierher ziehen oder wählen. Die Datei wird nur auf diesem Gerät ausgewertet; gespeichert wird das Spektrum.';
  }
  function showBell() {
    const b = bell(), rec = audio.get(b);
    stop();
    $('ka_info').innerHTML = info(b, rec);
    $('ka_state').textContent = b.spek ? 'Spektrum vorhanden' : 'kein Spektrum';
    $('ka_state').classList.toggle('on', !!b.spek);
    $('ka_body').hidden = !b.spek;
    $('ka_del').hidden = !b.spek;
    $('ka_play').hidden = !rec;
    $('ka_waveBox').hidden = !rec;
    $('ka_size').disabled = !rec;
    $('ka_pin').textContent = '—'; $('ka_pinT').textContent = '';
    if (rec) { wave.set(rec.samples, rec.sr); wave.setMarks(rec.clip && rec.clip.clipped ? rec.clip.flags : null); wave.setSel(rec.sel); $('ka_sel').textContent = `${(rec.sel[0] / rec.sr).toFixed(2)} – ${(rec.sel[1] / rec.sr).toFixed(2)} s`; }
    if (b.spek) {
      const { spec, peaks } = Spectrum.unpack(b.spek);
      chart.set({ a1: a1() });
      chart.setData(spec, peaks);
      $('ka_res').textContent = (b.spek.sr / b.spek.N).toFixed(2) + ' Hz';
      $('ka_frames').textContent = `FFT ${b.spek.N}`;
      if (!rec) $('ka_size').value = String(b.spek.N);
      requestAnimationFrame(() => chart.draw());
    } else chart.setData(null);
    table();
  }
  function analyze() {
    const b = bell(), rec = audio.get(b);
    if (!rec) return;
    rec.sel = wave.sel || [0, rec.samples.length];
    $('ka_body').hidden = false; $('ka_busy').hidden = false;
    setTimeout(() => {
      const N = +$('ka_size').value;
      const spec = Spectrum.analyze(rec.samples, rec.sr, N, rec.sel[0], rec.sel[1]);
      b.spek = Spectrum.pack(spec, { file: rec.name, a: Math.round(rec.sel[0] / rec.sr * 100) / 100, b: Math.round(rec.sel[1] / rec.sr * 100) / 100, dur: Math.round(rec.samples.length / rec.sr * 10) / 10, date: Date.now() });
      $('ka_busy').hidden = true;
      setDirty(true);
      showBell();
    }, 30);
  }
  function table() {
    const b = bell(), body = $('ka_peaks');
    const peaks = [...chart.state.peaks].sort((x, y) => x.f - y.f);
    if (!b.spek || !peaks.length) { body.innerHTML = `<tr><td colspan="5" class="hint">${b.spek ? 'Keine deutlichen Spitzen im gewählten Bereich.' : ''}</td></tr>`; return; }
    body.innerHTML = peaks.map((p, i) => {
      const used = PK.filter((q) => Math.abs((num(b.f[q.key]) ?? -1) - p.f) < 0.051).map((q) => q.label);
      return `<tr data-f="${p.f}" data-db="${p.db}"><td class="n">${i + 1}</td><td class="n">${p.f.toFixed(1)}</td><td class="n">${p.db.toFixed(1)}</td><td class="ton">${tone(p.f)}</td><td><select aria-label="Teilton für ${p.f.toFixed(1)} Hz"><option value="">—</option>${PK.map((q) => `<option value="${q.key}">${q.label}</option>`).join('')}</select>${used.length ? `<span class="used">= ${used.join(', ')}</span>` : ''}</td></tr>`;
    }).join('');
  }
  function markRow(f) { [...$('ka_peaks').rows].forEach((r) => r.classList.toggle('on', Math.abs(+r.dataset.f - f) < 0.05)); }

  $('ka_peaks').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.dataset.f || ['SELECT', 'OPTION'].includes(e.target.tagName)) return;
    const p = { f: +tr.dataset.f, db: +tr.dataset.db };
    chart.pin(p); $('ka_pin').textContent = p.f.toFixed(1) + ' Hz'; $('ka_pinT').textContent = tone(p.f); markRow(p.f);
  });
  $('ka_peaks').addEventListener('change', (e) => {
    e.stopPropagation();
    const k = e.target.value, tr = e.target.closest('tr'); if (!k || !tr) return;
    const f = (+tr.dataset.f).toFixed(1), b = bell();
    b.f[k] = f; const inp = $('f_' + k); if (inp) inp.value = f;
    setDirty(true); renderComputed(); renderOverview(); renderTabs(); table();
    toast(`${PK.find((q) => q.key === k).label}: ${f} Hz übernommen.`);
  });

  // Aufnahme/Datei übernehmen: Übersteuerung prüfen, sauberen Ausschnitt wählen (sonst ab dem Anschlag), höchstens 20 s
  function useSamples(b, mono, sr, name) {
    const n = mono.length, cl = Recorder.clipping(mono, sr);
    let start, end;
    if (cl.clipped) { start = cl.best[0]; end = Math.min(cl.best[1], start + sr * 20); }
    else {
      let pk = 0, pv = 0; for (let i = 0; i < n; i += 64) { const v = Math.abs(mono[i]); if (v > pv) { pv = v; pk = i; } }
      start = Math.max(0, pk - Math.round(sr * 0.05)); end = Math.min(n, start + sr * 20);
    }
    audio.set(b, { samples: mono, sr, name, sel: [start, end], clip: cl });
    if (bell() !== b) return cl;
    $('ka_body').hidden = false; $('ka_waveBox').hidden = false;
    wave.set(mono, sr); wave.setMarks(cl.clipped ? cl.flags : null); wave.setSel([start, end]);
    analyze();
    return cl;
  }
  async function load(file) {
    const b = bell();
    $('ka_info').innerHTML = `<strong>${esc(file.name)}</strong> wird gelesen …`;
    try {
      const buf = await file.arrayBuffer();
      const au = await audioCtx().decodeAudioData(buf.slice(0));
      const n = au.length, ch = au.numberOfChannels, mono = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = au.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
      useSamples(b, mono, au.sampleRate, file.name);
    } catch {
      $('ka_info').innerHTML = `<span class="err">„${esc(file.name)}“ konnte nicht gelesen werden.</span> Dieses Format unterstützt das Gerät nicht. Bitte als WAV oder MP3 speichern und erneut laden.`;
    }
  }
  function stop() { if (src) { try { src.stop(); } catch {} src = null; } $('ka_play').textContent = '▶ Abspielen'; }
  $('ka_play').onclick = () => {
    if (src) return stop();
    const rec = audio.get(bell()); if (!rec) return;
    const ctx = audioCtx();
    const s = wave.sel || [0, rec.samples.length], len = Math.max(1, s[1] - s[0]);
    const buf = ctx.createBuffer(1, len, rec.sr); buf.copyToChannel(rec.samples.subarray(s[0], s[0] + len), 0);
    const node = ctx.createBufferSource(); node.buffer = buf; node.connect(ctx.destination);
    node.onended = () => { if (src === node) stop(); };
    ctx.resume(); node.start(); src = node; $('ka_play').textContent = '■ Stopp';
  };
  $('ka_del').onclick = (e) => armButton(e.currentTarget, 'Wirklich entfernen?', () => {
    const b = bell(); delete b.spek; audio.delete(b); setDirty(true); showBell();
  });
  $('ka_file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) load(f); });
  const drop = $('ka_drop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) load(f); });
  ['ka_axis', 'ka_fmin', 'ka_fmax', 'ka_range', 'ka_labels', 'ka_snap'].forEach((id) => $(id).addEventListener('change', (e) => { e.stopPropagation(); view(); }));
  $('ka_size').addEventListener('change', (e) => { e.stopPropagation(); view(); analyze(); });
  $('gA1').addEventListener('change', () => { chart.set({ a1: a1() }); table(); });

  // ----- Aufnahme mit dem Mikrofon -----
  const R = { h: null, target: null, last: null, ledT: 0 };
  const recPrefKey = 'gelaeut-rec';
  const fmtT = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const pctDb = (db) => (db === -Infinity ? 0 : Math.max(0, Math.min(100, ((db + 60) / 60) * 100)));
  $('ka_recOpen').hidden = !Recorder.supported();
  const rp = lsGet(recPrefKey);
  if (rp) { for (const k of ['Rate', 'Bits', 'Max']) if (rp[k] && $('ka_r' + k).querySelector(`option[value="${rp[k]}"]`)) $('ka_r' + k).value = rp[k]; $('ka_rLoud').checked = !!rp.Loud; }
  ['ka_rRate', 'ka_rBits', 'ka_rMax', 'ka_rLoud', 'ka_rDev'].forEach((id) => $(id).addEventListener('change', (e) => {
    e.stopPropagation();
    lsSet(recPrefKey, { Rate: $('ka_rRate').value, Bits: $('ka_rBits').value, Max: $('ka_rMax').value, Loud: $('ka_rLoud').checked });
  }));
  async function fillDevices() {
    const list = await Recorder.inputs(), sel = $('ka_rDev'), cur = sel.value;
    sel.innerHTML = '<option value="">Standard-Mikrofon</option>' + list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Mikrofon ' + (i + 1))}</option>`).join('');
    sel.value = cur;
  }
  function level(l) {
    $('ka_rTime').textContent = fmtT(l.seconds);
    const f = $('ka_rFill'); f.style.width = pctDb(l.db) + '%';
    f.className = 'fill' + (l.clip || l.db > -1 ? ' clip' : l.db > -6 ? ' hot' : '');
    $('ka_rHold').style.left = `calc(${pctDb(l.holdDb)}% - 1px)`;
    if (l.clip) { $('ka_rLed').classList.add('on'); clearTimeout(R.ledT); R.ledT = setTimeout(() => $('ka_rLed').classList.remove('on'), 1200); }
  }
  function micInfo(h) {
    const want = +$('ka_rRate').value, p = h.processing;
    const forced = [p.echo, p.noise].some((x) => x === true) || (!$('ka_rLoud').checked && p.agc === true);
    return `<b>${esc(h.label)}</b> · <b>${(h.sampleRate / 1000).toFixed(1)} kHz</b>${h.sampleRate !== want ? ` (gewünscht ${(want / 1000).toFixed(1)} kHz, vom Gerät nicht unterstützt)` : ''}${$('ka_rLoud').checked ? ' · Verstärkung automatisch' : ''}${forced ? ' · <span class="err">Das Gerät lässt die Tonbearbeitung nicht ganz abschalten.</span>' : ''}`;
  }
  async function openMic() {
    try {
      R.h = await Recorder.open({ deviceId: $('ka_rDev').value, sampleRate: +$('ka_rRate').value, maxSeconds: +$('ka_rMax').value, laut: $('ka_rLoud').checked, onLevel: level, onAutoStop: () => stopRec() });
      fillDevices(); return R.h;
    } catch (e) {
      const msg = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Der Zugriff auf das Mikrofon wurde nicht erlaubt. Bitte in den Browser- bzw. App-Einstellungen freigeben.' : e && e.name === 'NotFoundError' ? 'Kein Mikrofon gefunden.' : 'Das Mikrofon konnte nicht geöffnet werden.';
      $('ka_rStatus').innerHTML = `<span class="err">${msg}</span>`; return null;
    }
  }
  function resetRecUi() {
    $('ka_rMon').classList.remove('on'); $('ka_rMon').textContent = 'Pegel prüfen'; $('ka_rMon').disabled = false;
    $('ka_rBtn').classList.remove('on'); $('ka_rFill').style.width = '0'; $('ka_rHold').style.left = '0';
  }
  async function closeMic() { if (R.h) { const h = R.h; R.h = null; if (h.recording) await h.stop(); else await h.close(); } resetRecUi(); $('ka_rBtnTxt').textContent = 'Aufnahme starten'; }
  $('ka_recOpen').onclick = () => { $('ka_rec').hidden = !$('ka_rec').hidden; $('ka_recOpen').setAttribute('aria-expanded', String(!$('ka_rec').hidden)); if ($('ka_rec').hidden) closeMic(); };
  $('ka_rClose').onclick = () => { closeMic(); $('ka_rec').hidden = true; };
  $('ka_rMon').onclick = async () => {
    if (R.h && !R.h.recording) { await closeMic(); $('ka_rStatus').textContent = 'Pegelprüfung beendet.'; return; }
    if (R.h || !(await openMic())) return;
    $('ka_rMon').classList.add('on'); $('ka_rMon').textContent = 'Prüfung beenden';
    $('ka_rStatus').innerHTML = 'Pegel prüfen mit ' + micInfo(R.h) + '. Es wird noch nichts aufgenommen.';
  };
  async function startRec() {
    if (!R.h && !(await openMic())) return;
    R.target = bell(); R.h.record();
    $('ka_rMon').classList.remove('on'); $('ka_rMon').textContent = 'Pegel prüfen'; $('ka_rMon').disabled = true;
    $('ka_rBtn').classList.add('on'); $('ka_rBtnTxt').textContent = 'Aufnahme beenden'; $('ka_rAfter').hidden = true;
    $('ka_rStatus').innerHTML = `Nimmt auf für <b>Glocke ${state.g.bells.indexOf(R.target) + 1}</b> mit ` + micInfo(R.h) + ' · inkl. 3 s Vorlauf';
  }
  async function stopRec() {
    if (!R.h || !R.h.recording) return;
    const h = R.h; R.h = null;
    const r = await h.stop();
    resetRecUi(); $('ka_rBtnTxt').textContent = 'Neue Aufnahme';
    if (!r || r.samples.length < r.sr * 0.3) { $('ka_rStatus').textContent = 'Die Aufnahme war zu kurz.'; return; }
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const b = R.target && state.g.bells.includes(R.target) ? R.target : bell();
    const no = state.g.bells.indexOf(b) + 1;
    const name = `Aufnahme_Glocke${no}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
    R.last = { ...r, name };
    $('ka_rAfter').hidden = false;
    const cl = useSamples(b, r.samples, r.sr, name);
    const dur = r.samples.length / r.sr;
    let msg = `Aufgenommen für Glocke ${no}: <b>${dur.toFixed(1)} s</b> · ${(r.sr / 1000).toFixed(1)} kHz · Spitzenpegel ${(20 * Math.log10(Math.max(cl.max, 1e-9))).toFixed(1)} dB`;
    if (cl.clipped) {
      const ok = (cl.best[1] - cl.best[0]) / r.sr;
      msg += ok >= 1
        ? ` · <span class="err">${cl.seconds.toFixed(1)} s übersteuert</span> – ausgewertet wird automatisch der saubere Teil ${(cl.best[0] / r.sr).toFixed(1)}–${(Math.min(cl.best[1], cl.best[0] + r.sr * 20) / r.sr).toFixed(1)} s.`
        : ' · <span class="err">Fast durchgehend übersteuert – bitte mit mehr Abstand oder „Sehr laut“ erneut aufnehmen.</span>';
    } else msg += ' · <span class="okmsg">nicht übersteuert</span>';
    $('ka_rStatus').innerHTML = msg;
  }
  $('ka_rBtn').onclick = () => (R.h && R.h.recording ? stopRec() : startRec());
  $('ka_rSave').onclick = () => { if (R.last) offerFile(R.last.name + '.wav', Recorder.wav(R.last.samples, R.last.sr, +$('ka_rBits').value)); };

  const pref = lsGet(prefKey);
  if (pref) {
    for (const k of ['axis', 'fmin', 'fmax', 'range', 'labels', 'size']) if (pref[k] && $('ka_' + k).querySelector(`option[value="${pref[k]}"]`)) $('ka_' + k).value = pref[k];
    $('ka_snap').checked = pref.snap !== false;
  }
  // Bereich auf- und zuklappen, Zustand merken
  const fold = $('ka_fold');
  if (lsGet(LS.kaOpen) === false) fold.open = false;
  fold.addEventListener('toggle', () => lsSet(LS.kaOpen, fold.open));

  chart.set({ log: $('ka_axis').value === 'log', fmin: +$('ka_fmin').value, fmax: +$('ka_fmax').value, range: +$('ka_range').value, labels: +$('ka_labels').value, snap: $('ka_snap').checked });
  return { showBell };
})();
window.KA = KA;
