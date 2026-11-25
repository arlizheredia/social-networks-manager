/* Puente entre la página de Social Networks Manager y la extensión.
 * Solo se inyecta en la app (ver manifest.json) y solo atiende mensajes de la propia ventana. */
(() => {
  if (window.__fbpBridge) return;
  window.__fbpBridge = true;
  const target = location.origin === 'null' ? '*' : location.origin;
  const version = chrome.runtime.getManifest().version;
  const hello = () => window.postMessage({src: 'fbp-ext', type: 'hello', version}, target);

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.src !== 'fbp-app' || typeof d.cmd !== 'string') return;
    if (d.cmd === 'hello') { hello(); return; }
    chrome.runtime.sendMessage({from: 'bridge', cmd: d.cmd, job: d.job}, res => {
      const err = chrome.runtime.lastError;
      window.postMessage({src: 'fbp-ext', reply: d.id, res: res || {ok: false, step: 'ext', error: err ? err.message : 'Sin respuesta de la extensión'}}, target);
    });
  });

  chrome.runtime.onMessage.addListener(m => {
    if (m && m.to === 'bridge' && m.type === 'progress') window.postMessage({src: 'fbp-ext', type: 'progress', step: String(m.step || '')}, target);
  });

  hello();
  document.addEventListener('DOMContentLoaded', hello);
})();
