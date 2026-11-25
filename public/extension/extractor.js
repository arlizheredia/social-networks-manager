// GENERADO desde index.html (fbExtractor) por tools/build_extension.py — no editar a mano.
// sca-extractor 1.4.9 · requiere extensión 1.4.0
(function(){
function fbExtractor(){
  // Modo automático: lo activa la extensión de Chrome (seguimientos). Sin pausas ni preguntas; informa del progreso y del resultado.
  var AUTO = window.__scaAuto || null;
  if (window.__fbcx) { if (AUTO) AUTO.emit({ type: 'error', error: 'El extractor ya se está ejecutando en esta pestaña.' }); else alert('El extractor ya se está ejecutando en esta pestaña.'); return; }
  window.__fbcx = true;
  // En modo automático las esperas las mide el service worker de la extensión: así no se frenan aunque la ventana esté minimizada
  var sleep = (AUTO && AUTO.sleep) || function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var stop = false;
  var pressed = [];
  var collected = [], byKey = {}, meta = {}, startKey = '', useCollectedOnly = false;
  var IG = /(^|\.)instagram\.com$/.test(location.hostname); // mismo marcador para Facebook, Instagram y TikTok
  var TT = /(^|\.)tiktok\.com$/.test(location.hostname);
  // Con miles de comentarios, leer la misma lista cientos de veces (una por botón y por ronda) bloqueaba la pestaña.
  // Estas cachés se vacían al empezar cada ronda y después de pulsar o desplazar: dentro de una ronda todo el trabajo
  // reutiliza las mismas listas y los mismos comentarios ya extraídos.
  var gen = 0, artsCache = null, artsGen = -1, timesCache = null, timesGen = -1, rootCache = null, rootGen = -1, totalCache, totalGen = -1;
  function bumpGen(){ gen++; artsCache = null; timesCache = null; rootCache = null; totalGen = -1; }
  // textContent no obliga al navegador a recalcular el diseño (innerText sí): con miles de botones la diferencia es enorme
  function quickText(n){ return (n.textContent || '').replace(/\s+/g, ' ').trim(); }

  function el(tag, css, text){ var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  var btnCss = 'background:#0b57d0;color:#fff;border:0;border-radius:18px;padding:8px 14px;font:500 13px Roboto,system-ui;cursor:pointer';
  var ui = el('div','position:fixed;z-index:2147483647;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;color:#1f1f1f;font:14px/1.45 Roboto,system-ui,sans-serif;border-radius:16px;box-shadow:0 4px 8px 3px rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.3);padding:16px');
  var ttl = el('div','display:flex;align-items:center;gap:10px;font-weight:500;font-size:16px;margin-bottom:8px');
  (function(){
    var NS = 'http://www.w3.org/2000/svg';
    var s = function(tag, a){ var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); return e; };
    var ic = s('svg', { viewBox: '0 0 48 48', width: '28', height: '28' });
    ic.appendChild(s('rect', { width: 48, height: 48, rx: 12, fill: '#1877f2' }));
    ic.appendChild(s('path', { d: 'M11 8h26a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5H23l-8.5 7v-7H11a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5z', fill: '#fff' }));
    [[13,21,8],[21.25,16.5,12.5],[29.5,12,17]].forEach(function(b){ ic.appendChild(s('rect', { x: b[0], y: b[1], width: 5.5, height: b[2], rx: 1.8, fill: '#1877f2' })); });
    ttl.appendChild(ic);
    ttl.appendChild(el('span', '', 'Social Comments Analyzer'));
  })();
  var st = el('div','min-height:20px;color:#444746','Iniciando…');
  var bar = el('div','display:flex;gap:8px;margin-top:12px;flex-wrap:wrap');
  var bStop = el('button', btnCss, 'Detener y extraer');
  var bCopy = el('button', btnCss + ';display:none', 'Copiar JSON');
  var bDl = el('button', btnCss + ';display:none;background:#c2e7ff;color:#001d35', 'Descargar .json');
  var bClose = el('button', btnCss + ';background:transparent;color:#0b57d0', 'Cerrar');
  var bResume = el('button', btnCss + ';display:none', 'Reanudar');
  var bUse = el('button', btnCss + ';display:none', 'Usar lo recogido');
  var bRestart = el('button', btnCss + ';display:none;background:#c2e7ff;color:#001d35', 'Empezar con esta publicación');
  var out = el('textarea','display:none;width:100%;height:90px;margin-top:10px;background:#f0f4f9;color:#1f1f1f;border:0;border-radius:8px;padding:8px;font:11px monospace');
  var bRestartAll = el('button', btnCss + ';background:transparent;color:#0b57d0;box-shadow:inset 0 0 0 1px #c4c7c5', 'Reiniciar captura');
  bar.append(bStop, bResume, bUse, bRestart, bCopy, bDl, bRestartAll, bClose); ui.append(ttl, st, bar, out);
  if (!AUTO) document.body.appendChild(ui);   // con la extensión trabaja sin panel: el progreso se ve en la app
  // oneLine: el progreso nunca se parte en dos líneas (si no cabe, se recorta con …)
  function status(t, oneLine){ st.textContent = t; st.title = oneLine ? t : ''; st.style.whiteSpace = oneLine ? 'nowrap' : 'normal'; st.style.overflow = 'hidden'; st.style.textOverflow = 'ellipsis'; }
  bStop.onclick = function(){ stop = true; status('Deteniendo…'); };
  var closed = false, finished = false, restarting = false;
  // Reiniciar: descarta lo recogido y vuelve a lanzar el extractor en la publicación abierta
  function relaunch(){ closed = true; stop = true; ui.remove(); window.__fbcx = false; setTimeout(fbExtractor, 60); }
  bRestartAll.onclick = function(){
    var n = collected.length;
    if (n && !confirm('Se descartarán los ' + n + ' comentarios recogidos y empezará una captura nueva de esta publicación. ¿Continuar?')) return;
    if (finished) relaunch();
    else { restarting = true; stop = true; status('Reiniciando…', true); }
  };
  bClose.onclick = function(){ stop = true; closed = true; ui.remove(); window.__fbcx = false; };

  var LABEL_RE = /^(comentario|comment|respuesta|reply|réponse|commentaire|comentário|resposta|kommentar|antwort|commento|risposta)/i;
  var REPLY_RE = /^(respuesta|reply|réponse|resposta|antwort|risposta)/i;
  var EXP = [
    /^(ver|view|see|mostrar|show|voir|afficher|mostra|visualizar)\b.*\b(comentarios?|comments?|respuestas?|replies|reply|más|more|anteriores|previous|réponses?|commentaires?|respostas?|mais|plus)\b/i,
    /\b\d+\s+(respuestas?|replies|reply|réponses?|respostas?)\b/i,
    /(respondió|replied|a répondu|respondeu)/i
  ];
  var EXCL = /(ocultar|hide|menos|less|traduc|transl|masquer|esconder|calificar|rate this)/i;
  // botones que cargan más comentarios de la lista (no se abren ni desaparecen: se pulsan mientras haya avance)
  var LOAD_MORE_RE = /(ver|view|see|mostrar|show|cargar|load)\b.{0,25}\b(más|more|anteriores|previous|otros)\b.{0,15}\b(comentarios|comments)\b|\b(más|more) (comentarios|comments)\b/i;
  var REPLY_BTN_RE = /^.{0,60}\b(respuestas?|replies|reply|réponses?|respostas?|respondió|replied|a répondu|respondeu)\b.{0,20}$/i;

  function articles(){
    if (artsCache && artsGen === gen) return artsCache;
    var all = Array.prototype.slice.call(document.querySelectorAll('div[role="article"]'));
    var lab = all.filter(function(a){ return LABEL_RE.test(a.getAttribute('aria-label') || ''); });
    var res;
    if (lab.length) res = lab;
    else {
      var withLink = all.filter(function(a){ return a.querySelector('a[href*="comment_id="]'); });
      res = withLink.length ? withLink : pseudoArticles();
    }
    artsCache = res; artsGen = gen; return res;
  }
  // Reels: los comentarios pueden no ser role="article". Para cada comment_id se toma el contenedor más amplio
  // que solo contiene ese comentario (enlace de autor/fecha + texto) y se marca para tratarlo como un artículo.
  // el enlace del autor lleva el id en base64 («Y29tbWVudDox…») y el de la fecha en número: se decodifica para que sean el mismo comentario
  function cidOf(a){ try { var u = new URL(a.href, location.href); return decodeId(u.searchParams.get('reply_comment_id') || u.searchParams.get('comment_id') || ''); } catch(e){ return ''; } }
  function pseudoArticles(){
    var marked = Array.prototype.slice.call(document.querySelectorAll('[data-sca-art]'));
    var all = Array.prototype.slice.call(document.querySelectorAll('a[href*="comment_id="]'));
    // un contenedor marcado al que después llegaron respuestas contiene ya varios comentarios: se desmarca y se vuelve a separar
    if (marked.length){
      var idsIn = new Map();
      all.forEach(function(a){ var box = a.closest('[data-sca-art]'); if (!box) return; var id = cidOf(a); if (!id) return; var s = idsIn.get(box) || new Set(); s.add(id); idsIn.set(box, s); });
      marked = marked.filter(function(b){ var s = idsIn.get(b); if (s && s.size > 1){ b.removeAttribute('data-sca-art'); artCache.delete(b); return false; } return true; });
    }
    var fresh = all.filter(function(a){ return !a.closest('[data-sca-art]'); });
    if (!fresh.length) return marked.filter(function(b){ return b.isConnected; });
    // Antes se buscaban todos los enlaces dentro de cada ancestro de cada comentario (O(n²)): con 1.500 comentarios
    // eso bloqueaba la pestaña. Ahora se cuentan los comentarios una sola vez subiendo por los ancestros (O(n)).
    // Un comentario puede tener dos enlaces con el mismo comment_id (autor y fecha): se cuenta una sola vez.
    var byCid = new Map(), freshByCid = new Map();
    all.forEach(function(a){ var id = cidOf(a); if (id && !byCid.has(id)) byCid.set(id, a); });
    fresh.forEach(function(a){ var id = cidOf(a); if (id && !freshByCid.has(id)) freshByCid.set(id, a); });
    var counts = new Map();
    byCid.forEach(function(a){
      var p = a.parentElement;
      while (p && p !== document.body){ counts.set(p, (counts.get(p) || 0) + 1); p = p.parentElement; }
    });
    freshByCid.forEach(function(a){
      if (a.closest('[data-sca-art]')) return;
      var box = a, p = a.parentElement;
      while (p && p !== document.body){
        if ((counts.get(p) || 0) > 1) break;
        box = p; p = p.parentElement;
      }
      if (box !== a && !box.closest('[data-sca-art]') && box.querySelector('div[dir="auto"], span[dir="auto"]')){ box.setAttribute('data-sca-art', '1'); marked.push(box); }
    });
    return marked.filter(function(b){ return b.isConnected; });
  }
  function root(){
    if (rootCache && rootGen === gen) return rootCache;
    var dlg = Array.prototype.slice.call(document.querySelectorAll('div[role="dialog"]')).filter(function(d){ return d.querySelector('div[role="article"]'); });
    // En los reels sin role="article" los comentarios siguen estando dentro de un diálogo: usarlo acota mucho los botones
    if (!dlg.length) dlg = Array.prototype.slice.call(document.querySelectorAll('div[role="dialog"]')).filter(function(d){ return d.querySelector('a[href*="comment_id="]'); });
    rootCache = dlg.length ? dlg[dlg.length - 1] : document; rootGen = gen;
    return rootCache;
  }
  function scrollNudge(){
    var arts = articles(), seen = new Set();
    arts.slice(-2).forEach(function(a){
      var p = a.parentElement;
      while (p && p !== document.body){
        var s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 10 && !seen.has(p)){ seen.add(p); p.scrollTop = Math.max(0, p.scrollTop - p.clientHeight); try { p.dispatchEvent(new Event('scroll')); } catch(e){} }
        p = p.parentElement;
      }
    });
    try { window.scrollBy(0, -window.innerHeight); } catch(e){}
  }
  function scrollAll(){
    var arts = TT ? ttNodes() : IG ? igTimes() : articles(); var seen = new Set();
    var lastA = arts[arts.length - 1]; if (lastA){ try { lastA.scrollIntoView({ block: 'end' }); } catch(e){} }
    arts.slice(-3).forEach(function(a){
      var p = a.parentElement;
      while (p && p !== document.body){
        var s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 10 && !seen.has(p)){ seen.add(p); p.scrollTop = p.scrollHeight; }
        p = p.parentElement;
      }
    });
    window.scrollTo(0, document.documentElement.scrollHeight);
    // Con la página oculta (ventana minimizada o en segundo plano) el navegador no genera eventos de desplazamiento: se envían a mano
    if (document.hidden){ seen.forEach(function(p){ try { p.dispatchEvent(new Event('scroll')); } catch(e){} }); try { window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); } catch(e){} }
  }
  function txt(node){
    var c = node.cloneNode(true);
    c.querySelectorAll('img[alt]').forEach(function(i){ i.replaceWith(document.createTextNode(i.getAttribute('alt'))); });
    c.querySelectorAll('br').forEach(function(b){ b.replaceWith(document.createTextNode('\n')); });
    c.querySelectorAll('div[dir="auto"]').forEach(function(d){ d.append(document.createTextNode('\n')); });
    return (c.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function decodeId(v){
    if (!v) return '';
    if (/^\d+$/.test(v)) return v;
    try { var d = atob(v); var m = d.match(/comment:[\d]+_(\d+)/); if (m) return m[1]; } catch(e){}
    return v;
  }
  function cleanProfile(href){
    try {
      var u = new URL(href, location.href);
      if (/profile\.php/.test(u.pathname)) return { url: u.origin + u.pathname + '?id=' + (u.searchParams.get('id') || ''), id: u.searchParams.get('id') || '' };
      var m = u.pathname.match(/\/groups\/[^/]+\/user\/(\d+)/);
      if (m) return { url: 'https://www.facebook.com/profile.php?id=' + m[1], id: m[1] };
      return { url: u.origin + u.pathname.replace(/\/$/, ''), id: '' };
    } catch(e){ return { url: href, id: '' }; }
  }
  function parseCount(s){
    if (!s) return 0;
    var m = String(s).replace(/\s/g,' ').match(/(\d+(?:[.,]\d+)*)\s*(k|mil|m|mill|mln)?/i);
    if (!m) return 0;
    var u = (m[2] || '').toLowerCase();
    // "1.234" o "1,234" sin unidad = separador de miles; "1,5 mil" o "2.3K" = decimales
    var n = (!u && /^\d{1,3}([.,]\d{3})+$/.test(m[1])) ? parseFloat(m[1].replace(/[.,]/g, '')) : parseFloat(m[1].replace(',', '.'));
    if (u === 'k' || u === 'mil') n *= 1e3; else if (u) n *= 1e6;
    return Math.round(n);
  }
  var UI_WORDS = /^(me gusta|responder|like|reply|editado|edited|autor|author|fan destacado|top fan|seguir|follow|compartir|share|ver traducción|see translation|·|enviar|send)$/i;
  // Texto típico del enlace de fecha de un comentario: "2 h", "1 d", "3 sem", "hace 5 min", "Ahora", "12 de marzo", "March 12"…
  var TIME_RE = /^(\d+\s*(s|seg|segundos?|min|minutos?|m|h|hr|hrs|horas?|hours?|d|días?|dias?|days?|sem|semanas?|w|wk|weeks?|mes|meses|mo|months?|a|años?|y|yr|years?)\.?$|hace\s|il y a\s|há\s|ahora|just now|now$|ayer|yesterday|\d{1,2}\s+de\s+[a-zé]+|(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|apr|aug|dec)[a-z]*\.?\s+\d{1,2}\b)/i;
  function nrm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  // "Respuesta de Ana Pérez al comentario de Luis hace 2 días" -> "Ana Pérez"
  function labelAuthor(label){
    if (!label) return '';
    var s = label.replace(/^(comentario|respuesta|comment|reply|réponse|commentaire|comentário|resposta|kommentar|antwort|commento|risposta)\s+(de|by|par|von|di|do|da)\s+/i, '');
    if (s === label) return '';
    s = s.replace(/\s+(hace|il y a|há|vor)\s+.*$/i, '').replace(/\s+\d+\s+\S+\s+ago$/i, '').replace(/\s+(just now|ahora|now)$/i, '');
    s = s.replace(/\s+(al comentario de|a la respuesta de|a una respuesta de|a un comentario de|en respuesta a|to|au commentaire de|à|ao comentário de|à resposta de|auf|al commento di)\s+.*$/i, '');
    return s.trim();
  }

  function extractOne(art){
    var own = function(sel){ return Array.prototype.slice.call(art.querySelectorAll(sel)).filter(function(n){ return n.closest('div[role="article"],[data-sca-art]') === art; }); };
    var label = art.getAttribute('aria-label') || '';
    var labelName = labelAuthor(label);
    var links = own('a[href]');
    var href = function(a){ return a.getAttribute('href') || ''; };
    // Cuerpo del comentario: los enlaces dentro de él son menciones, nunca el autor.
    var bodies = own('div[dir="auto"][style*="text-align"]');
    bodies = bodies.filter(function(n){ return !bodies.some(function(o){ return o !== n && o.contains(n); }); });
    var inBody = function(n){ return bodies.some(function(b){ return b.contains(n); }); };
    var outLinks = links.filter(function(a){ return !inBody(a) && !/hashtag|l\.facebook\.com/.test(href(a)); });
    // Enlace de fecha: lleva comment_id y su texto parece una fecha. (Facebook también añade comment_id al enlace del autor.)
    var withCid = outLinks.filter(function(a){ return /comment_id=/.test(href(a)); });
    var dLink = withCid.filter(function(a){ return TIME_RE.test(txt(a)); })[0]
      || withCid.filter(function(a){ var t = nrm(txt(a)); return t && t !== nrm(labelName); }).pop() || null;
    // Autor: el enlace con texto igual al nombre de la etiqueta; si no, el primer enlace con texto fuera del cuerpo.
    var named = outLinks.filter(function(a){ return a !== dLink && txt(a) && !TIME_RE.test(txt(a)); });
    var aLink = (labelName && named.filter(function(a){ return nrm(txt(a)) === nrm(labelName); })[0]) || named[0] || null;
    var linkName = aLink ? txt(aLink) : '';
    var authorName = linkName && (!labelName || nrm(labelName).indexOf(nrm(linkName)) === 0) ? linkName : (labelName || linkName);
    if (labelName && aLink && nrm(linkName) !== nrm(labelName) && nrm(labelName).indexOf(nrm(linkName)) !== 0) aLink = null; // el enlace no es del autor
    var prof = aLink ? cleanProfile(aLink.href) : { url: '', id: '' };

    var id = '', parentId = '', permalink = '', dateText = '';
    var idLink = dLink || withCid[0] || null;
    if (idLink){
      try {
        var u = new URL(idLink.href, location.href);
        var cid = decodeId(u.searchParams.get('comment_id')), rid = decodeId(u.searchParams.get('reply_comment_id'));
        id = rid || cid; parentId = rid ? cid : ''; permalink = idLink.href;
      } catch(e){}
    }
    if (dLink) dateText = txt(dLink);
    var avImg = art.querySelector('svg image');
    var avatar = avImg ? (avImg.getAttribute('xlink:href') || avImg.getAttribute('href') || '') : '';
    if (!avatar){ var im = own('img').filter(function(i){ return (i.width || 0) >= 24 && (i.width || 0) <= 60 && !inBody(i); })[0]; if (im) avatar = im.src; }
    var cLink = dLink;
    var text = '';
    if (bodies.length){
      text = bodies.filter(function(n){ return !bodies.some(function(o){ return o !== n && o.contains(n); }); }).map(txt).join('\n').trim();
    } else {
      var cands = own('div[dir="auto"],span[dir="auto"]').filter(function(n){ return !(aLink && aLink.contains(n)) && !(cLink && cLink.contains(n)); });
      var leaves = cands.filter(function(n){ return !cands.some(function(o){ return o !== n && n.contains(o); }); });
      var seen = {}; text = leaves.map(txt).filter(function(t){ if (!t || t === authorName || UI_WORDS.test(t) || seen[t]) return false; seen[t] = 1; return true; }).join('\n').trim();
    }
    var reactions = 0;
    own('[aria-label]').forEach(function(n){
      var al = n.getAttribute('aria-label') || '';
      if (/(reacci|reaction|réaction|reaç|people reacted|personas reaccionaron)/i.test(al) && /\d/.test(al)) reactions = Math.max(reactions, parseCount(al));
    });
    var badges = [], edited = false;
    own('span,div').forEach(function(n){
      if (n.children.length) return;
      var t = (n.textContent || '').trim();
      if (/^(autor|author|auteur)$/i.test(t)) badges.push('Autor de la publicación');
      else if (/^(fan destacado|top fan|super fan|superfan)$/i.test(t)) badges.push(t);
      else if (/^(editado|edited|modifié)$/i.test(t)) edited = true;
    });
    var attachments = [];
    own('img').forEach(function(i){
      var w = i.width || 0;
      if (w >= 64 && !(aLink && aLink.contains(i)) && i.src && i.src !== avatar) attachments.push({ type: /\.gif|giphy/i.test(i.src) ? 'gif' : 'imagen', url: i.src, alt: i.getAttribute('alt') || '' });
    });
    if (own('video').length) attachments.push({ type: 'video', url: permalink });
    links.forEach(function(a){
      var h = a.getAttribute('href') || '';
      if (/l\.facebook\.com\/l\.php/.test(h)){ try { attachments.push({ type: 'enlace', url: new URL(a.href).searchParams.get('u') }); } catch(e){} }
    });
    var mentions = links.filter(function(a){ return inBody(a) && !/hashtag/.test(a.href); }).map(function(a){ return txt(a); }).filter(Boolean);
    var replyTo = '';
    var mr = label.match(/(?:al comentario de|a la respuesta de|en respuesta a|to)\s+(.+?)(?:'s comment|’s comment|'s reply|’s reply)?(?:\s+hace|\s+\d|$)/i);
    if (REPLY_RE.test(label) && mr) replyTo = mr[1];
    if (REPLY_RE.test(label) && !replyTo && mentions.length) replyTo = mentions[0];
    var labelDate = (label.match(/(hace\s+.+|il y a\s+.+|há\s+.+|\d+\s+\S+\s+ago)$/i) || [])[0] || '';
    return {
      id: id, parentId: parentId, isReply: REPLY_RE.test(label) || !!parentId,
      authorName: authorName, authorId: prof.id, authorUrl: prof.url, authorAvatar: avatar, badges: badges,
      text: text, dateText: dateText || labelDate, labelDate: labelDate, reactions: reactions,
      attachments: attachments, mentions: mentions, replyTo: replyTo, edited: edited, permalink: permalink, ariaLabel: label,
      indent: Math.round(art.getBoundingClientRect().left)
    };
  }
  var artCache = new WeakMap();   // artículo → { firma, comentario }: solo se vuelve a leer si cambió (p. ej. «Ver más» amplió el texto)
  function resetCaches(){
    artCache = new WeakMap(); igCache = new WeakMap(); igBlockCache = new WeakMap(); igRpSig = new WeakMap(); igRpMap = {};
    igCountsCache = null; bumpGen();
  }
  // tope de comentarios nuevos o cambiados que se leen en cada llamada: el resto se lee en la siguiente (la pestaña no se bloquea)
  var snapBudget = 300, snapPending = false;
  function extractAll(){
    var arts = articles(); var res = [], seen = {}, fresh = 0, t0 = Date.now(); snapPending = false;
    arts.forEach(function(a, i){
      try {
        var sig = (a.textContent || '').length + ':' + a.getElementsByTagName('a').length + ':' + a.getElementsByTagName('img').length;
        var hit = artCache.get(a), c;
        if (hit && hit.sig === sig) c = Object.assign({}, hit.c);
        else { if (fresh >= snapBudget || (fresh && Date.now() - t0 > 40)){ snapPending = true; return; } fresh++; c = extractOne(a); artCache.set(a, { sig: sig, c: Object.assign({}, c) }); }
        var key = c.id || (c.authorName + '|' + c.text);
        if (seen[key]) return; seen[key] = 1;
        c.order = i; res.push(c);
      } catch(e){ console.warn('Comentario omitido', e); }
    });
    return res;
  }

  /* ---------- Instagram ---------- */
  var IG_LOAD_RE = /(cargar|load|ver|view|see|mostrar|show)\s+(m[aá]s|more)\s+(comentarios|comments)|more comments|m[aá]s comentarios/i;
  var IG_USER_RE = /^\/([A-Za-z0-9._]{1,30})\/?$/;
  var IG_RESERVED = /^(p|reel|reels|explore|stories|accounts|direct|tv|about|legal|developer)$/i;
  var IG_TOGGLE_RE = /^(—\s*)?(ocultar|ver|mostrar|hide|view|show|see)\b.*\b(respuestas?|replies|reply)\b/i;
  var IG_UI = /^(responder|reply|ver traducci[oó]n|see translation|ocultar respuestas|hide replies|editado|edited|verificado|verified|autor|author|creador|creator|fijado|pinned|seguir|follow|•|·|\d[\d.,]*\s*(k|mil|m)?\s*(me gusta|likes?|curtidas?)|(—\s*)?(ver|view)\s.*(respuestas|replies).*)$/i;
  // Código de la publicación abierta (instagram.com/p/CODIGO/ o /reel/CODIGO/)
  function igCode(){ var m = location.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/); return m ? m[1] : ''; }
  // Una fecha pertenece a esta publicación si su enlace apunta a ella (descarta "Más publicaciones de…")
  function igRelevant(t){
    var code = igCode(); if (!code) return true;
    var a = t.closest('a'); return !!(a && (a.getAttribute('href') || '').indexOf('/' + code + '/') >= 0);
  }
  function igRoot(){
    if (rootCache && rootGen === gen) return rootCache;
    var dlg = Array.prototype.slice.call(document.querySelectorAll('div[role="dialog"]')).filter(function(d){
      return Array.prototype.slice.call(d.querySelectorAll('time[datetime]')).some(igRelevant);
    });
    // En la página propia de la publicación los comentarios pueden estar fuera de <article>: se busca en todo el documento
    rootCache = dlg.length ? dlg[dlg.length - 1] : document.body; rootGen = gen;
    return rootCache;
  }
  function igAllTimes(){ return Array.prototype.slice.call(igRoot().querySelectorAll('time[datetime]')); }
  function igTimes(){
    if (timesCache && timesGen === gen) return timesCache;
    var all = igAllTimes(), rel = all.filter(igRelevant);
    timesCache = rel.length ? rel : all; timesGen = gen; return timesCache;
  }
  var IG_BTN_EXCL = /(publicaciones|posts|seguidores|followers|seguidos|following|perfil|profile|audio|reels|historias|stories|etiquetad|tagged|sugerenc|suggest|traduc|transl)/i;
  // Estructura de un nodo sin textos ni nombres (para diagnosticar cambios en la web de Instagram)
  function igSkel(node, depth, budget){
    if (!node || depth > 9 || budget.n <= 0) return '';
    if (node.nodeType === 3){ var v = (node.textContent || '').trim(); return v ? '#' + v.length : ''; }
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    if (tag === 'svg') return 'svg' + (node.getAttribute('aria-label') ? '[aria=' + node.getAttribute('aria-label').split(/\s+/).slice(0, 2).join(' ') + ']' : '');
    var at = [];
    ['role', 'dir'].forEach(function(k){ if (node.hasAttribute(k)) at.push(k + '=' + node.getAttribute(k)); });
    if (node.hasAttribute('datetime')) at.push('datetime');
    if (node.hasAttribute('aria-label')) at.push('aria=' + node.getAttribute('aria-label').split(/\s+/).slice(0, 2).join(' '));
    if (tag === 'a'){
      var hr = (node.getAttribute('href') || '').replace(/\?.*$/, '').replace(/\/(p|reel|reels|tv)\/[^/]+/, '/$1/{code}').replace(/\d{5,}/g, '{id}');
      if (/^\/[^/]+\/?$/.test(hr) && !/^\/(p|reel|explore)\b/.test(hr)) hr = '/{user}/';
      at.push('href=' + hr);
    }
    budget.n -= 1;
    var kids = Array.prototype.slice.call(node.childNodes).map(function(c){ return igSkel(c, depth + 1, budget); }).filter(Boolean);
    return tag + (at.length ? '[' + at.join(' ') + ']' : '') + (kids.length ? '{' + kids.join(',') + '}' : '');
  }
  function igDiag(extracted){
    var all = igAllTimes(), rel = all.filter(igRelevant);
    var firstC = rel.filter(function(t){ var a = t.closest('a'); return a && /\/c\/\d+/.test(a.getAttribute('href') || ''); })[0] || rel[0] || all[0];
    var anc = firstC; for (var k = 0; k < 7 && anc && anc.parentElement && anc !== igRoot(); k++) anc = anc.parentElement;
    // IDs de comentario presentes en la página (por su enlace /c/ID/ o /c/ID/r/ID/) frente a los extraídos
    var pageIds = {};
    rel.forEach(function(t){ var a = t.closest('a'); var m = a && (a.getAttribute('href') || '').match(/\/c\/(\d+)(?:\/r\/(\d+))?/); if (m) pageIds[m[2] || m[1]] = 1; });
    var ids = Object.keys(pageIds);
    // Botones de despliegue que siguen visibles al terminar (texto con los números normalizados)
    var pend = [];
    Array.prototype.slice.call(igRoot().querySelectorAll('button,div[role="button"],span[role="button"]')).forEach(function(b){
      if (!b.offsetParent) return;
      var t = quickText(b).replace(/^[\s—–\-·•]+/, '');
      if (t && t.length <= 80 && !EXCL.test(t) && !IG_BTN_EXCL.test(t) && EXP.some(function(re){ return re.test(t); })) pend.push(t.replace(/\d+/g, 'N'));
    });
    Array.prototype.slice.call(igRoot().querySelectorAll('svg[aria-label]')).forEach(function(s){ if (IG_LOAD_RE.test(s.getAttribute('aria-label') || '')) pend.push('[icono] ' + s.getAttribute('aria-label')); });
    return { code: igCode(), dialogs: document.querySelectorAll('div[role="dialog"]').length, articles: document.querySelectorAll('article').length,
      timesAll: all.length, timesThisPost: rel.length, commentLinks: document.querySelectorAll('a[href*="/c/"]').length, extracted: extracted,
      idsEnPagina: ids.length, faltan: ids.filter(function(id){ return !byKey[id]; }), botonesPendientes: pend,
      structure: anc ? igSkel(anc, 0, { n: 260 }).slice(0, 6000) : '' };
  }
  // Bloque de un comentario: el ancestro más grande que contiene solo su propia fecha
  var igCountsCache = null, igCountsGen = -1, igBlockCache = new WeakMap(), igCache = new WeakMap();
  function igTimeCounts(){
    if (igCountsCache && igCountsGen === gen) return igCountsCache;
    var r = igRoot(), counts = new Map();
    Array.prototype.slice.call(r.querySelectorAll('time[datetime]')).forEach(function(t){
      var p = t.parentElement;
      while (p && p !== r){ counts.set(p, (counts.get(p) || 0) + 1); p = p.parentElement; }
    });
    igCountsCache = counts; igCountsGen = gen; return counts;
  }
  function igBlock(t){
    var r = igRoot(), b = t, p = t.parentElement, counts = igTimeCounts();
    while (p && p !== r && (counts.get(p) || 0) === 1){ b = p; p = p.parentElement; }
    return b;
  }
  function igBlockOf(t){
    var hit = igBlockCache.get(t), counts = igTimeCounts();
    if (hit && hit.isConnected && (counts.get(hit) || 0) === 1 && (!hit.parentElement || hit.parentElement === igRoot() || (counts.get(hit.parentElement) || 0) !== 1)) return hit;
    var b = igBlock(t); igBlockCache.set(t, b); return b;
  }
  function igExtractOne(t, block){
    block = block || igBlock(t);
    var tLink = t.closest('a');
    var href = tLink ? (tLink.getAttribute('href') || '') : '';
    var mc = href.match(/\/c\/(\d+)(?:\/r\/(\d+))?/);   // /p/CODIGO/c/COMENTARIO/(r/RESPUESTA/)
    var userLinks = Array.prototype.slice.call(block.querySelectorAll('a[href]')).filter(function(a){
      var m = (a.getAttribute('href') || '').match(IG_USER_RE); return a !== tLink && m && !IG_RESERVED.test(m[1]);
    });
    // El usuario sale del enlace del perfil (/usuario/); el texto puede incluir el "alt" de la foto de perfil
    var aLink = userLinks.filter(function(a){ return (a.textContent || '').trim(); })[0] || userLinks[0] || null;
    var username = aLink ? aLink.getAttribute('href').match(IG_USER_RE)[1] : '';
    // Texto del comentario. Los textos de la interfaz ("Responder", "2 Me gusta", "Ver traducción"…) se descartan por su
    // contenido, no por estar dentro de un botón: Instagram puede envolver toda la fila del comentario en un role="button".
    var isUi = function(v){ v = (v || '').replace(/^[\s—–\-·•]+/, '').trim(); return !v || IG_UI.test(v) || (IG_TOGGLE_RE.test(v) && v.length <= 60) || v === username || v === '@' + username; };
    var cands = Array.prototype.slice.call(block.querySelectorAll('span[dir="auto"],div[dir="auto"],h1')).filter(function(s){
      return !(aLink && (aLink.contains(s) || s.contains(aLink))) && !(tLink && (tLink.contains(s) || s.contains(tLink))) && !s.querySelector('time');
    });
    var best = null, text = '';
    cands.forEach(function(s){ var v = txt(s); if (!isUi(v) && v.length > text.length){ text = v; best = s; } });
    if (!text){
      // Respaldo: todo el texto del bloque salvo usuario, fecha, iconos y textos de la interfaz (incluye emojis en <img alt>)
      var parts = [], walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()){
        var n = walker.currentNode, el = n.nodeType === 1 ? n : n.parentElement;
        if (!el || el.closest('svg') || (tLink && tLink.contains(el)) || (aLink && aLink.contains(el))) continue;
        if (n.nodeType === 1){ if (n.tagName === 'IMG' && n.getAttribute('alt') && n.getAttribute('alt').length <= 8 && !userLinks.some(function(a){ return a.contains(n); })) parts.push(n.getAttribute('alt')); continue; }
        var v = (n.textContent || '').trim(); if (v) parts.push(v);
      }
      text = parts.filter(function(v){ return !isUi(v); }).join(' ').replace(/\s+([,.!?:;)])/g, '$1').replace(/(\p{Extended_Pictographic}\uFE0F?)\s+(?=\p{Extended_Pictographic})/gu, '$1').replace(/\s{2,}/g, ' ').trim();
      best = block;
    }
    var mentions = Array.prototype.slice.call((best || block).querySelectorAll('a')).filter(function(a){ return a !== aLink; }).map(function(a){ return txt(a); })
      .filter(function(v){ return /^@/.test(v); }).map(function(v){ return v.replace(/^@/, ''); });
    var likes = 0;
    Array.prototype.slice.call(block.querySelectorAll('button,span,a,div[role="button"]')).forEach(function(n){
      if (n.children.length > 2) return;
      var m = (n.textContent || '').trim().match(/^(\d[\d.,]*\s*(?:k|mil|m)?)\s+(me gusta|likes?|mi piace|j[’']aime|curtidas?)$/i);
      if (m) likes = Math.max(likes, parseCount(m[1]));
    });
    // Foto de perfil: la imagen dentro del enlace al perfil del autor (respaldo: imagen pequeña fuera del texto)
    var img = (function(){ for (var k = 0; k < userLinks.length; k++){ var im = userLinks[k].querySelector('img'); if (im && (userLinks[k].getAttribute('href') || '').match(IG_USER_RE)[1] === username) return im; } return null; })()
      // Instagram pone la foto en un <span role="link">, no en un enlace: se reconoce por su texto alternativo
      || (username ? Array.prototype.slice.call(block.querySelectorAll('img[alt]')).filter(function(i){ var al = (i.getAttribute('alt') || '').toLowerCase(); return al.indexOf(username.toLowerCase()) >= 0 && al.length > username.length; })[0] : null)
      || (function(){
        if (!username) return null;
        for (var anc = block.parentElement, k = 0; anc && k < 6; anc = anc.parentElement, k++){
          var im = Array.prototype.slice.call(anc.querySelectorAll('img[alt]')).filter(function(i){ var al = (i.getAttribute('alt') || '').toLowerCase(); return al.indexOf(username.toLowerCase()) >= 0 && al.length > username.length; })[0];
          if (im) return im;
        }
        return null;
      })()
      || Array.prototype.slice.call(block.querySelectorAll('img')).filter(function(i){
      var w = i.width || +i.getAttribute('width') || Math.round(i.getBoundingClientRect().width); return w > 0 && w <= 64 && !(i.closest('span[dir="auto"]'));
    })[0];
    var badges = [];
    if (block.querySelector('svg[aria-label="Verificado"],svg[aria-label="Verified"]')) badges.push('Verificado');
    Array.prototype.slice.call(block.querySelectorAll('span,div')).forEach(function(n){
      if (!n.children.length && /^(autor|author|creador|creator)$/i.test((n.textContent || '').trim()) && badges.indexOf('Autor de la publicación') < 0) badges.push('Autor de la publicación');
    });
    var isReply = !!(mc && mc[2]);
    return {
      id: mc ? (mc[2] || mc[1]) : '', parentId: mc && mc[2] ? mc[1] : '', isReply: isReply, isCaption: !mc,
      authorName: username, authorId: '', authorUrl: username ? 'https://www.instagram.com/' + username + '/' : '',
      authorAvatar: img ? img.src : '', badges: badges, text: text, datetime: t.getAttribute('datetime') || '', dateText: txt(t),
      reactions: likes, attachments: [], mentions: mentions, replyTo: isReply && mentions[0] ? mentions[0] : '', edited: false,
      permalink: href ? new URL(href, location.href).href : '', indent: Math.round(block.getBoundingClientRect().left), platform: 'instagram'
    };
  }
  function igTimeId(t){ var a = t && t.closest('a'); var m = a && (a.getAttribute('href') || '').match(/\/c\/(\d+)(?:\/r\/(\d+))?/); return m ? (m[2] || m[1]) : ''; }
  var igRpMap = {}, igRpSig = new WeakMap();
  function igReplyParents(){
    var times = igTimes();
    Array.prototype.slice.call(igRoot().querySelectorAll('[role="button"],button')).forEach(function(b){
      var t = quickText(b);
      if (!t || t.length > 60 || !IG_TOGGLE_RE.test(t)) return;
      var box = b.nextElementSibling;
      if (!box || box.tagName !== 'UL'){ var par = b.parentElement; box = par ? Array.prototype.slice.call(par.children).filter(function(x){ return x.tagName === 'UL'; })[0] : null; }
      if (!box) return;
      // cada botón se procesa una vez; solo se repite si su bloque de respuestas cambió (llegaron más)
      var sig = box.querySelectorAll('time[datetime]').length + ':' + (box.textContent || '').length;
      if (igRpSig.get(b) === sig) return;
      igRpSig.set(b, sig);
      var parentT = null;
      times.forEach(function(tt){ if (!box.contains(tt) && !b.contains(tt) && (b.compareDocumentPosition(tt) & Node.DOCUMENT_POSITION_PRECEDING)) parentT = tt; });
      var pid = igTimeId(parentT); if (!pid) return;
      Array.prototype.slice.call(box.querySelectorAll('time[datetime]')).forEach(function(rt){ var rid = igTimeId(rt); if (rid && !igRpMap[rid]) igRpMap[rid] = pid; });
    });
    return igRpMap;
  }
  function igExtractAll(){
    var res = [], seen = {}, cap = null;
    igTimes().forEach(function(t, i){
      try {
        var block = igBlockOf(t);
        var sig = (block.textContent || '').length + ':' + block.getElementsByTagName('a').length + ':' + block.getElementsByTagName('img').length + ':' + block.getElementsByTagName('time').length;
        var hit = igCache.get(t), c;
        if (hit && hit.sig === sig) c = Object.assign({}, hit.c);
        else { c = igExtractOne(t, block); igCache.set(t, { sig: sig, c: Object.assign({}, c) }); }
        if (c.isCaption){ if (!cap || (!cap.text && c.text) || (!cap.authorName && c.authorName)) cap = c; return; }   // la descripción no es un comentario
        var key = c.id || (c.authorName + '|' + c.text);
        if (seen[key]) return; seen[key] = 1;
        c.order = i; res.push(c);
      } catch(e){ console.warn('Comentario omitido', e); }
    });
    var rp = igReplyParents();
    res.forEach(function(c){ if (!c.parentId && rp[c.id] && rp[c.id] !== c.id){ c.parentId = rp[c.id]; c.isReply = true; } });
    return { comments: res, postAuthor: cap ? cap.authorName : '', postCaption: cap ? cap.text : '', postDate: cap ? cap.datetime : '' };
  }

  /* ---------- TikTok ---------- */
  var TT_BTN_EXCL = /(v[ií]deos?|seguir|follow|perfil|profile|sonido|sound|m[uú]sica|music|traduc|transl|compartir|share|descargar|download)/i;
  var TT_NODE_SEL = 'div[data-comment-ui-enabled][id],div[class*="DivCommentContentContainer"]';
  function ttNodes(){
    return Array.prototype.slice.call(document.querySelectorAll(TT_NODE_SEL)).filter(function(n){
      return n.querySelector('[data-e2e^="comment-level-"],p[class*="CommentText"]');
    });
  }
  function ttRoot(){
    var n = ttNodes(); if (!n.length) return document.body;
    var r = document.querySelector('[class*="DivCommentListContainer"],[data-e2e="comment-list"]');
    if (r && r.contains(n[0])) return r;
    var item = n[0].closest('[class*="DivCommentItemContainer"]') || n[0];
    return item.parentElement || document.body;
  }
  function ttTotal(){
    var els = document.querySelectorAll('[data-e2e="comment-count"],[data-e2e="browse-comment-count"],[class*="CommentTitle"],[class*="DivCommentCountContainer"]');
    for (var i = 0; i < els.length; i++){ var m = (els[i].textContent || '').match(/(\d[\d.,]*\s*(?:k|mil|m)?)/i); if (m){ var n = parseCount(m[1]); if (n) return n; } }
    return 0;
  }
  var FB_TOTAL_RE = /(\d[\d.,]*\s*(?:k|mil|m)?)\s*(comentarios?|comments?|commentaires?|comentários?|kommentare?|commenti)\b/i;
  // Total de comentarios de la publicación abierta. En los reels, Facebook carga también los reels vecinos (y el feed),
  // cada uno con su «N comentarios»: se elige el más cercano a los comentarios que se extraen y, a igualdad, el que está en pantalla.
  function fbTotal(){
    var cands = [];
    Array.prototype.slice.call(document.querySelectorAll('[aria-label]')).forEach(function(e){
      var l = e.getAttribute('aria-label') || ''; if (l.length > 80 || !/(coment|comment|kommentar)/i.test(l)) return;
      var m = l.match(FB_TOTAL_RE); if (m && e.offsetParent){ var n = parseCount(m[1]); if (n) cands.push({ e: e, n: n }); }
    });
    if (!cands.length) Array.prototype.slice.call(document.querySelectorAll('span,div[role="button"]')).forEach(function(e){
      if (e.childElementCount > 3) return;   // contenedores grandes: su texto no es un recuento (y leerlo es costoso)
      var t = quickText(e); if (t.length > 30 || !e.offsetParent) return;
      var m = t.match(/^(\d[\d.,]*\s*(?:k|mil|m)?)\s*(comentarios?|comments?|commentaires?|comentários?)$/i); if (m){ var n = parseCount(m[1]); if (n) cands.push({ e: e, n: n }); }
    });
    if (!cands.length) return 0;
    var ref = articles()[0] || null, vw = window.innerWidth, vh = window.innerHeight;
    var depth = function(e){ if (!ref) return 0; var a = e; while (a && !a.contains(ref)) a = a.parentElement; var d = 0; while (a){ d++; a = a.parentElement; } return d; };
    var onScreen = function(e){ var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw ? 1 : 0; };
    cands.forEach(function(c, i){ c.d = depth(c.e); c.v = onScreen(c.e); c.i = i; });
    cands.sort(function(a, b){ return (b.d - a.d) || (b.v - a.v) || (a.i - b.i); });
    return cands[0].n;
  }
  var totalAt = 0;
  function netTotal(){
    if (totalGen === gen || (totalCache && Date.now() - totalAt < 15000)) return totalCache;
    totalCache = TT ? ttTotal() : IG ? 0 : fbTotal(); totalGen = gen; totalAt = Date.now(); return totalCache;
  }
  function ttHandle(a){ var m = ((a && a.getAttribute('href')) || '').match(/^\/@([^/?#]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function ttLevel(n){ var e = n.querySelector('[data-e2e^="comment-level-"]'); var m = e ? (e.getAttribute('data-e2e') || '').match(/(\d+)$/) : null; return m ? +m[1] : 0; }
  function ttExtractOne(n){
    var links = Array.prototype.slice.call(n.querySelectorAll('a[href^="/@"]'));
    var textEl = n.querySelector('[data-e2e^="comment-level-"]') || n.querySelector('p[class*="CommentText"]');
    var inText = function(a){ return textEl && textEl.contains(a); };
    var userA = n.querySelector('a[href^="/@"][class*="UserLinkName"]') || links.filter(function(a){ return !a.querySelector('img') && !inText(a); })[0] || links[0] || null;
    var handle = ttHandle(userA);
    var nameEl = n.querySelector('[data-e2e^="comment-username-"]') || userA;
    var display = nameEl ? txt(nameEl).replace(/\s+/g, ' ').trim() : '';
    var text = textEl ? txt(textEl) : '';
    var timeEl = n.querySelector('[data-e2e^="comment-time-"]') || n.querySelector('[class*="CreatedTime"]');
    var likesEl = n.querySelector('[data-e2e="comment-like-count"]') || n.querySelector('[class*="LikeWrapper"] span');
    var likes = likesEl ? parseCount(txt(likesEl)) : 0;
    if (!likes){ var lw = n.querySelector('[class*="LikeWrapper"][aria-label]'); if (lw){ var ml = (lw.getAttribute('aria-label') || '').match(/(\d[\d.,]*\s*(?:k|mil|m)?)\s*(me gusta|likes?)/i); if (ml) likes = parseCount(ml[1]); } }
    var img = (links.filter(function(a){ return a.querySelector('img'); })[0] || n).querySelector('img');
    var level = ttLevel(n);
    var isReply = !!n.closest('[class*="DivReplyContainer"]') || level > 1;
    var parentId = '';
    if (isReply){
      var thread = n.closest('[class*="DivCommentItemContainer"]');
      var top = thread ? Array.prototype.slice.call(thread.querySelectorAll(TT_NODE_SEL)).filter(function(x){ return !x.closest('[class*="DivReplyContainer"]') && ttLevel(x) <= 1; })[0] : null;
      if (top && top !== n) parentId = top.id || '';
    }
    var mentions = textEl ? Array.prototype.slice.call(textEl.querySelectorAll('a[href^="/@"]')).map(function(a){
      var t = txt(a).replace(/^@/, '').trim(); if (t) return t;
      var hnd = ttHandle(a); return /^MS4wLj/.test(hnd) || hnd.length > 30 ? '' : hnd;   // ID interno: no es un nombre
    }).filter(Boolean) : [];
    var badges = [];
    Array.prototype.slice.call(n.querySelectorAll('span,div,p')).forEach(function(e){
      if (e.children.length || (textEl && textEl.contains(e))) return;
      var t = (e.textContent || '').trim();
      if (/^(creador|creator|autor|author)$/i.test(t)) badges.push('Autor de la publicación');
      else if (/^(fijado|pinned)$/i.test(t)) badges.push('Fijado');
      else if (/(le gusta al creador|liked by creator)/i.test(t)) badges.push('Le gusta al creador');
    });
    return {
      id: n.id || '', parentId: parentId, isReply: isReply, authorName: display || handle, authorId: handle,
      authorUrl: handle ? 'https://www.tiktok.com/@' + handle : '', authorAvatar: img ? img.src : '', badges: badges,
      text: text, dateText: timeEl ? txt(timeEl).replace(/ /g, ' ').trim() : '', reactions: likes, attachments: [],
      mentions: mentions, replyTo: isReply && mentions[0] ? mentions[0] : '', edited: false,
      permalink: location.href.split('?')[0], indent: Math.round(n.getBoundingClientRect().left), platform: 'tiktok'
    };
  }
  function ttExtractAll(onlyNew){
    var res = [], seen = {};
    ttNodes().forEach(function(n, i){
      if (onlyNew && n.id && byKey[n.id]) return;   // ya recogido: no volver a procesarlo
      try {
        var c = ttExtractOne(n);
        var key = c.id || (c.authorId + '|' + c.text);
        if (seen[key]) return; seen[key] = 1;
        c.order = i; res.push(c);
      } catch(e){ console.warn('Comentario omitido', e); }
    });
    var mp = location.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/(\d+)/);
    var desc = document.querySelector('[data-e2e="browse-video-desc"],[data-e2e="video-desc"]');
    return { comments: res, postAuthor: mp ? decodeURIComponent(mp[1]) : '', postCaption: desc ? txt(desc) : '', postDate: '' };
  }

  /* ---------- Publicación original: detección de cambios y recogida incremental ---------- */
  // Identifica la publicación abierta. En TikTok, Instagram y Facebook la página cambia de publicación sin recargarse.
  function postKey(){
    var pth = location.pathname, q = new URLSearchParams(location.search);
    if (TT){ var m = pth.match(/\/(?:video|photo)\/(\d+)/); return m ? 'tt:' + m[1] : 'tt:' + pth; }
    if (IG){ return 'ig:' + (igCode() || pth); }
    return 'fb:' + pth + '|' + (q.get('story_fbid') || '') + '|' + (q.get('fbid') || '') + '|' + (q.get('v') || '');
  }
  function keyOf(c){ return c.id || (c.authorName + '|' + c.text); }
  // ---- Antes de empezar: abrir la sección de comentarios (reels de Facebook/Instagram, vídeos de TikTok) ----
  var OPEN_RE = /^(comentar|comment|comentarios|comments|ver comentarios|view comments|ver los comentarios|ver todos los comentarios|view all comments|deja un comentario|leave a comment|abrir comentarios|open comments|comentários|commentaires|commenter|kommentieren|kommentare|commenta|commenti)\b/i;
  var LIKE_RE = /^(me gusta|like|reaccionar|react|j'aime|curtir|gefällt mir|mi piace)\b/i;
  function visibleCount(){ return TT ? ttNodes().length : IG ? igTimes().length : articles().length; }
  function loadingVisible(){ return !!document.querySelector('[aria-busy="true"],[data-visualcompletion="loading-state"],[role="progressbar"]'); }
  function commentButtons(){
    var list = [];
    if (TT) list = Array.prototype.slice.call(document.querySelectorAll('[data-e2e="comment-icon"],[data-e2e="browse-comment-icon"],[data-e2e="comment-count"],button[aria-label*="omment"],button[aria-label*="omentario"]'));
    else {
      list = Array.prototype.slice.call(document.querySelectorAll('[aria-label]')).filter(function(el){
        var l = (el.getAttribute('aria-label') || '').trim().replace(/\s*[·:]?\s*\d[\d.,]*\s*[kKmM]?$/, '');   // "Comentar 25" → "Comentar"
        return OPEN_RE.test(l);
      });
      // Reels de Facebook: columna de acciones (Me gusta · Comentar · Compartir). Si el botón no tiene una etiqueta
      // reconocible, se toma el botón situado justo debajo de "Me gusta" en esa columna.
      if (!list.length && !IG){
        Array.prototype.slice.call(document.querySelectorAll('[aria-label]')).filter(function(el){ return LIKE_RE.test((el.getAttribute('aria-label') || '').trim()) && el.offsetParent; }).forEach(function(like){
          var lb = (like.closest('[role="button"],button') || like), r = lb.getBoundingClientRect();
          var next = Array.prototype.slice.call(document.querySelectorAll('[role="button"],button')).filter(function(b){
            if (b === lb || !b.offsetParent || b.contains(lb) || lb.contains(b)) return false;
            var q = b.getBoundingClientRect();
            return Math.abs((q.left + q.width / 2) - (r.left + r.width / 2)) < 24 && q.top > r.bottom - 4 && q.top - r.bottom < 120;
          }).sort(function(a, b){ return a.getBoundingClientRect().top - b.getBoundingClientRect().top; })[0];
          if (next) list.push(next);
        });
      }
    }
    return list.map(function(el){ return el.closest('button,[role="button"],a') || el; }).filter(function(el, i, a){
      return a.indexOf(el) === i && el.offsetParent && el.getAttribute('role') !== 'textbox' && !el.isContentEditable && !el.closest('[contenteditable="true"],form');
    });
  }
  async function openComments(){
    bumpGen();
    if (visibleCount() > 0) return;
    // En Instagram el icono de comentarios solo despliega la lista en los reels; en las publicaciones sirve para escribir (y sin sesión abre el acceso)
    if (IG && !/\/(reel|reels)\//.test(location.pathname)) return;
    // Si la sección ya se está abriendo (marcadores de carga), primero se espera a que termine (máx. ~10 s)
    for (var w0 = 0; w0 < 40 && loadingVisible() && !stop; w0++){ if (w0 === 0) status('Esperando a que carguen los comentarios…', true); await sleep(250); bumpGen(); if (visibleCount() > 0){ await sleep(600); return; } }
    if (visibleCount() > 0) return;
    // un botón ya activo (sección abierta) no se pulsa: lo cerraría
    var btns = commentButtons().filter(function(b){ return b.getAttribute('aria-pressed') !== 'true' && b.getAttribute('aria-expanded') !== 'true'; });
    if (!btns.length) return;
    status('Abriendo la sección de comentarios…', true);
    if (AUTO) AUTO.emit({ type: 'progress', round: 0, count: 0, note: 'abriendo comentarios' });
    for (var i = 0; i < Math.min(btns.length, 3) && !stop; i++){
      try { btns[i].scrollIntoView({ block: 'center' }); btns[i].click(); } catch(e){}
      // esperar a que aparezcan los comentarios y desaparezcan los marcadores de carga (máx. ~12 s)
      for (var t = 0; t < 60 && !stop; t++){ await sleep(200); bumpGen(); var n = visibleCount(); if (n > 0 && (!loadingVisible() || t > 15)) { await sleep(250); return; } }
    }
  }
  // ---- Facebook: cambiar "Más relevantes" por "Todos los comentarios" para no perder ninguno ----
  // nombres del orden actual (Facebook los cambia: «Más relevantes» → «Más pertinentes»)
  var SORT_RE = /^((los )?más (relevantes|pertinentes|recientes)|comentarios (destacados|más relevantes|más pertinentes)|most relevant|top comments|newest|most recent|plus pertinents|les plus pertinents|plus récents|mais relevantes|mais recentes)$/i;
  var ALL_RE = /^(todos los comentarios|all comments|tous les commentaires|todos os comentários|alle kommentare|tutti i commenti)/i;
  var PERT_RE = /^((los )?más (pertinentes|relevantes)|comentarios (destacados|más relevantes|más pertinentes)|most relevant|top comments|plus pertinents|les plus pertinents|mais relevantes)/i;
  var REC_RE = /^((los )?más recientes|newest|most recent|plus récents|mais recentes)/i;
  // comentarios a revisar: «pert» (más pertinentes), «rec» (más recientes) o «all» (todos); lo elige el usuario en la app
  var ORDER = (AUTO && (String(AUTO.jobId || '').match(/~o=(pert|rec|all)/) || [])[1]) || 'all';
  var ORDER_RE = { pert: PERT_RE, rec: REC_RE, all: ALL_RE }[ORDER];
  // máximo de comentarios por publicación (0 = sin límite); también llega en el identificador del trabajo
  var LIMIT = +((String(AUTO && AUTO.jobId || '').match(/~l=(\d+)/) || [])[1] || 0);
  var ORDER_TXT = { pert: 'Mostrando los comentarios más pertinentes…', rec: 'Mostrando los comentarios más recientes…', all: 'Mostrando todos los comentarios…' }[ORDER];
  // Estado del orden: 'cambiado' | 'ya' (ya mostraba todos) | 'sin-selector' | 'sin-opcion'
  var sortState = '', sortTries = 0, sortMenu = [], LOOP = { round: 0, second: false };   // LOOP: datos del bucle para el diagnóstico final
  function sortButtons(){ return Array.prototype.slice.call(root().querySelectorAll('div[role="button"],span[role="button"],[aria-haspopup="menu"]')).filter(function(b){ return b.offsetParent; }); }
  // pulsación completa (Facebook abre algunos menús al soltar el botón, no con un click() simple)
  function press(el){
    var r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, o))); } catch(e){}
    try { el.dispatchEvent(new MouseEvent('mousedown', o)); } catch(e){}
    try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, o))); } catch(e){}
    try { el.dispatchEvent(new MouseEvent('mouseup', o)); } catch(e){}
    try { el.click(); } catch(e){}
  }
  // textContent evita recalcular el diseño de cada botón (innerText lo hace y con miles de botones congela la pestaña)
  var sortText = function(b){ return (b.textContent || '').trim().split('\n')[0].replace(/\s+/g, ' ').trim(); };
  async function fbAllComments(){
    if (sortState === 'cambiado' || sortState === 'ya') return sortState;
    sortTries++;
    var bs = sortButtons();
    if (bs.some(function(b){ return ORDER_RE.test(sortText(b)); })) return (sortState = 'ya');   // ya muestra el orden pedido
    var sortBtn = bs.filter(function(b){ var t = sortText(b); return SORT_RE.test(t) || ALL_RE.test(t); })[0];
    if (!sortBtn) return (sortState = 'sin-selector');
    try { sortBtn.scrollIntoView({ block: 'center' }); } catch(e){}
    press(sortBtn);
    for (var t = 0; t < 20; t++){
      await sleep(150);
      var items = Array.prototype.slice.call(document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"]')).filter(function(m){ return m.offsetParent; });
      if (items.length && !sortMenu.length) sortMenu = items.map(function(m){ return (quickText(m).split('\n')[0] || '').slice(0, 40); }).slice(0, 6);
      var item = items.filter(function(m){ return ORDER_RE.test(quickText(m)); })[0];
      if (item){
        press(item); status(ORDER_TXT, true);
        for (var t2 = 0; t2 < 16; t2++){ await sleep(150); if (!loadingVisible() && t2 >= 3) break; }
        // comprobar que el orden cambió (el botón muestra ahora «Todos los comentarios»); si no, se reintenta en otra ronda
        bumpGen();
        var now = sortButtons().some(function(b){ return ORDER_RE.test(sortText(b)); });
        return (sortState = now ? 'cambiado' : 'sin-confirmar');
      }
      if (t === 8 && !items.length) press(sortBtn);   // el menú no se abrió: segundo intento
    }
    try { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch(e){}
    return (sortState = 'sin-opcion');
  }
  function platformExtract(onlyNew){
    if (TT) return ttExtractAll(onlyNew);
    if (IG) return igExtractAll();
    var hh = root().querySelector('h2 a, h3 a, strong a');
    return { comments: extractAll(), postAuthor: hh ? txt(hh) : '', postCaption: '', postDate: '' };
  }
  // Añade los comentarios visibles conservando el orden de la página (en TikTok el padre viene por ID: basta con añadir al final)
  function merge(list){
    var prev = null;
    list.forEach(function(c){
      var k = keyOf(c);
      if (byKey[k]){ Object.assign(byKey[k], c); prev = byKey[k]; return; }
      byKey[k] = c;
      if (TT) collected.push(c);
      else if (!prev) collected.unshift(c);
      else { var pi = collected[collected.length - 1] === prev ? collected.length - 1 : collected.lastIndexOf(prev); collected.splice(pi + 1, 0, c); }
      prev = c;
    });
  }
  // Solo recoge mientras la página sigue mostrando la publicación original
  function snapshot(full){
    if (postKey() !== startKey) return;
    var r = platformExtract(!full);
    merge(r.comments);
    if (r.postAuthor) meta.postAuthor = r.postAuthor;
    if (r.postCaption) meta.postCaption = r.postCaption;
    if (r.postDate) meta.postDate = r.postDate;
    meta.url = location.href; meta.title = document.title;
  }
  // Pausa con aviso hasta que el usuario decida qué hacer
  function waitDecision(){
    return new Promise(function(resolve){
      bStop.style.display = 'none'; bRestartAll.style.display = 'none'; bResume.style.display = ''; bUse.style.display = ''; bRestart.style.display = '';
      var tick = function(){
        if (closed){ clearInterval(iv); return; }
        var back = postKey() === startKey;
        bResume.disabled = !back; bResume.style.opacity = back ? '1' : '.45'; bResume.style.cursor = back ? 'pointer' : 'not-allowed';
        st.style.color = back ? '#146c2e' : '#8c1d18';
        status(back ? 'Has vuelto a la publicación original. Puedes reanudar la extracción.'
          : '⚠ Cambiaste de publicación. Para no mezclar comentarios, la extracción está en pausa. Llevas ' + collected.length + ' comentarios de la publicación original.');
      };
      var iv = setInterval(tick, 400); tick();
      function done(v){ clearInterval(iv); bRestartAll.style.display = ''; st.style.color = '#444746'; bResume.style.display = 'none'; bUse.style.display = 'none'; bRestart.style.display = 'none'; bStop.style.display = ''; resolve(v); }
      bResume.onclick = function(){ if (postKey() === startKey) done('resume'); };
      bUse.onclick = function(){ done('use'); };
      bRestart.onclick = function(){ done('restart'); };
    });
  }
  async function finish(){
    if (restarting){ relaunch(); return; }
    finished = true;
    status('Extrayendo datos…');
    bumpGen();
    var onOriginal = postKey() === startKey;
    // última lectura por tandas, cediendo el control entre una y otra (antes era de golpe y congelaba la pestaña con miles de comentarios)
    if (onOriginal && !useCollectedOnly){ for (var k = 0; k < 800; k++){ snapshot(true); if (!snapPending) break; await sleep(k % 10 === 9 ? 30 : 0); } }
    var comments = collected.map(function(c, i){ c.order = i; return c; });
    if (LIMIT && comments.length > LIMIT){ comments = comments.slice(0, LIMIT); LOOP.limite = true; }   // exactamente el máximo pedido
    var postAuthor = meta.postAuthor || '', postCaption = meta.postCaption || '', postDate = meta.postDate || '';
    var data = { source: 'social-dom-extractor', platform: TT ? 'tiktok' : IG ? 'instagram' : 'facebook', version: 3, url: meta.url || location.href, title: meta.title || document.title, cambioDePublicacion: !onOriginal,
      postAuthor: postAuthor, postCaption: postCaption, postDate: postDate, extractedAt: new Date().toISOString(), userAgentLang: navigator.language, count: comments.length, comments: comments };
    if (IG && onOriginal) data.diag = igDiag(comments.length);
    if (TT && onOriginal) data.diag = { totalSegunTikTok: ttTotal(), comentariosEnPagina: ttNodes().length, extraidos: comments.length,
      principales: comments.filter(function(c){ return !c.isReply; }).length, respuestas: comments.filter(function(c){ return c.isReply; }).length,
      botonesRespuestas: document.querySelectorAll('[data-e2e^="view-more"],p[class*="ReplyActionText"]').length,
      panel: !!document.querySelector('[class*="DivCommentListContainer"],[data-e2e="comment-list"]') };
    data.diag = data.diag || {}; data.diag.cambioDePublicacion = !onOriginal; data.diag.esperasPorLentitud = LOOP.esperas || 0;
    // qué comentarios se revisaron: el orden pedido y si se pudo aplicar (Instagram y TikTok muestran su propio orden)
    data.order = TT || IG ? { pedido: ORDER, aplicado: 'red' } : { pedido: ORDER, aplicado: sortState === 'ya' || sortState === 'cambiado' ? ORDER : null };
    data.order.limite = LIMIT; data.order.alcanzado = !!LOOP.limite;
    var netTot = onOriginal ? netTotal() : 0; if (netTot) data.total = netTot;
    if (!TT && !IG && onOriginal){
      var pend = sortButtons().map(function(b){ return quickText(b).replace(/^[\s—–\-·•]+/, ''); }).filter(function(t){ return t && t.length < 80 && !EXCL.test(t) && EXP.some(function(re){ return re.test(t); }); });
      Object.assign(data.diag, { totalSegunFacebook: netTot, extraidos: comments.length, sinId: comments.filter(function(c){ return !c.id; }).length,
        respuestas: comments.filter(function(c){ return c.isReply; }).length, orden: sortState || 'sin-intentar', intentosOrden: sortTries, opcionesOrden: sortMenu,
        segundaPasada: LOOP.second, rondas: LOOP.round, terminoSinAvanceSeg: LOOP.sinAvance || 0, botonesPulsados: pressed.slice(0, 40), botonesSinPulsarAlFinal: pend.map(function(t){ return t.replace(/\d+/g, 'N'); }).slice(0, 20),
        fuenteComentarios: document.querySelectorAll('[data-sca-art]').length ? 'estructura' : 'articulos' });
    }
    if (!TT && !IG) Object.assign(data.diag, { articulos: document.querySelectorAll('div[role="article"]').length, articulosComentario: articles().length,
      enlacesComentario: document.querySelectorAll('a[href*="comment_id="]').length, cargando: loadingVisible(), dialogos: document.querySelectorAll('div[role="dialog"]').length,
      botonesComentar: commentButtons().map(function(b){ return (b.getAttribute('aria-label') || quickText(b)).slice(0, 40) + (b.getAttribute('aria-pressed') ? ' [pressed=' + b.getAttribute('aria-pressed') + ']' : ''); }).slice(0, 6),
      etiquetasBotones: Array.prototype.slice.call(document.querySelectorAll('[role="button"][aria-label],button[aria-label]'), 0, 1500).filter(function(b){ return b.offsetParent; }).map(function(b){ return b.getAttribute('aria-label').replace(/\d[\d.,]*/g, 'N').slice(0, 40); }).filter(function(v, i, a){ return a.indexOf(v) === i; }).slice(0, 40) });
    if (data.diag) data.diag.pulsados = pressed.filter(function(v, i, a){ return a.indexOf(v) === i; });
    if (AUTO){ window.__fbcx = false; AUTO.emit({ type: 'done', data: data }); return; }
    var json = JSON.stringify(data, null, 2);
    out.value = json; out.style.display = 'block';
    bStop.style.display = 'none'; bCopy.style.display = ''; bDl.style.display = '';
    status(comments.length ? '✓ ' + comments.length + ' comentarios extraídos' + (onOriginal ? '' : ' de la publicación original (no se mezclaron con la nueva)') + '. Copia el JSON y pégalo en el analizador.'
      : '⚠ No se encontraron comentarios. Abre la sección de comentarios de la publicación (icono de comentarios) y vuelve a pulsar el marcador. Si sigue fallando, envía el JSON: incluye un diagnóstico sin textos ni nombres.');
    bCopy.onclick = function(){
      var ok = function(){ bCopy.textContent = '¡Copiado!'; setTimeout(function(){ bCopy.textContent = 'Copiar JSON'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(ok, function(){ out.select(); document.execCommand('copy'); ok(); });
      else { out.select(); document.execCommand('copy'); ok(); }
    };
    bDl.onclick = function(){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'comentarios-' + data.platform + '-' + Date.now() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    };
    window.__fbcx = false;
  }
  (async function(){
    var clicks = new Map(), idle = 0, round = 0, lastCollected = 0, secondPass = false;
    // última vez que llegaron comentarios nuevos: si pasa demasiado tiempo sin ninguno, se termina aunque queden botones
    var lastGrow = Date.now(), lastLen = 0;
    // guardado parcial: envía a la app los comentarios nuevos desde el último envío; si la pestaña se congela o se cierra, no se pierden
    var lastCp = Date.now(), cpSent = {};
    function checkpoint(){
      lastCp = Date.now();
      var nuevos = collected.filter(function(c){ var k = keyOf(c); if (cpSent[k]) return false; cpSent[k] = 1; return true; });
      if (nuevos.length) AUTO.emit({ type: 'progress', round: round, count: collected.length, visible: countNow(), total: netTotal() || null, note: '\u0001sca-cp:' + JSON.stringify(nuevos) });
    }
    var countNow = function(){ return TT ? ttNodes().length : IG ? igTimes().length : articles().length; };
    // En cuanto aparece el botón de comentarios se abre la sección (los reels no muestran comentarios sin pulsarlo).
    // Si no hay botón, se espera a que la red pinte los comentarios (Instagram sin sesión tarda 10–15 s) o a la pantalla de acceso.
    var canOpen = !(IG && !/\/(reel|reels)\//.test(location.pathname));
    for (var w1 = 0; w1 < 80 && visibleCount() === 0 && !stop; w1++){
      if (w1 === 0) status('Buscando la sección de comentarios…', true);
      if (canOpen && w1 >= 2 && commentButtons().some(function(b){ return b.getAttribute('aria-pressed') !== 'true' && b.getAttribute('aria-expanded') !== 'true'; })) break;
      await sleep(250); bumpGen();
    }
    // Sin sesión, Instagram y Facebook pueden mostrar una pantalla de acceso en lugar de la publicación
    var loginWall = function(){
      if (visibleCount() > 0) return false;
      if (IG) return !!document.querySelector('input[name="username"]');
      if (!TT) return !!document.querySelector('form[action*="login"] input[name="email"], #login_form, [data-testid="royal_login_form"]') && !articles().length;
      return false;
    };
    // Ventana estrecha: Instagram muestra su versión móvil (enlaces intent://) sin comentarios en la página
    if (IG && visibleCount() === 0 && document.querySelector('a[href^="intent://"]')){
      var msg = 'La ventana es demasiado estrecha: Instagram muestra su versión móvil, sin comentarios. Agranda la ventana (o elige “En segundo plano” en las opciones) y reintenta.';
      if (AUTO){ window.__fbcx = false; AUTO.emit({ type: 'error', error: msg }); return; }
      status('⚠ ' + msg); window.__fbcx = false; return;
    }
    if (loginWall()){
      var net = TT ? 'TikTok' : IG ? 'Instagram' : 'Facebook';
      if (AUTO){ window.__fbcx = false; AUTO.emit({ type: 'error', error: 'No has iniciado sesión en ' + net + ' en este navegador: la red muestra la pantalla de acceso en lugar de la publicación. Inicia sesión y continúa el seguimiento.' }); return; }
      status('⚠ No has iniciado sesión en ' + net + ': inicia sesión y vuelve a pulsar el marcador.'); window.__fbcx = false; return;
    }
    await openComments();
    if (!TT && !IG) await fbAllComments();
    bumpGen();
    startKey = postKey(); snapshot();
    if (AUTO) AUTO.emit({ type: 'progress', round: 0, count: collected.length, visible: countNow(), note: collected.length ? 'comentarios abiertos' : '' });
    while (!stop && round < 600){
      round++; LOOP.round = round;
      bumpGen();
      if (AUTO && AUTO.stopRequested){ stop = true; break; }
      if (!TT && !IG && round <= 6 && sortState !== 'cambiado' && sortState !== 'ya' && round % 2 === 0) await fbAllComments();
      if (postKey() !== startKey){
        if (AUTO){ useCollectedOnly = true; break; }   // sin usuario delante: se conserva solo lo de la publicación original
        var dec = await waitDecision();
        if (dec === 'use'){ useCollectedOnly = true; break; }
        if (dec === 'restart'){ collected = []; byKey = {}; meta = {}; startKey = postKey(); clicks = new Map(); idle = 0; round = 0; pressed = []; resetCaches(); snapshot(); }
        continue;
      }
      var r = TT ? ttRoot() : IG ? igRoot() : root();
      var btnSel = TT ? 'p[role="button"],div[role="button"],span[role="button"],button,[data-e2e^="view-more"],p[class*="ReplyActionText"],[class*="DivViewRepliesContainer"]'
        : IG ? 'button,div[role="button"],span[role="button"]' : 'div[role="button"],span[role="button"]';
      var cand = Array.prototype.slice.call(r.querySelectorAll(btnSel));
      // Facebook: algunos «Ver N respuestas» son elementos con tabindex sin role="button"
      if (!TT && !IG) Array.prototype.slice.call(r.querySelectorAll('[tabindex="0"]:not([role]):not(a)')).forEach(function(b){ if (REPLY_BTN_RE.test(quickText(b)) && cand.indexOf(b) < 0) cand.push(b); });
      // el recuento se calcula una vez por ronda: antes se pedía por cada botón candidato (miles de veces)
      var nowCount = countNow();
      var btns = cand.filter(function(b){
        if (b.childElementCount > 12) return false;   // contenedores, no botones de «ver más»
        var t = quickText(b).replace(/^[\s—–\-·•]+/, '');
        if (!t || t.length > 80) return false;
        // Un botón se puede volver a pulsar si su texto cambió ("Ver 68 más" -> "Ver 58 más"); si no, máximo 4 veces
        var ck = clicks.get(b);
        if (ck && (ck.all >= 3000 || (ck.n >= (ck.t === t ? 4 : 60) && !(nowCount > ck.c)))) return false;
        // un botón que en sus dos últimas pulsaciones no hizo nada (sigue igual) no se vuelve a pulsar;
        // los de «Ver más comentarios» nunca se descartan así: Facebook tarda en cargar y no desaparecen al pulsarlos
        if (ck && ck.t === t && (ck.noEff || 0) >= 2 && !LOAD_MORE_RE.test(t)) return false;
        if (!t || t.length > 80 || EXCL.test(t)) return false;
        if ((IG || TT) && (IG_BTN_EXCL.test(t) || TT_BTN_EXCL.test(t))) return false;
        return EXP.some(function(re){ return re.test(t); }) && !!b.offsetParent;
      });
      if (IG){ // "Cargar más comentarios" es un botón con solo un icono
        Array.prototype.slice.call(r.querySelectorAll('svg[aria-label]')).forEach(function(s){
          if (!IG_LOAD_RE.test(s.getAttribute('aria-label') || '')) return;
          var b = s.closest('button,[role="button"]') || s.parentElement;
          if (b && (!clicks.get(b) || clicks.get(b).n < 4) && btns.indexOf(b) < 0) btns.push(b);
        });
      }
      // prioridad: primero los que nunca se pulsaron, después los que cargaron comentarios la última vez, al final el resto
      var rank = function(b){ var ck = clicks.get(b); return !ck ? 0 : !ck.noEff ? 1 : 2; };
      btns = btns.map(function(b, i){ return { b: b, r: rank(b), i: i }; }).sort(function(x, y){ return (x.r - y.r) || (x.i - y.i); }).map(function(x){ return x.b; });
      if (btns.length > 15) btns = btns.slice(0, 15);   // rondas cortas: con miles de comentarios hay cientos de botones
      if (btns.length){
        idle = 0;
        var beat = Date.now();
        for (var i = 0; i < btns.length && !stop && postKey() === startKey; i++){
          // la app sabe que la extensión sigue trabajando aunque la ronda sea larga
          if (AUTO && Date.now() - beat > 5000){ beat = Date.now(); AUTO.emit({ type: 'progress', round: round, count: collected.length, visible: countNow(), total: netTotal() || null }); }
          var b = btns[i], bt = quickText(b).replace(/^[\s—–\-·•]+/, '');
          var prev = clicks.get(b), curCount = countNow();
          // si desde la última pulsación llegaron comentarios nuevos, el botón sigue cargando: se cuenta como progreso
          var grew = prev && curCount > prev.c;
          var entry = { n: prev && !grew ? prev.n + 1 : 1, all: (prev ? prev.all : 0) + 1, t: bt, c: curCount, noEff: prev && prev.t === bt ? (prev.noEff || 0) : 0 };
          clicks.set(b, entry);
          if (bt && pressed.length < 60) pressed.push(bt.replace(/\d+/g, 'N'));
          try { b.scrollIntoView({ block: 'center' }); b.click(); } catch(e){}
          var want = 450 + Math.random() * 450, ts = Date.now();
          await sleep(want);
          var lag = Date.now() - ts - want;
          // la red está ocupada pintando lo cargado: se deja respirar en vez de acumular más pulsaciones (evita «Página sin respuesta»)
          if (lag > 1200 && !document.hidden){
            LOOP.esperas = (LOOP.esperas || 0) + 1;
            status('La página va lenta: esperando a que termine de cargar…', true);
            await sleep(Math.min(8000, lag * 2));
            if (lag > 3000){ bumpGen(); break; }   // ronda terminada: se recoge lo cargado antes de seguir
          }
          bumpGen();   // la pulsación puede haber cargado comentarios: las listas se recalculan una vez
          // efecto propio de este botón: los de respuestas desaparecen o cambian al abrirse; si sigue igual, no hizo nada
          // (no se mira el recuento: la carga de Facebook puede tardar más que la pausa y un botón útil parecería muerto)
          var gone = !b.isConnected || !b.offsetParent || quickText(b).replace(/^[\s—–\-·•]+/, '') !== bt;
          entry.noEff = gone || loadingVisible() ? 0 : entry.noEff + 1;
        }
      } else {
        var before = countNow();
        idle++;
        if (!TT && !IG && idle % 3 === 0) scrollNudge();     // subir y volver a bajar: algunas listas solo cargan al detectar desplazamiento
        scrollAll(); await sleep(TT ? 1800 : 1300);
        bumpGen();
        var after = countNow(), total = netTotal();
        if (after > before || collected.length > lastCollected) idle = 0;   // siguen llegando comentarios: continuar
        lastCollected = collected.length;
        // el total de la red incluye respuestas y a veces comentarios ocultos o eliminados: se acepta un 3 % de diferencia
        var goal = ORDER === 'all' ? (LIMIT && total ? Math.min(total, LIMIT) : total) : 0;   // solo con «todos» se intenta llegar al total (o al límite)
        if (idle >= (goal && collected.length < goal * 0.97 ? (TT ? 8 : 10) : 4)){
          if (!TT && !IG && !secondPass && goal && collected.length < goal * 0.97){
            // segunda pasada: volver a intentar «Todos los comentarios», reiniciar los botones y recorrer el panel de nuevo
            secondPass = true; LOOP.second = true; idle = 0; clicks = new Map(); sortState = sortState === 'cambiado' || sortState === 'ya' ? sortState : '';   // también 'sin-confirmar'
            status('Faltan comentarios frente al total de Facebook: revisando de nuevo…', true);
            await fbAllComments(); scrollNudge(); await sleep(800); scrollAll(); await sleep(1200);
            continue;
          }
          break;
        }
      }
      snapshot();   // recoger en cada ronda mientras se sigue en la publicación original
      var tot = netTotal();
      if (collected.length > lastLen){ lastLen = collected.length; lastGrow = Date.now(); }
      if (AUTO && Date.now() - lastCp > 30000) checkpoint();
      // botones que ya no cargan nada (respuestas eliminadas, «Ver más» sin efecto): sin comentarios nuevos durante 45 s
      // (90 s si aún falta más del 3 % del total) se da la extracción por terminada en lugar de seguir pulsándolos sin fin
      var stallMs = ORDER === 'all' && tot && collected.length < (LIMIT ? Math.min(tot, LIMIT) : tot) * 0.97 ? 90000 : 45000;
      // máximo alcanzado: se termina
      if (LIMIT && collected.length >= LIMIT){ LOOP.limite = true; break; }
      if (round > 3 && Date.now() - lastGrow > stallMs){ LOOP.sinAvance = Math.round((Date.now() - lastGrow) / 1000); break; }
      status('Desplegando comentarios · ronda ' + round + ' · ' + countNow() + (tot ? ' de ' + tot : ' visibles'), true);
      if (AUTO) AUTO.emit({ type: 'progress', round: round, count: collected.length, visible: countNow(), total: tot || null });
    }
    finish();
  })();
}fbExtractor();
})();
