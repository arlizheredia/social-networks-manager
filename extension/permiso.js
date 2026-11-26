/* Pide permiso para leer solo los dominios del sitio de la marca (la petición necesita un clic del usuario). */
const origins = (new URLSearchParams(location.search).get('o') || '').split(',').filter((o) => /^https?:\/\/[^/]+\/\*$/.test(o));
const list = document.getElementById('list'), status = document.getElementById('status');
origins.forEach((o) => { const li = document.createElement('li'); li.textContent = o.replace(/\/\*$/, ''); list.appendChild(li); });
const done = (granted) => {
  chrome.runtime.sendMessage({from: 'perm', granted, origins});
  status.className = granted ? 'ok' : 'err';
  status.textContent = granted ? 'Permiso concedido. Ya puedes volver a la app.' : 'Sin permiso: no se leerá el sitio.';
  setTimeout(() => window.close(), granted ? 900 : 1800);
};
document.getElementById('ok').onclick = async () => {
  try { done(await chrome.permissions.request({origins})); } catch (e) { status.className = 'err'; status.textContent = String(e && e.message || e); }
};
document.getElementById('no').onclick = () => done(false);
if (!origins.length) { status.className = 'err'; status.textContent = 'No hay sitios que autorizar.'; }
