/* Social Networks Manager · publicación en grupos y respuesta a comentarios (se ejecuta en facebook.com con la sesión del usuario).
 * Pasos: abrir «Escribe algo…», pegar el texto, adjuntar archivos, pulsar «Publicar» y comprobar el resultado.
 * Si Facebook muestra un aviso de bloqueo o restricción, se detiene y lo comunica para que la app pare. */
(() => {
  if (window.__fbpAuto) return;
  window.__fbpAuto = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const label = el => ((el.getAttribute && el.getAttribute('aria-label')) || el.innerText || '').replace(/\s+/g, ' ').trim();
  const fullText = el => ((el.innerText || '') + ' ' + ((el.getAttribute && el.getAttribute('aria-label')) || '')).replace(/\s+/g, ' ').trim();
  async function waitFor(fn, ms = 15000, step = 300) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(step); }
    return null;
  }
  function click(el) {
    el.scrollIntoView({block: 'center'});
    const o = {bubbles: true, cancelable: true, view: window};
    el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }
  const progress = step => { try { chrome.runtime.sendMessage({from: 'fb', type: 'progress', step}); } catch {} };

  const RX = {
    composer: /(escribe algo|write something|crea una publicaci[oó]n|create a (public )?post|qu[eé] est[aá]s pensando|what'?s on your mind)/i,
    join: /^(unirte al grupo|join group|unirse al grupo)$/i,
    post: /^(publicar|post)$/i,
    photo: /(foto\/v[ií]deo|photo\/video)/i,
    pending: /(pendiente|pending|se est[aá] revisando|being reviewed|aprob(ar|aci[oó]n)|approv(e|al))/i,
    block: /(demasiado r[aá]pido|going too fast|too fast|bloqueado temporalmente|bloqueo temporal|temporarily blocked|you'?re temporarily|no puedes usar esta funci[oó]n|can'?t use this feature|cuenta (est[aá] )?restringida|account (is )?restricted|confirma tu identidad|confirm your identity|uso indebido de esta funci[oó]n|misusing this feature|va en contra de nuestras normas|goes against our community standards)/i,
    groupBlock: /(no puedes publicar en este grupo|you can'?t post in this group|solo los administradores pueden publicar|only admins can post|las publicaciones est[aá]n desactivadas|posting is turned off|no puedes publicar|you can'?t post)/i
  };
  const dialogs = () => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(vis);
  const textboxIn = d => [...d.querySelectorAll('[contenteditable=true][role=textbox],[contenteditable=true]')].find(vis);
  const composerDialog = () => dialogs().find(d => textboxIn(d));
  const postButton = d => [...d.querySelectorAll('[role=button],button')].filter(vis).find(b => RX.post.test(label(b)));
  function alertText(exclude) {
    for (const n of [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert]')].filter(vis)) {
      if (exclude && exclude.has(n)) continue;
      const t = fullText(n);
      if (RX.block.test(t)) return t.slice(0, 240);
    }
    return null;
  }
  /* Avisos transitorios de Facebook mientras envía (no son mensajes relevantes) */
  const TRANSIENT = /^(publicando|posting|publicado|posted|compartiendo|sharing|subiendo|uploading|cargando|loading|enviando|sending|procesando|processing)\b[\s.…]*(\d+\s*%)?[\s.…]*$/i;
  const BTN_LINE = /^(cerrar|close|aceptar|ok|entendido|got it|cancelar|cancel|ver m[aá]s|see more|más información|learn more|continuar|continue|listo|done|x)$/i;
  function msgText(n) {
    const lines = (n.innerText || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !BTN_LINE.test(l));
    const t = lines.join(' ').trim();
    if (TRANSIENT.test(t)) return '';
    return t.length >= 8 ? t.slice(0, 400) : '';
  }
  /* Tarjeta de vista previa del enlace dentro del cuadro de publicación */
  function previewEl(d, tb) {
    const rm = [...d.querySelectorAll('[aria-label]')].find(e => vis(e) && /(quitar|eliminar|remove).{0,30}(vista previa|preview)/i.test(e.getAttribute('aria-label')));
    if (rm) return rm;
    return [...d.querySelectorAll('a[href]')].find(a => vis(a) && !tb.contains(a) && /facebook\.com|fb\.watch/.test(a.href)) || null;
  }
  function selectAllIn(el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function b64ToFile(f) {
    const bin = atob(f.data.replace(/^data:[^,]*,/, ''));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], f.name, {type: f.type});
  }
  function pasteInto(el, dt) {
    el.focus();
    return el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
  }
  const attachedCount = d => d.querySelectorAll('img[src^="blob:"],video[src^="blob:"],img[src^="data:"]').length;

  async function post(job) {
    const loginForm = document.querySelector('input[name=email]') && document.querySelector('input[name=pass]') && !document.querySelector('[role=main] [role=feed]');
    if (loginForm && !/checkpoint/.test(location.pathname)) return {ok: false, step: 'login', error: 'No has iniciado sesión en Facebook en este navegador.'};
    if (/\/login|checkpoint/.test(location.pathname)) return {ok: false, step: 'login', blocked: /checkpoint/.test(location.pathname), error: 'Inicia sesión en Facebook en este navegador y vuelve a intentarlo'};
    progress('Esperando a que cargue el grupo…');
    await waitFor(() => document.querySelector('[role=main]'), 20000);
    await sleep(1500);
    const pre = alertText();
    if (pre) return {ok: false, blocked: true, step: 'load', error: pre, messages: [pre]};
    const grp = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert]')].filter(vis).map(msgText).find(t => t && RX.groupBlock.test(t));
    if (grp) return {ok: false, step: 'group', error: grp, messages: [grp]};

    progress('Abriendo el cuadro de publicación…');
    let d = composerDialog();
    if (!d) {
      const btn = await waitFor(() => [...document.querySelectorAll('[role=button],[role=main] span')].filter(vis).find(b => RX.composer.test(fullText(b)) && fullText(b).length < 80), 15000);
      if (!btn) {
        const join = [...document.querySelectorAll('[role=button]')].filter(vis).some(b => RX.join.test(label(b)));
        return {ok: false, step: 'composer', error: join ? 'No eres miembro de este grupo' : 'No se encontró el cuadro «Escribe algo…» (puede que el grupo no permita publicar)'};
      }
      click(btn.closest('[role=button]') || btn);
      d = await waitFor(composerDialog, 15000);
    }
    if (!d) return {ok: false, step: 'dialog', error: 'No se abrió el cuadro de publicación'};
    const tb = textboxIn(d);
    await sleep(500);

    /* Enlace de la publicación: se pega para que Facebook genere la tarjeta de vista previa y,
       si se pide sin enlace en el texto, se borra después (la tarjeta se mantiene). */
    const link = typeof job.link === 'string' && /^https:\/\/(www\.facebook\.com|fb\.watch)\//.test(job.link) ? job.link : '';
    let previewOk = false;
    const writeText = async t => {
      const dt = new DataTransfer(); dt.setData('text/plain', t);
      pasteInto(tb, dt); await sleep(700);
      if (!tb.innerText.includes(t.trim().slice(0, 12))) { tb.focus(); document.execCommand('insertText', false, t); await sleep(500); }
      return tb.innerText.trim().length > 0;
    };
    if (link) {
      progress('Generando la vista previa de la publicación…');
      const before = previewEl(d, tb);
      await writeText(link + ' ');
      previewOk = !!(await waitFor(() => { const p = previewEl(d, tb); return p && p !== before ? p : null; }, 12000, 400));
      if (previewOk) {
        selectAllIn(tb); document.execCommand('delete'); await sleep(400);
        if (tb.innerText.includes(link.replace(/^https:\/\//, '').slice(0, 20))) { selectAllIn(tb); document.execCommand('insertText', false, ''); await sleep(400); }
        await sleep(400);
        if (!previewEl(d, tb)) { previewOk = false; await writeText(link); }   // Facebook quitó la tarjeta: se deja el enlace
      } else { selectAllIn(tb); document.execCommand('delete'); await sleep(300); }
    }
    const finalTxt = link && !previewOk ? (job.text ? job.text.trimEnd() + '\n\n' : '') + link : job.text;
    if (finalTxt) {
      progress('Escribiendo el texto…');
      if (!tb.innerText.trim() || (link && !previewOk)) { if (link && !previewOk) { selectAllIn(tb); document.execCommand('delete'); } }
      if (!(await writeText(finalTxt))) return {ok: false, step: 'text', error: 'No se pudo escribir el texto'};
    }
    if (link && !previewOk) progress('Facebook no generó la vista previa: el enlace se deja en el texto.');

    if (job.files.length) {
      progress(`Adjuntando ${job.files.length} archivo(s)…`);
      const files = job.files.map(b64ToFile);
      const before = attachedCount(d);
      const imgs = files.filter(f => f.type.startsWith('image/'));
      if (imgs.length && !files.some(f => f.type.startsWith('video/'))) {
        const dt = new DataTransfer(); imgs.forEach(f => dt.items.add(f));
        pasteInto(tb, dt);
        await waitFor(() => attachedCount(d) >= before + imgs.length, 8000);
      }
      if (attachedCount(d) < before + files.length) {
        let input = d.querySelector('input[type=file]');
        if (!input) {
          const pb = [...d.querySelectorAll('[role=button]')].filter(vis).find(b => RX.photo.test(label(b)));
          if (pb) { click(pb); input = await waitFor(() => d.querySelector('input[type=file]'), 5000); }
        }
        if (input) {
          const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
          input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
          await waitFor(() => attachedCount(d) >= before + files.length, 20000);
        }
      }
      if (attachedCount(d) < before + files.length) return {ok: false, step: 'files', error: 'No se pudieron adjuntar los archivos'};
    } else if (/https?:\/\//.test(job.text) && !link) {
      progress('Esperando la vista previa del enlace…');
      await sleep(4000);
    }

    progress('Esperando a que «Publicar» esté disponible…');
    const btn = await waitFor(() => { const b = postButton(d); return b && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 120000, 500);
    if (!btn) return {ok: false, step: 'button', error: 'El botón «Publicar» no se activó'};

    if (job.test) {
      progress('Modo prueba: revisa la ventana de Facebook. No se ha publicado nada.');
      return {ok: true, test: true};
    }

    progress('Publicando…');
    const existing = new Set([...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert],[role=status]')]);
    click(btn);
    /* Mensajes nuevos que muestre Facebook (diálogos, alertas o avisos breves), con su texto literal */
    const messages = [];
    const collect = () => {
      for (const n of document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert],[role=status]')) {
        if (existing.has(n) || n === d || n.contains(d) || !vis(n)) continue;
        const t = msgText(n);
        if (t && !messages.includes(t)) messages.push(t);
      }
    };
    let blockMsg = null;
    const closed = await waitFor(() => { collect(); blockMsg = messages.find(m => RX.block.test(m)) || alertText(existing); return blockMsg || !vis(d); }, 120000, 400);
    const t0 = Date.now();
    while (!blockMsg && Date.now() - t0 < 5000) { collect(); blockMsg = messages.find(m => RX.block.test(m)) || null; await sleep(400); }
    if (blockMsg && !messages.includes(blockMsg)) messages.unshift(blockMsg);
    const review = messages.some(m => RX.pending.test(m)) ? 'awaiting' : null;
    if (blockMsg) return {ok: false, blocked: true, step: 'publish', error: blockMsg, messages};
    const grpMsg = messages.find(m => RX.groupBlock.test(m));
    if (grpMsg && vis(d)) return {ok: false, step: 'group', error: grpMsg, messages};
    if (!closed || vis(d)) return {ok: false, step: 'publish', error: 'El cuadro de publicación no se cerró: revisa la ventana de Facebook', messages};
    return {ok: true, review, messages};
  }


  /* ---- Responder a un comentario con la cuenta activa ----
     Abre el enlace del comentario (con comment_id), lo localiza, pulsa «Responder», escribe el texto, lo envía
     con Intro y comprueba que la respuesta aparece. Ante un aviso de bloqueo de Facebook se detiene. */
  const RX_REPLY = /^(responder|reply)$/i;
  const RX_REPLY_BOX = /(responder a|reply to|escribe una respuesta|write a reply|responder como|reply as|escribe un comentario|write a comment)/i;
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  function commentIdsOf(url) {
    try { const u = new URL(url); return [u.searchParams.get('reply_comment_id'), u.searchParams.get('comment_id')].filter(Boolean); } catch { return []; }
  }
  function findComment(job) {
    const ids = commentIdsOf(job.url);
    // 1) por el identificador del comentario en sus enlaces (el más fiable)
    for (const id of ids) {
      const a = [...document.querySelectorAll('a[href*="comment_id"]')].find(x => { try { const u = new URL(x.href); return u.searchParams.get('reply_comment_id') === id || (!u.searchParams.get('reply_comment_id') && u.searchParams.get('comment_id') === id); } catch { return false; } });
      const art = a && a.closest('[role=article]');
      if (art && vis(art)) return art;
    }
    // 2) por autor y comienzo del texto
    const snip = norm(job.snippet).slice(0, 50), who = norm(job.author);
    return [...document.querySelectorAll('[role=article]')].filter(vis).find(art => {
      const t = norm(art.innerText);
      return snip && t.includes(snip) && (!who || t.includes(who) || norm(art.getAttribute('aria-label')).includes(who));
    }) || null;
  }
  /* Botón «Responder» del propio comentario (no el de una respuesta anidada) */
  const replyButtonOf = art => [...art.querySelectorAll('[role=button],a,span')].filter(vis).find(b => RX_REPLY.test(label(b)) && b.closest('[role=article]') === art);
  /* Cuadro de respuesta que aparece tras pulsar «Responder»: el más cercano por debajo del comentario */
  function replyBoxNear(art) {
    const boxes = [...document.querySelectorAll('[contenteditable=true][role=textbox],[contenteditable=true]')].filter(vis);
    const top = art.getBoundingClientRect().bottom;
    const cand = boxes.filter(b => RX_REPLY_BOX.test(b.getAttribute('aria-label') || b.getAttribute('aria-placeholder') || '') || art.parentElement?.contains(b));
    const list = (cand.length ? cand : boxes).map(b => ({ b, d: Math.abs(b.getBoundingClientRect().top - top) })).sort((x, y) => x.d - y.d);
    return list[0] ? list[0].b : null;
  }
  async function reply(job) {
    progress('Buscando el comentario…');
    const block0 = alertText(); if (block0) return {ok: false, blocked: true, step: 'load', error: block0};
    if (/\/login|checkpoint/.test(location.pathname)) return {ok: false, step: 'login', error: 'Facebook pide iniciar sesión.'};
    let art = await waitFor(() => findComment(job), 20000, 500);
    if (!art) {
      // a veces hay que desplegar «Ver más comentarios» o el hilo
      for (let i = 0; i < 4 && !art; i++) {
        const more = [...document.querySelectorAll('[role=button]')].filter(vis).find(b => /(ver m[aá]s comentarios|view more comments|ver \d+ respuestas|view \d+ repl|m[aá]s respuestas|more replies)/i.test(label(b)));
        if (!more) break;
        click(more); await sleep(1500); art = findComment(job);
      }
    }
    if (!art) return {ok: false, step: 'comment', error: 'No se encontró el comentario en la página (puede haberse borrado u ocultado).'};
    const btn = replyButtonOf(art);
    if (!btn) return {ok: false, step: 'button', error: 'El comentario no tiene botón «Responder» (¿comentarios cerrados?).'};
    progress('Abriendo el cuadro de respuesta…');
    click(btn); await sleep(900);
    const tb = await waitFor(() => replyBoxNear(art), 10000, 300);
    if (!tb) return {ok: false, step: 'composer', error: 'No se abrió el cuadro de respuesta.'};
    progress('Escribiendo la respuesta…');
    tb.focus(); await sleep(200);
    // Facebook puede rellenar «@Nombre» al abrir la respuesta: se conserva y se añade el texto después
    const pre = tb.innerText.trim();
    const t = job.text;
    document.execCommand('insertText', false, (pre && !/\s$/.test(pre) ? ' ' : '') + t); await sleep(500);
    if (!norm(tb.innerText).includes(norm(t).slice(0, 15))) { const dt = new DataTransfer(); dt.setData('text/plain', t); pasteInto(tb, dt); await sleep(600); }
    if (!norm(tb.innerText).includes(norm(t).slice(0, 15))) return {ok: false, step: 'text', error: 'No se pudo escribir la respuesta.'};
    // «Responder como Nombre» / «Reply as Name»: la cuenta (o página) con la que se publica
    const asWho = ((tb.getAttribute('aria-label') || tb.getAttribute('aria-placeholder') || '').match(/(?:responder como|reply as|comentar como|comment as)\s+(.+?)\s*$/i) || [])[1] || '';
    if (job.test) { progress('Modo prueba: la respuesta está escrita pero no se envió.'); return {ok: true, test: true}; }
    progress('Enviando…');
    const ev = {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true};
    tb.dispatchEvent(new KeyboardEvent('keydown', ev)); tb.dispatchEvent(new KeyboardEvent('keypress', ev)); tb.dispatchEvent(new KeyboardEvent('keyup', ev));
    // enviado = el cuadro se vacía (o desaparece)
    const sent = await waitFor(() => { const b = alertText(); if (b) return {blocked: b}; return !tb.isConnected || !norm(tb.innerText).includes(norm(t).slice(0, 15)) ? {ok: true} : null; }, 20000, 400);
    if (sent && sent.blocked) return {ok: false, blocked: true, step: 'publish', error: sent.blocked};
    if (!sent) return {ok: false, step: 'publish', error: 'La respuesta no se envió: revisa la ventana de Facebook.'};
    progress('Comprobando la respuesta…');
    const snip = norm(t).slice(0, 30);
    const mine = await waitFor(() => [...document.querySelectorAll('[role=article]')].reverse().find(a => a !== art && norm(a.innerText).includes(snip)), 15000, 500);
    let author = asWho, link = '';
    if (mine) {
      const l = mine.getAttribute('aria-label') || '';
      const m = l.match(/^(?:respuesta|comentario|reply|comment)\s+(?:de|by)\s+(.+?)(?:\s+(?:al comentario de|a la respuesta de|a un comentario de|a una respuesta de|en respuesta a|to)\s.*|\s+hace\s.*|\s+\d+\s+\S+\s+ago)?$/i);
      if (m) author = m[1].trim();
      else if (!author) { const a = mine.querySelector('a[role=link] span, a span'); if (a) author = a.innerText.trim(); }
      const h = [...mine.querySelectorAll('a[href*="comment_id"]')].map(a => a.href).find(x => /reply_comment_id=/.test(x)) || '';
      link = h;
    }
    return {ok: true, verified: !!mine, author, link};
  }

  /* Lectura de la miniatura de una publicación (solo lectura, para la vista previa) */
  function readMeta() {
    const m = k => (document.querySelector(`meta[property="${k}"],meta[name="${k}"]`) || {}).content || '';
    let image = m('og:image');
    if (!image) { const v = [...document.querySelectorAll('video[poster]')].find(vis); if (v) image = v.poster; }
    if (!image) {
      const imgs = [...document.querySelectorAll('[role=main] img, img')].filter(i => vis(i) && /fbcdn\.net/.test(i.src) && i.naturalWidth >= 200);
      imgs.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
      if (imgs[0]) image = imgs[0].currentSrc || imgs[0].src;
    }
    const title = m('og:title') || document.title.replace(/^\(\d+\)\s*/, '');
    return {image, title};
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (sender.id !== chrome.runtime.id || !msg) return;
    if (msg.cmd === 'meta') { send(readMeta()); return; }
    if (msg.cmd !== 'post' && msg.cmd !== 'reply') return;
    if (window.__fbpBusy) { send({ok: false, step: 'ext', error: 'Publicación en curso'}); return; }
    window.__fbpBusy = true;
    (msg.cmd === 'reply' ? reply(msg.job) : post(msg.job)).then(send, e => send({ok: false, step: 'script', error: String((e && e.message) || e)})).finally(() => { window.__fbpBusy = false; });
    return true;
  });
})();
