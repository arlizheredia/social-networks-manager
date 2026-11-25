/* Extracción automática de comentarios (de Social Comments Analyzer). Se ejecuta en su propio ámbito. */
(() => {
// Service worker de la extensión: abre cada publicación, inyecta el extractor y devuelve el progreso y el resultado a la app.
const VERSION = chrome.runtime.getManifest().version;
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(facebook\.com|instagram\.com|tiktok\.com)\//i;
const ports = new Set();          // pestañas de la app conectadas
const jobs = new Map();           // jobId -> { tabId, port, timer, done }
let workWindowId = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const verLt = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };

// ---- Actualización automática del extractor ----
// La app envía el extractor publicado; solo se acepta si lo firmó la clave privada del autor (la pública va aquí)
// y es más nuevo que el que ya hay. Se ejecuta con chrome.userScripts, que Chrome permite tras activar
// «Permitir scripts de usuario» en los detalles de la extensión (una sola vez).
const PUBKEY = {"kty":"EC","crv":"P-256","x":"IEhM7QsqQa6dJzQThCMssAs7j5aPy4DCyAb1RO3yHXg","y":"8Ujky7ZOum2ssAJZ1xeAupb-50KG5d1sNdqdZhL25Oc"};   // la escribe tools/build_extension.py
const HEAD_RE = /sca-extractor (\d+\.\d+\.\d+) · requiere extensión (\d+\.\d+\.\d+)/;
let packaged = null;
async function packagedExtractor() {
  if (!packaged) { try { const m = (await (await fetch(chrome.runtime.getURL('extractor.js'))).text()).match(HEAD_RE); packaged = { version: m ? m[1] : VERSION }; } catch (e) { packaged = { version: VERSION }; } }
  return packaged;
}
async function storedExtractor() {
  const { extractorUpdate: u } = await chrome.storage.local.get('extractorUpdate');
  const p = await packagedExtractor();
  return u && verLt(p.version, u.version) && !verLt(VERSION, u.min) ? u : null;
}
function userScriptsOn() { try { chrome.userScripts.getScripts(); return true; } catch (e) { return false; } }
async function extInfo() {
  const u = await storedExtractor(), p = await packagedExtractor(), on = userScriptsOn();
  return { version: VERSION, extractor: u && on ? u.version : p.version, downloaded: u ? u.version : null, userScripts: on, updates: true };
}
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function applyExtractorUpdate(code, sig) {
  const m = String(code || '').match(HEAD_RE);
  if (!m || !sig) throw new Error('El extractor recibido no es válido.');
  const [, version, min] = m;
  if (verLt(VERSION, min)) throw new Error('Este extractor necesita la versión ' + min + ' de la extensión.');
  const cur = await storedExtractor(), p = await packagedExtractor();
  if (!verLt(cur ? cur.version : p.version, version)) return false;   // ya está al día
  const key = await crypto.subtle.importKey('jwk', PUBKEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64(sig), new TextEncoder().encode(code));
  if (!ok) throw new Error('La firma del extractor no es válida: no se instala.');
  await chrome.storage.local.set({ extractorUpdate: { version, min, code, at: Date.now() } });
  return true;
}

// ---- Versión nueva copiada en la carpeta: se activa sola ----
// Chrome lee la extensión descomprimida desde su carpeta: si el manifiesto del disco tiene otra versión, se recarga
// (nunca durante una extracción) y vuelve a conectar las pestañas abiertas de la app.
const APP_URLS = ['https://arlizheredia.github.io/social-networks-manager/*', 'http://localhost/*', 'http://127.0.0.1/*'];
async function checkDisk() {
  if (jobs.size) return false;
  let v = VERSION;
  try { v = (await (await fetch(chrome.runtime.getURL('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' })).json()).version; } catch (e) { return false; }
  if (!v || v === VERSION) return false;
  ports.forEach(p => { try { p.postMessage({ type: 'reloading', from: VERSION, version: v }); } catch (e) {} });
  setTimeout(() => chrome.runtime.reload(), 300);
  return true;
}
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'update' && reason !== 'install') return;
  try { for (const t of await chrome.tabs.query({ url: APP_URLS })) chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge-extractor.js'] }).catch(() => {}); } catch (e) {}
});
// Mientras hay trabajos, el sistema no se suspende (la pantalla sí puede apagarse): permite dejar el seguimiento trabajando solo
function keepAwake(){ try { if (jobs.size) chrome.power.requestKeepAwake('system'); else chrome.power.releaseKeepAwake(); } catch (e) {} }
const send = (job, msg) => { try { (job && job.port ? job.port : [...ports][0])?.postMessage(msg); } catch (e) {} };

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'sca-app') return;
  ports.add(port);
  extInfo().then(i => { try { port.postMessage(Object.assign({ type: 'ready' }, i)); } catch (e) {} });
  checkDisk();
  port.onMessage.addListener(msg => onAppMessage(port, msg));
  port.onDisconnect.addListener(() => ports.delete(port));
});

