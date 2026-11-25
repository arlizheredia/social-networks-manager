// Puente entre la página de Social Networks Manager y la extensión.
// La app habla con window.postMessage({ source: 'sca-app', ... }); la extensión responde con { source: 'sca-ext', ... }.
(() => {
  // tras activarse una versión nueva, la extensión vuelve a inyectar este puente: el anterior queda sin conexión y se retira solo
  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  if (typeof window.__scaBridge === 'function' && window.__scaBridge()) return;
  window.__scaBridge = alive;
  const VERSION = chrome.runtime.getManifest().version;
  let port = null;

  const toPage = msg => window.postMessage(Object.assign({ source: 'sca-ext' }, msg), '*');
  function connect() {
    port = chrome.runtime.connect({ name: 'sca-app' });
    port.onMessage.addListener(toPage);
    port.onDisconnect.addListener(() => { port = null; });
  }
  connect();

  window.addEventListener('message', function onMsg(e) {
    if (e.source !== window || !e.data || e.data.source !== 'sca-app') return;
    if (!alive()) { window.removeEventListener('message', onMsg); return; }
    if (e.data.type === 'ping') { toPage({ type: 'pong', version: VERSION }); }
    try {
      if (!port) connect();
      port.postMessage(e.data);
    } catch (err) {
      connect();
      try { port.postMessage(e.data); } catch (err2) { toPage({ type: 'error', jobId: e.data.jobId, error: 'No se pudo hablar con la extensión. Recarga la página.' }); }
    }
  });

  // Marca visible para que la app sepa que la extensión está instalada
  const mark = () => { document.documentElement.dataset.scaExt = VERSION; toPage({ type: 'hello', version: VERSION }); };
  if (document.documentElement) mark(); else document.addEventListener('DOMContentLoaded', mark);
  window.addEventListener('load', () => toPage({ type: 'hello', version: VERSION }));
})();
