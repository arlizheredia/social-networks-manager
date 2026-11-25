/* Publicación automática en grupos (de Facebook Publisher). Se ejecuta en su propio ámbito. */
(() => {
/* Social Networks Manager · publicación en grupos (service worker)
 * Recibe de la app (vía bridge.js) una publicación para un grupo, abre el grupo en una
 * ventana dedicada con la sesión del usuario y pide a fb.js que la publique.
 * Los límites de ritmo (pausas, máximos por hora y día) los aplica la app antes de cada envío. */
const APP_URL = [
  /^https:\/\/arlizheredia\.github\.io\/social-networks-manager\//,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//
];
const GROUP_URL = /^https:\/\/www\.facebook\.com\/groups\/[\w.\-]+\/$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fbTabId = null, fbWinId = null, appTabId = null, busy = false, wins = [], ownTabs = [];
/* El service worker se apaga tras unos segundos sin actividad (p. ej. durante la pausa entre grupos).
   Las ventanas abiertas se guardan en storage.session para reutilizarlas y cerrarlas tras un reinicio. */
const ST = chrome.storage.session;
const ready = ST.get(['fbWinId', 'fbTabId', 'appTabId', 'wins', 'ownTabs']).then(v => {
  ownTabs = Array.isArray(v.ownTabs) ? v.ownTabs : [];
  fbWinId = v.fbWinId ?? null; fbTabId = v.fbTabId ?? null; appTabId = v.appTabId ?? null; wins = Array.isArray(v.wins) ? v.wins : [];
}).catch(() => {});
const saveState = () => ST.set({fbWinId, fbTabId, appTabId, wins, ownTabs}).catch(() => {});
chrome.tabs.onRemoved.addListener(id => { ready.then(() => { if (!ownTabs.includes(id) && id !== fbTabId) return; ownTabs = ownTabs.filter(t => t !== id); if (id === fbTabId) { fbTabId = null; fbWinId = null; } saveState(); }); });
chrome.windows.onRemoved.addListener(id => { ready.then(() => { if (!wins.includes(id) && id !== fbWinId) return; wins = wins.filter(w => w !== id); if (id === fbWinId) { fbWinId = null; fbTabId = null; } saveState(); }); });
async function closeAll() {
  await ready;
  const ids = [...new Set([...wins, fbWinId].filter(x => x != null))];
  await Promise.all(ids.map(id => chrome.windows.remove(id).catch(() => {})));
  await Promise.all(ownTabs.map(id => chrome.tabs.remove(id).catch(() => {})));
  wins = []; ownTabs = []; fbWinId = null; fbTabId = null; saveState(); setBadge('');
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  if (msg.from === 'fb' && msg.type === 'progress') { progress(msg.step); return; }
  if (msg.from !== 'bridge') return;
  if (!APP_URL.some(r => r.test(sender.url || ''))) { send({ok: false, step: 'ext', error: 'Origen no permitido'}); return; }
  if (sender.tab && sender.tab.id !== appTabId) { appTabId = sender.tab.id; ready.then(saveState); }
  if (msg.cmd === 'post') {
    if (busy) { send({ok: false, step: 'ext', error: 'Ya hay una publicación en curso'}); return; }
    busy = true;
    handlePost(msg.job).then(r => { notifyResult(msg.job, r); return r; }).then(send, e => send({ok: false, step: 'ext', error: String((e && e.message) || e)})).finally(() => { busy = false; });
    return true;
  }
  if (msg.cmd === 'reply') {
    if (busy) { send({ok: false, step: 'ext', error: 'Ya hay una publicación en curso'}); return; }
    busy = true;
    handleReply(msg.job).then(send, e => send({ok: false, step: 'ext', error: String((e && e.message) || e)})).finally(() => { busy = false; });
    return true;
  }
  if (msg.cmd === 'checkUpdate') { checkUpdate().then(send, e => send({ok: false, error: String(e && e.message || e)})); return true; }
  if (msg.cmd === 'update') { openUpdater(!!(msg.job && msg.job.auto)).then(() => send({ok: true}), e => send({ok: false, error: String(e && e.message || e)})); return true; }
  if (msg.cmd === 'badge') { setBadge(typeof msg.job?.text === 'string' ? msg.job.text.slice(0, 4) : ''); send({ok: true}); return; }
  if (msg.cmd === 'notify') {
    const j = msg.job || {};
    if (chrome.notifications && typeof j.title === 'string' && typeof j.message === 'string')
      osNotify({title: j.title.slice(0, 120), message: j.message.slice(0, 300)});
    send({ok: true}); return;
  }
  if (msg.cmd === 'preview') { preview(msg.job && msg.job.url).then(send, () => send({ok: false})); return true; }
  if (msg.cmd === 'closeFb') { closeAll().then(() => send({ok: true})); return true; }
  if (msg.cmd === 'status') { checkStatus(!!(msg.job && msg.job.details)).then(send); return true; }
  if (msg.cmd === 'focusApp') { if (appTabId != null) chrome.tabs.update(appTabId, {active: true}).catch(() => {}); send({ok: true}); return; }
  send({ok: false, step: 'ext', error: 'Orden desconocida'});
});

/* Conexión con Facebook y sesión iniciada.
 * Solo se lee la cookie c_user (identificador numérico del usuario), nunca el token de sesión (xs).
 * Con details, se consulta facebook.com/me para mostrar el nombre y la foto del perfil propio.
 * Nada se envía fuera del navegador. */
let who = {id: null, at: 0, data: null};
const ent = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function b64(buf) { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function imgData(u, max) {
  if (!/^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|facebook\.com)\//i.test(u)) return null;
  const ir = await fetch(u, {credentials: 'omit'});
  const type = (ir.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = await ir.arrayBuffer();
  return /^image\/(jpeg|png|webp|gif)$/.test(type) && buf.byteLength < max ? `data:${type};base64,${b64(buf)}` : null;
}
const meta = (html, k) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
            html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["']`, 'i'));
  return m ? ent(m[1]) : '';
};
/* Vista previa de la publicación de origen: miniatura, título y descripción (etiquetas og:) */
async function preview(url) {
  if (typeof url !== 'string' || !/^https:\/\/(www\.facebook\.com|fb\.watch)\//.test(url)) return {ok: false};
  const r = await fetch(url, {credentials: 'include', cache: 'no-store'});
  const html = (await r.text()).slice(0, 3e6);
  const title = meta(html, 'og:title') || ent((html.match(/<title[^>]*>([^<]{1,300})<\/title>/i) || [])[1] || '');
  const description = meta(html, 'og:description');
  let image = null, t2 = '';
  const og = meta(html, 'og:image');
  if (og) { try { image = await imgData(og, 1500000); } catch {} }
  if (!image) {
    /* Plan B: abrir la publicación en una pestaña en segundo plano y leer la imagen ya cargada */
    const got = await readInTab(url);
    if (got && got.image) { try { image = await imgData(got.image, 1500000); } catch {} }
    if (got && got.title) t2 = got.title;
  }
  const clean = t => t.replace(/\s*[|\-–]\s*Facebook\s*$/i, '').trim();
  return {ok: !!(title || t2 || image), title: clean(title || t2).slice(0, 200), description: description.slice(0, 300), image};
}
async function readInTab(url) {
  let tab;
  try {
    tab = await chrome.tabs.create({url, active: false});
    await new Promise(res => {
      const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(); }, 25000);
      const l = (id, info) => { if (id === tab.id && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(); } };
      chrome.tabs.onUpdated.addListener(l);
    });
    for (let i = 0; i < 16; i++) {
      try { const r = await chrome.tabs.sendMessage(tab.id, {cmd: 'meta'}); if (r && (r.image || i > 10)) return r; } catch {}
      await sleep(700);
    }
    return null;
  } catch { return null; } finally { if (tab) chrome.tabs.remove(tab.id).catch(() => {}); }
}
async function whoAmI(id) {
  if (who.id === id && who.data && Date.now() - who.at < 10 * 60e3) return who.data;
  const data = {name: '', avatar: null, profileUrl: null};
  try {
    const r = await fetch('https://www.facebook.com/me', {credentials: 'include', cache: 'no-store'});
    const html = (await r.text()).slice(0, 2e6);
    const t = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1] || '';
    const name = ent(t).replace(/^\(\d+\)\s*/, '').replace(/\s*[|\-–]\s*Facebook\s*$/i, '').trim();
    if (name && !/^facebook$/i.test(name) && !/inicia sesi[oó]n|log in/i.test(name) && name.length <= 80) data.name = name;
    if (/^https:\/\/www\.facebook\.com\/[^?#]+/.test(r.url) && !/\/login/.test(r.url)) data.profileUrl = r.url.split('?')[0];
    const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) || [])[1];
    if (og) data.avatar = await imgData(ent(og), 300000);
  } catch { /* sin detalles: se muestra solo el identificador */ }
  who = {id, at: Date.now(), data};
  return data;
}
async function checkStatus(details) {
  let online = true;
  try {
    /* Con conexiones lentas la prueba puede tardar: se espera hasta 20 s y se reintenta una vez antes de darla por fallida */
    const probe = async (ms) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms); try { await fetch('https://www.facebook.com/favicon.ico', {cache: 'no-store', credentials: 'omit', signal: ctl.signal}); } finally { clearTimeout(t); } };
    try { await probe(20000); } catch { await probe(20000); }
  } catch { online = false; }
  let loggedIn = null, userId = null;
  try { const c = await chrome.cookies.get({url: 'https://www.facebook.com/', name: 'c_user'}); loggedIn = !!(c && c.value); if (loggedIn && /^\d{1,20}$/.test(c.value)) userId = c.value; } catch { loggedIn = null; }
  const res = {ok: true, online, loggedIn, userId};
  if (details && online && loggedIn) Object.assign(res, await whoAmI(userId));
  return res;
}