// ---- Sesiones: solo se comprueba si existe la cookie de sesión de cada red (nunca se lee ni se envía su valor) ----
const SESSION_COOKIES = { facebook: ['https://www.facebook.com', ['c_user']], instagram: ['https://www.instagram.com', ['sessionid']], tiktok: ['https://www.tiktok.com', ['sessionid', 'sessionid_ss', 'sid_tt']] };
async function sessions() {
  const out = { type: 'sessions' };
  for (const [net, [url, names]] of Object.entries(SESSION_COOKIES)) {
    out[net] = false;
    for (const name of names) { try { const c = await chrome.cookies.get({ url, name }); if (c && c.value) { out[net] = true; break; } } catch (e) {} }
  }
  return out;
}
const SESSION_NAMES = new Set(Object.values(SESSION_COOKIES).flatMap(x => x[1]));
chrome.cookies.onChanged.addListener(ch => {
  if (!SESSION_NAMES.has(ch.cookie.name) || !/(facebook|instagram|tiktok)\.com$/.test(ch.cookie.domain)) return;
  clearTimeout(sessions.t); sessions.t = setTimeout(async () => { const s = await sessions(); ports.forEach(p => { try { p.postMessage(s); } catch (e) {} }); }, 400);
});
async function waitReady(tabId, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
      if (tab.url && /^https:/.test(tab.url)) {
        const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.readyState !== 'loading' && !!document.body && document.body.childElementCount > 0 });
        if (r && r.result) return;
      }
    } catch (e) { if (/No tab/i.test(e.message || '')) throw new Error('Se cerró la ventana de la publicación.'); }
    await sleep(300);
  }
  throw new Error('La publicación tardó demasiado en cargar.');
}

async function onAppMessage(port, msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'ping') return port.postMessage(Object.assign({ type: 'pong' }, await extInfo()));
  if (msg.type === 'check-update') { if (!(await checkDisk())) port.postMessage(Object.assign({ type: 'pong' }, await extInfo())); return; }
  if (msg.type === 'open-settings') return chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
  if (msg.type === 'extractor-update') {
    let r;
    try { r = { ok: true, changed: await applyExtractorUpdate(msg.code, msg.sig) }; } catch (e) { r = { ok: false, error: e.message || String(e) }; }
    return port.postMessage(Object.assign({ type: 'extractor-updated' }, r, await extInfo()));
  }
  if (msg.type === 'sessions') return port.postMessage(await sessions());
  if (msg.type === 'extract') return startJob(port, msg);
  if (msg.type === 'stop') return stopJob(msg.jobId, 'stopped');
}

// Ventana de trabajo: siempre con ancho de escritorio (las redes muestran la versión móvil, sin comentarios, en ventanas estrechas).
//  - "small" (por defecto): detrás de las ventanas del usuario, que recupera el foco
//  - "minimized": se crea a tamaño de escritorio y después se minimiza
//  - "normal": a la vista
async function workWindow(mode) {
  if (workWindowId != null) {
    try { await chrome.windows.get(workWindowId); return workWindowId; } catch (e) { workWindowId = null; }
  }
  let prev = null; try { prev = await chrome.windows.getLastFocused(); } catch (e) {}
  const w = await chrome.windows.create({ url: 'about:blank', type: 'normal', focused: mode === 'normal', width: 1280, height: 900 });
  workWindowId = w.id;
  if (mode === 'minimized') { try { await chrome.windows.update(w.id, { state: 'minimized' }); } catch (e) {} }
  // devolver el foco a la ventana en la que estaba trabajando el usuario
  if (mode !== 'normal' && prev && prev.id !== w.id) { try { await chrome.windows.update(prev.id, { focused: true }); } catch (e) {} }
  return w.id;
}
function waitComplete(tabId, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); reject(new Error('La publicación tardó demasiado en cargar.')); }, ms);
    const l = (id, info) => { if (id === tabId && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } }).catch(() => {});
  });
}

// Prepara en la pestaña el canal entre el extractor y la extensión
function setupAuto(id) {
  window.__fbcx = false;
  window.__scaAuto = { jobId: id, stopRequested: false, emit: e => { try { chrome.runtime.sendMessage(Object.assign({ sca: true, jobId: id }, e)); } catch (err) {} },
    // espera medida por el service worker (sin el frenado de temporizadores de las pestañas ocultas)
    sleep: ms => new Promise(r => { let done = false; const fin = () => { if (!done) { done = true; r(); } };
      try { chrome.runtime.sendMessage({ sca: true, jobId: id, type: 'sleep', ms }, () => { void chrome.runtime.lastError; fin(); }); } catch (err) { setTimeout(fin, ms); }
      setTimeout(fin, ms + 60000); }) };
}

