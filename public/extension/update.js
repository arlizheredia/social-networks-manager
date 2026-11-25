/* Social Networks Manager · autoactualización de la extensión (instalada «descomprimida»).
 * La primera vez el usuario elige la carpeta de la extensión; después, con el permiso concedido,
 * se descargan los archivos publicados en GitHub Pages, se verifica su SHA-256 (files.json),
 * se escriben en esa carpeta y la extensión se reinicia con la versión nueva. */
const REMOTE = 'https://arlizheredia.github.io/social-networks-manager/extension/';
const NAME = 'Social Networks Manager · Extensión';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');

/* --- IndexedDB: guarda el acceso a la carpeta --- */
const db = () => new Promise((res, rej) => { const r = indexedDB.open('fbp-upd', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kv(key, val) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('kv', val === undefined ? 'readonly' : 'readwrite'); const st = t.objectStore('kv');
    const q = val === undefined ? st.get(key) : st.put(val, key); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
}

const status = (t, cls = '') => { const s = $('status'); s.textContent = t; s.className = cls; };
const progress = p => { $('bar').hidden = false; $('barFill').style.width = Math.round(p * 100) + '%'; };
const verGt = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function sha256(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function verifyFolder(dir) {
  try { const f = await (await dir.getFileHandle('manifest.json')).getFile(); return JSON.parse(await f.text()).name === NAME; } catch { return false; }
}

async function doUpdate(dir, opts = {}) {
  status('Descargando la versión nueva…'); progress(0.05);
  const list = await (await fetch(REMOTE + 'files.json?t=' + Date.now(), {cache: 'no-store'})).json();
  if (!list || typeof list.version !== 'string' || !Array.isArray(list.files) || !list.files.length) throw new Error('La lista de archivos publicada no es válida');
  const cur = chrome.runtime.getManifest().version;
  if (!opts.force && !verGt(list.version, cur)) { status(`Ya tienes la última versión (${cur}).`, 'ok'); progress(1); return {updated: false, version: cur}; }
  const files = [];
  for (const [i, f] of list.files.entries()) {
    if (!/^[\w.-]+$/.test(f.name) || !/^[0-9a-f]{64}$/.test(f.sha256)) throw new Error('Entrada no válida en la lista de archivos');
    const buf = await (await fetch(REMOTE + f.name + '?v=' + encodeURIComponent(list.version), {cache: 'no-store'})).arrayBuffer();
    if (await sha256(buf) !== f.sha256) throw new Error(`El archivo «${f.name}» no supera la comprobación de integridad. No se ha cambiado nada.`);
    files.push([f.name, buf]); progress(0.1 + 0.6 * (i + 1) / list.files.length);
  }
  status('Instalando…');
  files.sort((a, b) => (a[0] === 'manifest.json') - (b[0] === 'manifest.json'));   // manifest.json, el último
  for (const [i, [name, buf]] of files.entries()) {
    const w = await (await dir.getFileHandle(name, {create: true})).createWritable();
    await w.write(buf); await w.close(); progress(0.7 + 0.3 * (i + 1) / files.length);
  }
  await chrome.storage.local.set({updatedFrom: cur, updatedTo: list.version, updatedAt: Date.now()});
  status(`Versión ${list.version} instalada. Reiniciando la extensión…`, 'ok');
  if (!opts.noReload) setTimeout(() => chrome.runtime.reload(), 400);
  return {updated: true, version: list.version};
}

async function bringToFront() { try { const t = await chrome.tabs.getCurrent(); if (t) { await chrome.tabs.update(t.id, {active: true}); await chrome.windows.update(t.windowId, {focused: true}); } } catch {} }

async function main() {
  $('lead').textContent = `Versión instalada: ${chrome.runtime.getManifest().version}.`;
  const h = await kv('dir').catch(() => null);
  if (h) {
    const p = await h.queryPermission({mode: 'readwrite'}).catch(() => 'denied');
    if (p === 'granted') { try { await doUpdate(h); } catch (e) { status(String(e.message || e), 'err'); } return; }
    if (AUTO) await bringToFront();
    $('grant').hidden = false;
    return;
  }
  if (AUTO) await bringToFront();
  $('pick').hidden = false;
}

$('pickBtn').addEventListener('click', async () => {
  try {
    const dir = await window.showDirectoryPicker({id: 'fbp-extension', mode: 'readwrite'});
    if (!(await verifyFolder(dir))) { status('Esa carpeta no contiene la extensión Social Networks Manager. Elige la carpeta que tiene su manifest.json.', 'err'); return; }
    await kv('dir', dir); $('pick').hidden = true;
    await doUpdate(dir);
  } catch (e) { if (e && e.name !== 'AbortError') status(String(e.message || e), 'err'); }
});
$('grantBtn').addEventListener('click', async () => {
  try {
    const h = await kv('dir');
    if ((await h.requestPermission({mode: 'readwrite'})) !== 'granted') { status('Sin permiso no se puede actualizar.', 'err'); return; }
    $('grant').hidden = true; await doUpdate(h);
  } catch (e) { status(String(e.message || e), 'err'); }
});

window.__fbpUpdate = {doUpdate, verifyFolder, sha256};   // usado por los tests
main();