/* Notificación del sistema cuando Facebook muestra un mensaje */
function notifyResult(job, r) {
  if (!r || job.test || !job.notify || !chrome.notifications) return;
  const msgs = Array.isArray(r.messages) ? r.messages : [];
  if (!msgs.length && !r.blocked) return;
  const group = typeof job.groupName === 'string' ? job.groupName.slice(0, 80) : 'un grupo';
  const title = r.blocked ? `Facebook mostró un aviso en «${group}»` : `Facebook mostró un mensaje en «${group}»`;
  const text = (r.blocked ? r.error : msgs[0]) || '';
  osNotify({title, message: String(text).slice(0, 250) + (r.blocked ? '\nSe ha detenido la publicación para proteger tu cuenta.' : ''), requireInteraction: !!r.blocked});
}
if (chrome.notifications) chrome.notifications.onClicked.addListener(async id => {
  await ready;
  if (appTabId != null) chrome.tabs.get(appTabId).then(t => { chrome.windows.update(t.windowId, {focused: true}); chrome.tabs.update(appTabId, {active: true}); }).catch(() => {});
  chrome.notifications.clear(id);
});

/* ---- Autoactualización (extensión instalada «descomprimida») ---- */
const REMOTE = 'https://arlizheredia.github.io/social-networks-manager/extension/';
const verGt = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate() {
  const r = await fetch(REMOTE + 'manifest.json?t=' + Date.now(), {cache: 'no-store'});
  const m = await r.json();
  const current = chrome.runtime.getManifest().version, latest = String(m.version || '');
  return {ok: true, current, latest, available: /^\d+\.\d+\.\d+$/.test(latest) && verGt(latest, current)};
}
async function openUpdater(auto) {
  await ready;
  const url = chrome.runtime.getURL('update.html') + (auto ? '?auto=1' : '');
  const open = (await chrome.tabs.query({})).find(t => (t.url || '').startsWith(chrome.runtime.getURL('update.html')));
  if (open) { await chrome.tabs.update(open.id, {url, active: !auto}); return; }
  let windowId; try { if (appTabId != null) windowId = (await chrome.tabs.get(appTabId)).windowId; } catch {}
  await chrome.tabs.create({url, active: !auto, ...(windowId != null ? {windowId} : {})});
}
/* Tras actualizarse: recarga las pestañas de la app para que se conecten a la versión nueva */
chrome.runtime.onInstalled.addListener(async d => {
  if (d.reason !== 'update') return;
  const {updatedTo} = await chrome.storage.local.get('updatedTo').catch(() => ({}));
  if (!updatedTo || updatedTo !== chrome.runtime.getManifest().version) return;
  await chrome.storage.local.remove(['updatedTo']).catch(() => {});
  for (const t of await chrome.tabs.query({})) if (APP_URL.some(r => r.test(t.url || ''))) chrome.tabs.reload(t.id).catch(() => {});
});

