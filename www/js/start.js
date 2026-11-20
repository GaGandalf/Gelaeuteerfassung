// ===== Start =====
(function start() {
  const m = lsGet(LS.mode);
  if (m) setMode(m);
  const draft = lsGet(LS.draft);
  if (draft && draft.g && Array.isArray(draft.g.bells) && draft.g.bells.length) {
    state.g = draft.g; state.sel = Math.min(draft.sel || 0, draft.g.bells.length - 1); state.dirty = !!draft.dirty;
  } else {
    state.g = demoGelaeut(); state.sel = 0; state.dirty = false;
    // Beispiel-Spektren für die Demo-Glocken
    [1, Math.pow(2, 2 / 12), Math.pow(2, 5 / 12)].forEach((r, i) => {
      const smp = Spectrum.demoBell(44100, 6, r);
      state.g.bells[i].spek = Spectrum.pack(Spectrum.analyze(smp, 44100, 16384), { file: 'Beispielklang (synthetisch)', a: 0, b: 6, dur: 6, date: Date.now() });
    });
  }
  loadLocalList();
  renderAll();
})();
