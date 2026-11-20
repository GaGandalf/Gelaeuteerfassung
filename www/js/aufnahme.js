// ===== Aufnahme direkt im Browser / in der App (unbearbeitetes PCM, als WAV speicherbar) =====
const Recorder = (() => {
  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));

  async function inputs() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { return []; }
  }

  const WORKLET = `class RecProc extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  }
  registerProcessor('rec-proc', RecProc);`;

  // Öffnet das Mikrofon. Zuerst nur Pegelanzeige (mit 3 s Vorlauf-Puffer), record() startet die Aufnahme.
  // laut = true: Gerät darf die Verstärkung automatisch absenken (für sehr laute Glocken)
  async function open({ deviceId = '', sampleRate = 48000, maxSeconds = 300, preroll = 3, laut = false, onLevel, onAutoStop } = {}) {
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        sampleRate: { ideal: sampleRate }, channelCount: { ideal: 1 },
        echoCancellation: false, noiseSuppression: false, autoGainControl: !!laut,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getAudioTracks()[0];
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try { ctx = new AC({ sampleRate }); } catch { ctx = new AC(); }
    await ctx.resume();
    const sr = ctx.sampleRate;
    const src = ctx.createMediaStreamSource(stream);
    let chunks = [], length = 0, recording = false, stopped = false;
    let peak = 0, hold = 0, holdT = 0, clipNow = false, clipCount = 0, sessMax = 0, fNear = 0, fTotal = 0;
    const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
    const take = (data) => {
      if (stopped) return;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]); if (v > peak) peak = v; if (v > sessMax) sessMax = v;
        if (v >= 0.99) clipNow = true;
        if (v >= 0.9 * sessMax) fNear++;
      }
      fTotal += data.length;
      chunks.push(data); length += data.length;
      if (!recording) { // nur Vorlauf behalten
        while (chunks.length > 1 && length - chunks[0].length >= preroll * sr) length -= chunks.shift().length;
      } else if (length >= maxSeconds * sr && onAutoStop) onAutoStop();
    };
    let node;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); node = new AudioWorkletNode(ctx, 'rec-proc'); node.port.onmessage = (e) => take(e.data); } catch { node = null; }
      URL.revokeObjectURL(url);
    }
    if (!node) { // Ersatz für ältere Geräte
      node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => take(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    src.connect(node); node.connect(sink);
    let raf = 0;
    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      if (peak >= hold || now - holdT > 1500) { hold = peak; holdT = now; }
      // Begrenzer des Geräts: viele Werte knapp unter dem bisherigen Höchstwert
      if (sessMax > 0.3 && fTotal > 0 && fNear / fTotal > 0.08 && peak >= 0.85 * sessMax) clipNow = true;
      fNear = 0; fTotal = 0;
      if (clipNow && recording) clipCount++;
      if (onLevel) onLevel({ db: peak > 0 ? 20 * Math.log10(peak) : -Infinity, holdDb: hold > 0 ? 20 * Math.log10(hold) : -Infinity, clip: clipNow, clipCount, recording, seconds: recording ? length / sr : 0 });
      peak = 0; clipNow = false; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settings = track.getSettings ? track.getSettings() : {};
    async function close() {
      stopped = true; cancelAnimationFrame(raf);
      try { src.disconnect(); node.disconnect(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      try { await ctx.close(); } catch {}
    }
    return {
      sampleRate: sr, label: track.label || 'Mikrofon',
      processing: { echo: settings.echoCancellation, noise: settings.noiseSuppression, agc: settings.autoGainControl },
      get recording() { return recording; },
      record() { recording = true; clipCount = 0; },
      async stop() {
        if (stopped) return null;
        const wasRec = recording; await close();
        if (!wasRec) return null;
        const out = new Float32Array(length); let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        chunks = [];
        return { samples: out, sr };
      },
      close,
    };
  }

  // Übersteuerung finden: Werte am Anschlag (≥ 0.99) oder ein Begrenzer des Geräts, der die Spitzen
  // unter 0 dB abflacht. Glockenklänge haben viele Teiltöne und damit nur ganz wenige Werte nahe am
  // Höchstwert; häufen sie sich dort, ist die Aufnahme begrenzt worden.
  // Liefert Blöcke à 1024 Samples mit Markierung und den längsten sauberen Abschnitt.
  function clipping(samples, sr, block = 1024) {
    const n = samples.length, nb = Math.ceil(n / block), flags = new Uint8Array(nb);
    let max = 0; for (let i = 0; i < n; i++) { const v = Math.abs(samples[i]); if (v > max) max = v; }
    const none = { flags, clipped: 0, seconds: 0, best: [0, n], max };
    if (max < 0.2) return none;
    const lvl = 0.9 * max; let near = 0, hard = 0;
    for (let i = 0; i < n; i++) { const v = Math.abs(samples[i]); if (v >= lvl) near++; if (v >= 0.99) hard++; }
    const limited = near / n > 0.002;
    if (hard < 3 && !limited) return none;
    const cnt = new Uint16Array(nb);
    for (let i = 0; i < n; i++) { const v = Math.abs(samples[i]); if (v >= 0.99 || (limited && v >= lvl)) cnt[(i / block) | 0]++; }
    for (let b = 0; b < nb; b++) if (cnt[b] >= 3) flags[b] = 1;
    // Umgebung mitmarkieren (Übergänge)
    const f2 = flags.slice(); for (let b = 0; b < nb; b++) if (flags[b]) { if (b > 0) f2[b - 1] = 1; if (b + 1 < nb) f2[b + 1] = 1; }
    let clipped = 0, bestLen = 0, bestStart = 0, cur = 0, curStart = 0;
    for (let b = 0; b <= nb; b++) {
      if (b < nb && !f2[b]) { if (cur === 0) curStart = b; cur++; }
      else { if (cur > bestLen) { bestLen = cur; bestStart = curStart; } cur = 0; }
      if (b < nb && f2[b]) clipped++;
    }
    if (!clipped) return none;
    return { flags: f2, clipped, seconds: (clipped * block) / sr, best: [bestStart * block, Math.min(n, (bestStart + bestLen) * block)], max };
  }

  // WAV (PCM 16 oder 24 Bit, mono)
  function wav(samples, sr, bits = 24) {
    const bps = bits / 8, n = samples.length, buf = new ArrayBuffer(44 + n * bps), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * bps, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * bps, true); v.setUint16(32, bps, true); v.setUint16(34, bits, true); str(36, 'data'); v.setUint32(40, n * bps, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      if (bits === 16) { v.setInt16(o, Math.round(s * 32767), true); o += 2; }
      else { const x = Math.round(s * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  return { supported, inputs, open, clipping, wav };
})();