/* Porcentaje en el icono de la extensión: se ve aunque trabajes en otra cosa. Al pulsarlo vuelves a la app. */
/* Notificación del sistema. Con storage.session.dryNotify (lo activan los tests) se registra sin mostrarse. */
async function osNotify(opts) {
  if (!chrome.notifications) return;
  const v = await ST.get(['dryNotify', 'dryLog']).catch(() => ({}));
  if (v.dryNotify) { await ST.set({dryLog: [...(v.dryLog || []), {title: opts.title, message: opts.message}].slice(-50)}).catch(() => {}); return; }
  chrome.notifications.create('', {type: 'basic', iconUrl: 'icon128.png', priority: 2, ...opts}, () => void chrome.runtime.lastError);
}
function setBadge(text) { try { chrome.action.setBadgeBackgroundColor({color: '#0b57d0'}); chrome.action.setBadgeText({text}); } catch {} }
function focusApp() { ready.then(() => { if (appTabId != null) chrome.tabs.get(appTabId).then(t => { chrome.windows.update(t.windowId, {focused: true}); chrome.tabs.update(appTabId, {active: true}); }).catch(() => {}); }); }
if (chrome.action) chrome.action.onClicked.addListener(focusApp);

function progress(step) {
  ready.then(() => { if (appTabId != null) chrome.tabs.sendMessage(appTabId, {to: 'bridge', type: 'progress', step}).catch(() => {}); });
}

