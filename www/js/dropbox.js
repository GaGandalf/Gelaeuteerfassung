// ===== Abgleich der gespeicherten Geläute mit Dropbox =====
// Jedes Geläut liegt als <id>.json im App-Ordner der Dropbox (Apps/<App-Name>/gelaeute/).
// Gespeichert wird immer zuerst auf dem Gerät; der Abgleich lädt hoch und herunter, sobald Netz da ist.
// Anmeldung: OAuth mit PKCE ohne Rücksprungadresse – Dropbox zeigt einen Code, der in der App eingefügt wird.
// Der App-Schlüssel ist öffentlich (kein Geheimnis); er stammt aus der Dropbox-Entwicklerkonsole, siehe LIESMICH.md.
const DROPBOX_APP_KEY = '5s1w1yqx22klkbq';

const DBX = (() => {
  const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
  const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
  const API = 'https://api.dropboxapi.com/2/';
  const CONTENT = 'https://content.dropboxapi.com/2/';
  const DIR = '/gelaeute';
  const LS_AUTH = 'gelaeut-dropbox-v1'; // { refresh, access, exp, verifier }
  const LS_META = 'gelaeut-sync-v1'; // { items: { id: { rev, dirty, deleted } }, last }

  let auth = lsGet(LS_AUTH) || {};
  let meta = lsGet(LS_META) || { items: {}, last: 0 };
  let busy = false, again = false, lastError = '';
  const saveAuth = () => lsSet(LS_AUTH, auth);
  const saveMeta = () => lsSet(LS_META, meta);
  const connected = () => !!auth.refresh;
  const path = (id) => `${DIR}/${id}.json`;

  // ----- Anmeldung -----
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function loginUrl() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    auth = { verifier }; saveAuth();
    const q = new URLSearchParams({ client_id: DROPBOX_APP_KEY, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline' });
    return `${AUTH_URL}?${q}`;
  }
  async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: DROPBOX_APP_KEY, ...params }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(j.error_description || j.error || 'Anmeldung fehlgeschlagen'); e.status = res.status; e.auth = true; throw e; }
    return j;
  }
  async function finishLogin(code) {
    if (!auth.verifier) throw new Error('Bitte zuerst die Dropbox-Anmeldung öffnen.');
    const j = await tokenRequest({ grant_type: 'authorization_code', code: code.trim(), code_verifier: auth.verifier });
    auth = { refresh: j.refresh_token, access: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 };
    saveAuth();
    // Beim ersten Verbinden alle Geläute dieses Geräts zum Hochladen vormerken
    for (const id of Object.keys(localAll())) if (!meta.items[id]) meta.items[id] = { dirty: true };
    saveMeta();
  }
  async function accessToken(force) {
    if (!force && auth.access && auth.exp > Date.now() + 60000) return auth.access;
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh });
    auth.access = j.access_token; auth.exp = Date.now() + (j.expires_in || 14400) * 1000; saveAuth();
    return auth.access;
  }
  function disconnect() {
    const t = auth.access;
    if (t) fetch(API + 'auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {});
    auth = {}; saveAuth();
    meta = { items: {}, last: 0 }; saveMeta();
    render();
  }

  // ----- Dropbox-Aufrufe -----
  // Nicht-ASCII-Zeichen im Header escapen (wie die offizielle Dropbox-Bibliothek)
  const headerJson = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));
  async function call(url, init, retried) {
    const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + await accessToken(retried) } });
    if (res.status === 401 && !retried) return call(url, init, true);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const e = new Error(j.error_summary || `Dropbox-Fehler ${res.status}`); e.status = res.status; e.summary = j.error_summary || ''; throw e;
    }
    return res;
  }
  const rpc = (name, arg) => call(API + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) }).then((r) => r.json());
  const upload = (id, body, mode) => call(CONTENT + 'files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJson({ path: path(id), mode, autorename: false, mute: true }) },
    body: new Blob([JSON.stringify(body)], { type: 'application/octet-stream' }),
  }).then((r) => r.json());
  const download = (id) => call(CONTENT + 'files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerJson({ path: path(id) }) } }).then((r) => r.json());
  async function listRemote() {
    const out = new Map();
    let r;
    try { r = await rpc('files/list_folder', { path: DIR }); }
    catch (e) { if (e.summary.startsWith('path/not_found')) return out; throw e; }
    for (;;) {
      for (const f of r.entries) if (f['.tag'] === 'file' && f.name.endsWith('.json')) out.set(f.name.slice(0, -5), { rev: f.rev });
      if (!r.has_more) return out;
      r = await rpc('files/list_folder/continue', { cursor: r.cursor });
    }
  }
  const isConflict = (e) => e.status === 409 && e.summary.startsWith('path/conflict');
  const isNotFound = (e) => e.status === 409 && /not_found/.test(e.summary);

  // ----- Abgleich -----
  async function syncOnce() {
    const remote = await listRemote();
    const all = localAll(), items = meta.items;
    const changed = new Set(), removed = new Set(), notes = [];
    // Auf beiden Seiten geänderte Geläute: die neuere Fassung gewinnt
    async function resolve(id, localBody) {
      const remoteBody = await download(id);
      const { rev } = await rpc('files/get_metadata', { path: path(id) });
      if ((remoteBody.updatedAt || 0) > (localBody.updatedAt || 0)) {
        all[id] = remoteBody; items[id] = { rev }; changed.add(id);
        notes.push(`„${remoteBody.name || 'Geläut'}“: neuere Fassung eines anderen Geräts übernommen.`);
      } else {
        const res = await upload(id, localBody, { '.tag': 'update', update: rev });
        items[id] = { rev: res.rev }; remote.set(id, { rev: res.rev });
      }
    }
    // 1. Auf diesem Gerät gelöschte Geläute auch in der Dropbox löschen
    for (const [id, m] of Object.entries(items)) {
      if (!m.deleted) continue;
      if (remote.has(id)) await rpc('files/delete_v2', { path: path(id) }).catch((e) => { if (!isNotFound(e)) throw e; });
      remote.delete(id); delete items[id];
    }
    // 2. Geänderte Geläute hochladen
    for (const [id, body] of Object.entries(all)) {
      const m = items[id] || (items[id] = { dirty: true });
      if (!m.dirty) continue;
      const r = remote.get(id);
      if (r && !m.rev) { await resolve(id, body); continue; }
      try {
        const res = await upload(id, body, r ? { '.tag': 'update', update: m.rev } : { '.tag': 'add' });
        items[id] = { rev: res.rev }; remote.set(id, { rev: res.rev });
      } catch (e) { if (isConflict(e)) await resolve(id, body); else throw e; }
    }
    // 3. Neue oder anderswo geänderte Geläute herunterladen
    for (const [id, r] of remote) {
      const m = items[id];
      if (m && (m.dirty || m.rev === r.rev)) continue;
      all[id] = await download(id); items[id] = { rev: r.rev }; changed.add(id);
    }
    // 4. Anderswo gelöschte Geläute entfernen (nur bereits abgeglichene, unveränderte)
    for (const id of Object.keys(all)) {
      const m = items[id];
      if (m && m.rev && !m.dirty && !remote.has(id)) { delete all[id]; delete items[id]; removed.add(id); }
    }
    if (changed.size || removed.size) { writeLocal(all); loadLocalList(); updateOpen(all, changed, removed); }
    saveMeta();
    notes.forEach((n) => toast(n));
  }
  // Das geöffnete Geläut nachführen, wenn es auf einem anderen Gerät geändert oder gelöscht wurde
  function updateOpen(all, changed, removed) {
    const id = state.g.id;
    if (!id) return;
    if (removed.has(id)) { state.g.id = null; setDirty(true); renderSaved(); toast('Dieses Geläut wurde auf einem anderen Gerät gelöscht. Mit „Geläut speichern“ neu anlegen.'); return; }
    if (!changed.has(id)) return;
    if (state.dirty) { toast('Dieses Geläut wurde auf einem anderen Gerät geändert. Beim Speichern gewinnt die neuere Fassung.'); return; }
    const s = all[id];
    state.g = { id, name: s.name || '', land: s.land || '', region: s.region || '', ort: s.ort || '', a1: s.a1 || 435, bells: clone(s.bells && s.bells.length ? s.bells : [newBell()]) };
    state.sel = Math.min(state.sel, state.g.bells.length - 1);
    renderAll();
  }
  async function sync() {
    if (!connected() || !DROPBOX_APP_KEY) return;
    if (busy) { again = true; return; }
    busy = true; render();
    try {
      do { again = false; await syncOnce(); } while (again);
      meta.last = Date.now(); saveMeta(); lastError = '';
    } catch (e) {
      if (e.auth && e.status === 400) { auth = {}; saveAuth(); lastError = 'Die Dropbox-Anmeldung ist abgelaufen. Bitte neu verbinden.'; }
      else lastError = e instanceof TypeError || !navigator.onLine ? 'offline' : (e.message || 'Abgleich fehlgeschlagen');
    } finally { busy = false; render(); }
  }

  // ----- Anzeige -----
  const pending = () => Object.values(meta.items).filter((m) => m.dirty || m.deleted).length;
  function render() {
    const st = $('syncState'), dot = $('syncDot'), n = pending();
    const on = connected();
    $('dbxConnect').hidden = on; $('dbxSync').hidden = !on; $('dbxDisconnect').hidden = !on;
    $('dbxConnect').disabled = !DROPBOX_APP_KEY;
    let txt, cls;
    if (!DROPBOX_APP_KEY) { txt = 'Dropbox-App noch nicht eingerichtet'; cls = 'off'; }
    else if (!on) { txt = lastError || 'nicht verbunden'; cls = lastError ? 'err' : 'off'; }
    else if (busy) { txt = 'Abgleich läuft …'; cls = 'busy'; }
    else if (lastError === 'offline') { txt = n ? `offline – ${n} ${n === 1 ? 'Änderung' : 'Änderungen'} ausstehend` : 'offline'; cls = 'warn'; }
    else if (lastError) { txt = lastError; cls = 'err'; }
    else if (n) { txt = `${n} ${n === 1 ? 'Änderung' : 'Änderungen'} ausstehend`; cls = 'warn'; }
    else { txt = meta.last ? 'abgeglichen ' + new Date(meta.last).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : 'verbunden'; cls = 'ok'; }
    st.textContent = txt; dot.className = 'sync-dot ' + cls;
    $('storePill').textContent = on ? 'Mit Dropbox abgeglichen' : 'Gespeichert auf diesem Gerät';
  }

  // ----- Bedienung -----
  async function openLogin() {
    const url = await loginUrl();
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Browser) await cap.Plugins.Browser.open({ url });
    else window.open(url, '_blank', 'noopener');
    $('dbxCode').focus();
  }
  $('dbxConnect').onclick = () => { $('dbxLogin').hidden = false; lastError = ''; render(); };
  $('dbxCancel').onclick = () => { $('dbxLogin').hidden = true; $('dbxCode').value = ''; };
  $('dbxOpen').onclick = () => openLogin().catch(() => toast('Die Dropbox-Anmeldung konnte nicht geöffnet werden.'));
  $('dbxCodeOk').onclick = async () => {
    const code = $('dbxCode').value;
    if (!code.trim()) { $('dbxCode').focus(); return; }
    $('dbxCodeOk').disabled = true;
    try {
      await finishLogin(code);
      $('dbxLogin').hidden = true; $('dbxCode').value = '';
      toast('Mit Dropbox verbunden.');
      await sync();
    } catch (e) { toast(e.auth ? 'Der Code war ungültig oder abgelaufen. Bitte die Anmeldung erneut öffnen.' : 'Verbinden fehlgeschlagen – besteht eine Internetverbindung?'); }
    finally { $('dbxCodeOk').disabled = false; render(); }
  };
  $('dbxSync').onclick = () => sync();
  $('dbxDisconnect').onclick = (e) => armButton(e.currentTarget, 'Wirklich trennen?', () => { disconnect(); toast('Von Dropbox getrennt. Die Geläute bleiben auf diesem Gerät.'); });
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - meta.last > 30000) sync(); });

  return {
    init() { render(); sync(); },
    // Aufrufe aus dem Speichern/Löschen in app.js
    changed(id) { if (!connected()) return; meta.items[id] = { ...(meta.items[id] || {}), dirty: true, deleted: false }; saveMeta(); render(); sync(); },
    removed(id) { if (!connected()) return; const m = meta.items[id]; if (m && m.rev) meta.items[id] = { rev: m.rev, deleted: true }; else delete meta.items[id]; saveMeta(); render(); sync(); },
    sync,
  };
})();