async function startJob(port, { jobId, url, options = {} }) {
  if (!jobId || !ALLOWED.test(url || '')) return port.postMessage({ type: 'error', jobId, error: 'Enlace no admitido. Solo Facebook, Instagram o TikTok.' });
  const job = { port, tabId: null, done: false };
  jobs.set(jobId, job); keepAwake();
  try {
    send(job, { type: 'progress', jobId, phase: 'opening' });
    const winId = await workWindow(options.window || (options.visible ? 'normal' : 'small'));
    const tab = await chrome.tabs.create({ windowId: winId, url, active: true });
    job.tabId = tab.id;
    // quitar la pestaña en blanco inicial de la ventana de trabajo
    chrome.tabs.query({ windowId: winId }).then(ts => ts.filter(t => t.url === 'about:blank' && t.id !== tab.id).forEach(t => chrome.tabs.remove(t.id).catch(() => {})));
    // se inyecta en cuanto la página es interactiva (sin esperar a todas sus imágenes y vídeos): el extractor ya espera a que aparezca la publicación
    await waitReady(tab.id, 60000);
    await sleep(options.settleMs || 700);
    if (job.done) return;
    const now = await chrome.tabs.get(tab.id);
    if (/\/login|\/accounts\/login|checkpoint/i.test(now.url || '')) throw new Error('Inicia sesión en ' + new URL(url).hostname.replace(/^www\./, '') + ' en este navegador y vuelve a intentarlo.');
    if (!ALLOWED.test(now.url || '')) throw new Error('La publicación redirigió a otra página.');
    // extractor actualizado (si lo hay y Chrome lo permite) o el que viene en la carpeta de la extensión
    const up = await storedExtractor();
    if (up && userScriptsOn()) {
      try { await chrome.userScripts.configureWorld({ messaging: true }); } catch (e) {}
      await chrome.userScripts.execute({ target: { tabId: tab.id }, world: 'USER_SCRIPT', js: [{ code: '(' + setupAuto.toString() + ')(' + JSON.stringify(jobId) + ');' }, { code: up.code }] });
      job.world = 'USER_SCRIPT';
    } else {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: setupAuto, args: [jobId] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extractor.js'] });
    }
    send(job, { type: 'progress', jobId, phase: 'extracting' });
    job.timer = setTimeout(() => stopJob(jobId, 'timeout'), (options.maxMinutes || 20) * 60000);
  } catch (e) {
    finishJob(jobId, { type: 'error', jobId, error: e.message || String(e) }, options.keepOpen);
  }
}

async function stopJob(jobId, why) {
  const job = jobs.get(jobId); if (!job || job.done) return;
  job.stopWhy = why;
  if (job.tabId != null) {
    try {
      if (job.world === 'USER_SCRIPT') await chrome.userScripts.execute({ target: { tabId: job.tabId }, world: 'USER_SCRIPT', js: [{ code: 'if (window.__scaAuto) window.__scaAuto.stopRequested = true;' }] });
      else await chrome.scripting.executeScript({ target: { tabId: job.tabId }, func: () => { if (window.__scaAuto) window.__scaAuto.stopRequested = true; } });
    } catch (e) {}
  }
  // si el extractor no responde, se cierra a los 15 s
  setTimeout(() => { const j = jobs.get(jobId); if (j && !j.done) finishJob(jobId, { type: 'stopped', jobId, reason: why }); }, 15000);
}

function finishJob(jobId, msg, keepOpen) {
  const job = jobs.get(jobId); if (!job || job.done) return;
  job.done = true; clearTimeout(job.timer);
  send(job, msg);
  if (job.tabId != null && !keepOpen) chrome.tabs.remove(job.tabId).catch(() => {});
  jobs.delete(jobId); keepAwake();
  if (!jobs.size) checkDisk();   // si se copió una versión nueva durante la extracción, se activa al terminar
}

// Mensajes del extractor (desde la pestaña de la red social)
function onExtractorMessage(msg, sender, sendResponse) {
  if (!msg || !msg.sca) return;
  if (msg.type === 'sleep') { setTimeout(() => { try { sendResponse(true); } catch (e) {} }, Math.min(30000, Math.max(0, +msg.ms || 0))); return true; }
  const job = jobs.get(msg.jobId); if (!job) return;
  if (msg.type === 'progress') send(job, { type: 'progress', jobId: msg.jobId, phase: 'extracting', count: msg.count, visible: msg.visible, total: msg.total, round: msg.round, note: msg.note });
  else if (msg.type === 'done') finishJob(msg.jobId, { type: 'result', jobId: msg.jobId, data: msg.data, stopped: !!job.stopWhy, reason: job.stopWhy || '' });
  else if (msg.type === 'error') finishJob(msg.jobId, { type: 'error', jobId: msg.jobId, error: msg.error });
}
chrome.runtime.onMessage.addListener(onExtractorMessage);
try { chrome.runtime.onUserScriptMessage.addListener(onExtractorMessage); } catch (e) {}   // extractor actualizado (scripts de usuario)

// Si el usuario cierra la pestaña de trabajo, el trabajo termina con error
chrome.tabs.onRemoved.addListener(tabId => {
  for (const [id, job] of jobs) if (job.tabId === tabId && !job.done) finishJob(id, { type: 'error', jobId: id, error: 'Se cerró la pestaña de la publicación.' });
});
chrome.windows.onRemoved.addListener(id => { if (id === workWindowId) workWindowId = null; });

})();