function validJob(j) {
  return j && typeof j === 'object' && typeof j.url === 'string' && GROUP_URL.test(j.url) &&
    typeof j.text === 'string' && j.text.length <= 63206 && (j.notify == null || typeof j.notify === 'boolean') && (j.win == null || ['nofocus', 'tab', 'minimized', 'focused'].includes(j.win)) && (!j.link || (typeof j.link === 'string' && /^https:\/\/(www\.facebook\.com|fb\.watch)\//.test(j.link))) && Array.isArray(j.files) && j.files.length <= 20 &&
    j.files.every(f => f && typeof f.name === 'string' && /^(image|video)\//.test(f.type) && typeof f.data === 'string');
}

/* Dónde trabaja la extensión (para no interrumpir al usuario):
   nofocus  = ventana aparte, pequeña, en una esquina y sin quitar el foco (por defecto)
   tab      = pestaña en segundo plano en la ventana de la app
   minimized= ventana minimizada
   focused  = ventana en primer plano (lo más fiable si Facebook no responde en segundo plano) */
/* Ventana pequeña pegada al borde derecho de la ventana de la app (posición válida en cualquier pantalla) */
async function noFocusBounds(url) {
  const o = {url, type: 'normal', focused: false, width: 560, height: 820};
  try {
    if (appTabId != null) { const w = await chrome.windows.get((await chrome.tabs.get(appTabId)).windowId);
      if (w && w.width) { o.height = Math.max(600, Math.min(900, w.height || 820)); o.left = Math.max(0, (w.left || 0) + w.width - o.width); o.top = Math.max(0, w.top || 0); } }
  } catch {}
  return o;
}
async function openGroup(url, mode) {
  await ready;
  mode = ['nofocus', 'tab', 'minimized', 'focused'].includes(mode) ? mode : 'nofocus';
  let tabId = null;
  if (fbTabId != null) { try { const t = await chrome.tabs.get(fbTabId); if ((mode === 'tab') === (fbWinId == null)) tabId = fbTabId; else { await closeAll(); } void t; } catch { fbTabId = null; } }
  const loaded = new Promise(res => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(false); }, 45000);
    const l = (id, info) => { if (id === (tabId ?? fbTabId) && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(true); } };
    chrome.tabs.onUpdated.addListener(l);
  });
  if (tabId != null) {
    await chrome.tabs.update(tabId, mode === 'focused' ? {url, active: true} : {url});
    if (mode === 'focused' && fbWinId != null) chrome.windows.update(fbWinId, {focused: true}).catch(() => {});
  } else if (mode === 'tab') {
    let windowId;
    try { if (appTabId != null) windowId = (await chrome.tabs.get(appTabId)).windowId; } catch {}
    const t = await chrome.tabs.create({url, active: false, ...(windowId != null ? {windowId} : {})});
    fbTabId = tabId = t.id; fbWinId = null; ownTabs = [...new Set([...ownTabs, t.id])]; saveState();
  } else {
    const opts = mode === 'minimized' ? {url, type: 'normal', state: 'minimized'}
      : mode === 'focused' ? {url, type: 'normal', focused: true, width: 1100, height: 900}
      : await noFocusBounds(url);
    let w;
    try { w = await chrome.windows.create(opts); }
    catch {
      const {left, top, ...noPos} = opts; void left; void top;       // posición rechazada (fuera de pantalla): se conserva el tamaño
      try { w = await chrome.windows.create(noPos); } catch { w = await chrome.windows.create({url, type: 'normal', focused: mode === 'focused'}); }
    }
    fbWinId = w.id; fbTabId = tabId = w.tabs[0].id; wins = [...new Set([...wins, w.id])]; saveState();
  }
  const ok = await loaded;
  return ok ? tabId : null;
}

/* Responder a un comentario de Facebook con la sesión del usuario */
const validReply = j => j && typeof j === 'object' && typeof j.url === 'string' && /^https:\/\/(www|web|m)\.facebook\.com\//.test(j.url) && /comment_id=/.test(j.url) &&
  typeof j.text === 'string' && j.text.trim().length > 0 && j.text.length <= 8000 && (j.win == null || ['nofocus', 'tab', 'minimized', 'focused'].includes(j.win));
async function handleReply(job) {
  if (!validReply(job)) return {ok: false, step: 'ext', error: 'Datos de la respuesta no válidos (falta el enlace del comentario)'};
  const st = await checkStatus();
  if (st.loggedIn === false) return {ok: false, step: 'login', error: 'No has iniciado sesión en Facebook en este navegador.'};
  progress('Abriendo el comentario…');
  const url = job.url.replace(/^https:\/\/(web|m)\./, 'https://www.');
  const tabId = await openGroup(url, job.win);
  if (tabId == null) return {ok: false, step: 'load', error: 'La publicación no terminó de cargar'};
  let r = null;
  for (let i = 0; i < 30 && !r; i++) {
    try { r = await chrome.tabs.sendMessage(tabId, {cmd: 'reply', job}); } catch { /* fb.js aún no está listo */ }
    if (!r) await sleep(500);
  }
  if (!r) return {ok: false, step: 'load', error: 'No se pudo conectar con la página de Facebook'};
  if (r.ok && !r.test && job.close) await closeAll();
  return r;
}

async function handlePost(job) {
  if (!validJob(job)) return {ok: false, step: 'ext', error: 'Datos de publicación no válidos'};
  const st = await checkStatus();
  if (!st.online) return {ok: false, step: 'network', error: 'Sin conexión con Facebook. Comprueba tu conexión a Internet.'};
  if (st.loggedIn === false) return {ok: false, step: 'login', error: 'No has iniciado sesión en Facebook en este navegador.'};
  progress('Abriendo el grupo…');
  const tabId = await openGroup(job.url, job.win);
  if (tabId == null) return {ok: false, step: 'load', error: 'El grupo no terminó de cargar'};
  for (let i = 0; i < 30; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, {cmd: 'post', job});
      if (r) return r;
    } catch { /* fb.js aún no está listo */ }
    await sleep(500);
  }
  return {ok: false, step: 'load', error: 'No se pudo conectar con la página de Facebook'};
}

})();
