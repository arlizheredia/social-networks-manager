/** Normalización de comentarios: jerarquía, menciones, sentimiento, postura de marca y acuerdo (portado fielmente). */
import { getPrefs, setPrefs } from './prefs'
import { detectPlatform, EMOJI_RE, norm, normL, parseFbDate, PLATFORMS, sentiment, tokenize } from './text'
import type { Comment, Meta, Parsed, Platform, RawComment, Sentiment } from './types'

const isOpaqueId = (s: string) => /^MS4wLj/.test(s) || (/^[A-Za-z0-9_-]{24,}$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s))

/* ---------- Tema del informe (también define la marca propia) ---------- */
export function focusSubj(q: string) {
  const t = String(q || '').trim()
  const s = t.replace(/^(los\s+)?(comentarios|mensajes|opiniones)\s+(que\s+(hablan|tratan)\s+(de|sobre)|sobre|de|acerca\s+de|relacionad[oa]s\s+con|referentes\s+a)\s+/i, '')
    .replace(/\s*[,;]?\s+(y|e|o)\s+(los\s+|otros\s+|todos\s+los\s+)?(comentarios|temas|mensajes|asuntos)\s+(relacionad[oa]s|similares|afines|parecidos)(\s+con\s+[^,;.]{1,40})?$/i, '')
    .replace(/\s+(y|e)\s+(todo\s+)?lo\s+relacionado(\s+con\s+[^,;.]{1,40})?$/i, '').replace(/[.\s]+$/, '').trim()
  return s || t
}
export const focusName = (q: string) => { const s = focusSubj(q); return s.split(/\s+/).length > 3 ? `«${s}»` : s }

export function brandKeys(withFocus = true) {
  const r = getPrefs().report
  const ks = new Set<string>()
  ;[withFocus ? r.focus || 'Kanasta24' : '', r.client || 'Kanasta24', r.terms || ''].join(',').split(/[,;]/).forEach((s) => {
    normL(focusSubj(s)).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !/^(comentarios?|relacionad[oa]s?|marca|sobre)$/.test(w))
      .forEach((w) => { ks.add(w); ks.add(w.replace(/\d+$/, '')); ks.add(w.replace(/k/g, 'c')) })
  })
  return [...ks].filter((k) => k.length >= 4)
}
export function brandIn(t: string, keys: string[]) {
  const x = t.replace(/k/g, 'c'), y = x.replace(/[\s\-_.]+/g, '')
  return keys.some((k) => { const kc = k.replace(/k/g, 'c'); return x.includes(kc) || y.includes(kc) })
}

/* ---------- Postura frente a la marca ---------- */
const AVOID_RE = /(^|[^\p{L}])(no (compres|compren|compro|comprare|compraria|pidas|pidan|recomiendo|lo recomiendo|la recomiendo|los recomiendo|vuelvo a (comprar|pedir))|nunca mas (compro|pido|vuelvo)|no vuelvo mas|ni se les ocurra|no se los recomiendo|eviten comprar|me cambie a|me pase a|mejor (compren|compra|pidan|pide) en)(?=$|[^\p{L}])/u
const PREFER_RE = /(^|[^\p{L}])(prefiero|preferible|me quedo con|es preferible)(?=$|[^\p{L}])/u
const PRAISE_OTHER_RE = /(^|[^\p{L}])(menos de \d+ horas|en (menos de )?\d+ horas|productos de calidad|es lo mejor|lo mejor|mejor calidad|mejores precios|mucho mejor|es mejor|son mejores|mas barat[oa]s?|mas competitiv[oa]s?|bajando (todos )?(sus |los )?precios|mas rapid[oa]s?|mas economic[oa]s?|muy superior)(?=$|[^\p{L}])/u
/** Cuenta que compra o recibe en otro sitio: «me envían todo con…», «yo compro en…», «siempre pido a…». */
const USE_OTHER_RE = /(^|[^\p{L}])(me (envian|traen|mandan|entregan|llevan|resuelven)|(yo |siempre |ahora )?(compro|pido|encargo) (en|con|a|por)|les? compro|me (llega|llegan) (todo )?(con|por|de)|yo uso|uso (la|el) (app|aplicacion|pagina|tienda))(?=$|[^\p{L}])/u
/**
 * Referencias implícitas a la tienda de la publicación: hablan de ella sin nombrarla, en tercera persona del plural
 * («los cobran», «son los que tienen el precio más caro», «enviaba por ahí») o dirigiéndose a ella («ustedes», «su servicio»).
 */
const IMPLICIT_RE = /(^|[^\p{L}])(cobran|cobraron|venden|vendieron|tienen|tenian|envian|enviaron|entregan|entregaron|mandan|mandaron|demoran|tardan|tardaron|ponen|piden|estan cobrando|son (los|las) (que|mas)|(los|las) (mas|unicos|unicas) (car[oa]s|barat[oa]s|rapid[oa]s|lent[oa]s)|ustedes|con ellos|a ellos|por ahi|por aqui|por aca|aqui|aca|esta (tienda|pagina|empresa|agencia|plataforma)|este (negocio|sitio|servicio|lugar)|la pagina|su (servicio|precio|atencion|pagina|tienda|envio|entrega|trabajo)|sus (precios|envios|entregas|combos|productos|servicios|ofertas))(?=$|[^\p{L}])/u
/** Trato directo a la tienda que expresa opinión aunque no hable de compras («ustedes son los mejores», «sigan así»). */
const DIRECT_RE = /(^|[^\p{L}])(ustedes son|gracias a ustedes|los felicito|las felicito|sigan asi|sigan adelante|su (servicio|atencion|trabajo) (es|fue))(?=$|[^\p{L}])/u
const BIZ_RE = /(^|[^\p{L}])(cobr\w*|pag\w*|atencion|demora\w*|tard\w*|llega\w*|envi\w*|vend\w*|compr\w*)(?=$|[^\p{L}])/u
/** ¿Habla de la marca sin nombrarla? (no se aplica a comentarios en páginas de la competencia) */
export function talksAboutBrand(text: string, opts: { rivalPage?: boolean } = {}) {
  if (opts.rivalPage) return false
  const t = normL(text)
  if (DIRECT_RE.test(t)) return true
  return IMPLICIT_RE.test(t) && (COMMERCE_RE.test(t) || BIZ_RE.test(t))
}
export const COMMERCE_RE = /(^|[^\p{L}])(precios?|barat[oa]s?|car[oa]s?|calidad|entregas?|entregar|envios?|enviar|pedidos?|compras?|comprar|tiendas?|bodegas?|servicio|ofertas?|combos?|horas|domicilio|competitiv[oa]s?|economic[oa]s?|productos?|mercado)(?=$|[^\p{L}])/u
export const ENTITY_STOP = new Set('la el los las lo es pues hola mira yo tu mi su ademas pero y o que si no ya me te le hoy ahi aqui eso esto este esta muy mas bueno gracias buenas buenos dias senor senora'.split(' '))

function brandStance(list: Comment[]) {
  const keys = brandKeys()
  if (!keys.length) return
  list.forEach((c) => {
    if (!c.text) return
    let t = normL(c.text)
    const people = [c.replyTo, ...(c.mentions || []), c.authorName].filter(Boolean).map(normL)
    people.forEach((n) => { if (n) t = t.split(n).join(' ') })
    const brand = brandIn(t, keys)
    // en una página de la competencia, las referencias implícitas son a esa tienda, no a la marca
    const pa = String((c as Comment & { _postAuthor?: string })._postAuthor || '').trim()
    if (!brand && talksAboutBrand(c.text, { rivalPage: !!pa && !brandIn(normL(pa), keys) })) c.aboutBrand = true
    let why = ''
    if (AVOID_RE.test(t)) why = 'recomienda no comprar'
    else if (PREFER_RE.test(t) && !brand && COMMERCE_RE.test(t)) why = 'prefiere otra opción'
    else if ((PRAISE_OTHER_RE.test(t) || USE_OTHER_RE.test(t)) && !brand && COMMERCE_RE.test(t)) {
      let raw = c.text
      ;[c.replyTo, ...(c.mentions || []), c.authorName].filter(Boolean).forEach((n) => { raw = raw.split(n!).join(' · ') })
      const ents = (raw.match(/[A-ZÁÉÍÓÚÑ][\p{L}\d]+(?:\s+(?:del|de|la|el|los|las|y)?\s*[A-ZÁÉÍÓÚÑ][\p{L}\d]+)*/gu) || [])
        .map((e) => e.trim().replace(/^(Pues|Mira|Yo|Hola|Bueno|Ahora|Siempre)\s+/, '')).filter((e) => { const w = normL(e).split(' '); return !(w.length === 1 && (ENTITY_STOP.has(w[0]) || e === e.toUpperCase())) && !brandIn(normL(e), keys) })
      if (ents.length) why = (PRAISE_OTHER_RE.test(t) ? 'elogia a otra marca (' : 'compra en la competencia (') + ents[0] + ')'
    }
    if (!why) return
    c.sentimentOwn = c.sentimentScore
    c.sentimentScore = Math.min(-1, c.sentimentScore < 0 ? c.sentimentScore : -c.sentimentScore || -1)
    c.sentiment = 'negativo'; c.sentimentFrom = why; c.brandStance = true
  })
}

/* ---------- Acuerdo / desacuerdo: toma (o invierte) la polaridad del comentario al que responde ---------- */
const AGREE_RE = /(^|[^\p{L}])(concuerdo|coincido|de acuerdo|tienes?( toda la)? razon|tienen( toda la)? razon|exacto|exactamente|asi mismo|asimismo|a mi tambien|a mi igual|no eres (la|el) (sola|solo|unica|unico)|no (eres|son) (los|las) (unic[oa]s|sol[oa]s)|igual que tu|igual me paso|me paso (lo mismo|igual|exactamente)|lo mismo (digo|me paso|pienso)|pienso (igual|lo mismo)|totalmente|muy cierto|es cierto|eso mismo|tal cual|ni mas ni menos|asi es|same|agree|so true)(?=$|[^\p{L}])|(^|\s)(\+1|x2)(?=$|\s)/u
const DISAGREE_RE = /(^|[^\p{L}])(no (estoy|estamos|esta) de acuerdo|en desacuerdo|discrepo|no coincido|no concuerdo|no (tienes?|tienen) razon|eso es mentira|es falso|disagree)(?=$|[^\p{L}])/u
function inheritAgreement(list: Comment[], byId: Map<string, Comment>) {
  const rootOf = (c: Comment) => { let p = c, g = 0; while (p.parentId && byId.has(p.parentId) && g++ < 10) p = byId.get(p.parentId)!; return p.id }
  list.forEach((c, i) => {
    if (!c.parentId && !c.mentions.length) return
    let t = norm(c.text.toLowerCase())
    ;[c.replyTo, ...c.mentions].filter(Boolean).forEach((n) => { const nn = norm(String(n).toLowerCase()); if (t.startsWith(nn)) t = t.slice(nn.length) })
    const dis = DISAGREE_RE.test(t), agr = !dis && AGREE_RE.test(t)
    if (!dis && !agr) return
    const names = new Set([c.replyTo, ...c.mentions].filter(Boolean).map((n) => norm(String(n).toLowerCase())))
    const root = rootOf(c)
    let target: Comment | null = null
    for (let j = i - 1; j >= 0; j--) { const o = list[j]; if (names.has(norm(String(o.authorName).toLowerCase())) && rootOf(o) === root) { target = o; break } }
    if (!target && c.parentId && byId.has(c.parentId)) target = byId.get(c.parentId)!
    if (!target || !target.sentimentScore || c.brandStance || c.sentimentManual) return
    c.sentimentOwn = c.sentimentScore
    const sign = (agr ? 1 : -1) * Math.sign(target.sentimentScore)
    c.sentimentScore = sign * Math.max(1, Math.abs(c.sentimentScore), Math.abs(target.sentimentScore))
    c.sentiment = sign > 0 ? 'positivo' : 'negativo'
    c.sentimentFrom = `${agr ? 'acuerdo' : 'desacuerdo'} con ${target.authorName || 'el comentario anterior'}`
  })
}

/* ---------- Polaridad cambiada a mano ---------- */
export const sentKey = (c: Pick<Comment, 'id' | 'authorName' | 'text'>) => {
  const id = String(c.id || '')
  return id && !/^(local-|[rs]\d+$|x-)/.test(id) ? 'id:' + id : 'tx:' + normL((c.authorName || '') + ' ' + (c.text || '')).slice(0, 160)
}
export function setSentOverride(c: Comment, v: Sentiment | null) {
  const m = { ...getPrefs().sentOverrides }, k = sentKey(c)
  if (v) m[k] = v
  else delete m[k]
  setPrefs({ sentOverrides: m })
}
function applySentOverrides(list: Comment[]) {
  const m = getPrefs().sentOverrides
  list.forEach((c) => {
    const v = m[sentKey(c)]
    if (!v) return
    c.sentimentAuto = c.sentiment; c.sentiment = v; c.sentimentScore = v === 'positivo' ? 2 : v === 'negativo' ? -2 : 0
    c.sentimentManual = true; c.sentimentFrom = 'cambiado a mano'
  })
}
const SENT_TMP = ['sentimentFrom', 'sentimentOwn', 'brandStance', 'aboutBrand', 'sentimentManual', 'sentimentAuto'] as const
export function rescoreSentiment(list: Comment[]) {
  list.forEach((c) => { const s = sentiment(c.text || ''); c.sentiment = s.label; c.sentimentScore = s.score; SENT_TMP.forEach((k) => delete c[k]) })
  brandStance(list); applySentOverrides(list); inheritAgreement(list, new Map(list.map((c) => [c.id, c])))
}

/** Prepara la lista: índices, jerarquía, menciones, emojis, sentimiento y fechas. */
export function finalize(raw: RawComment[], meta: Meta): Comment[] {
  const list = raw as unknown as Comment[]
  const byId = new Map<string, Comment>()
  list.forEach((c, i) => {
    c.idx = i + 1
    c.id = String(c.id || 'local-' + (i + 1))
    c.parentId = c.parentId ? String(c.parentId) : ''
    if (meta.postId && c.parentId === meta.postId) c.parentId = ''
    c.text = c.text || ''; c.authorName = c.authorName || ''
    c.reactions = +c.reactions || 0
    c.attachments = c.attachments || []; c.mentions = c.mentions || []; c.badges = c.badges || []
    c.platform = c.platform || meta.platform || 'facebook'
    byId.set(c.id, c)
  })
  const kids: Record<string, number> = {}
  list.forEach((c) => { if (c.parentId) kids[c.parentId] = (kids[c.parentId] || 0) + 1 })
  list.forEach((c) => {
    c.type = c.parentId ? 'reply' : 'comment'
    c.depth = 0
    let p = c, guard = 0
    while (p.parentId && byId.has(p.parentId) && guard++ < 10) { c.depth++; p = byId.get(p.parentId)! }
    if (c.parentId && !byId.has(c.parentId)) c.depth = 1
    if (c.parentId && !c.replyTo && byId.has(c.parentId)) c.replyTo = byId.get(c.parentId)!.authorName
    c.repliesCount = Math.max(+c.repliesCount || 0, kids[c.id] || 0)
    c.length = [...c.text].length
    c.words = tokenize(c.text).length
    c.hashtags = c.text.match(/#[\p{L}\p{N}_]+/gu) || []
    const fromText = c.platform === 'tiktok' ? [] : c.text.match(/@[\p{L}\p{N}_.]{2,}/gu) || []
    const seenM = new Set<string>()
    c.mentions = [...c.mentions, ...fromText].map((m) => String(m).replace(/^@/, '').trim())
      .filter((m) => m.length >= 2 && !isOpaqueId(m) && !seenM.has(m.toLowerCase()) && !!seenM.add(m.toLowerCase()))
    c.emojis = c.text.match(EMOJI_RE) || []
    c.isQuestion = /[?¿]/.test(c.text)
    c.urls = c.text.match(/https?:\/\/\S+/g) || []
    const s = sentiment(c.text); c.sentiment = s.label; c.sentimentScore = s.score
    c.createdTs = c.createdAt ? Date.parse(c.createdAt) : NaN
    c.dateText = c.dateText ?? ''
    c.dateApprox = !!c.dateApprox
    c.source = c.source || 'importado'
  })
  brandStance(list)
  applySentOverrides(list)
  inheritAgreement(list, byId)
  return list
}

/* ---------- Jerarquía de los datos del extractor ---------- */
function inferHierarchy(list: RawComment[]) {
  const ids = new Set(list.map((c) => String(c.id)))
  const ind = list.map((c) => c.indent).filter((v): v is number => typeof v === 'number' && isFinite(v))
  let levels: number[] | null = null
  if (ind.length === list.length && new Set(ind).size > 1) {
    levels = []
    ;[...new Set(ind)].sort((a, b) => a - b).forEach((v) => { if (!levels!.length || v - levels![levels!.length - 1] > 8) levels!.push(v) })
  }
  const levelOf = (c: RawComment) => {
    if (levels) { let l = 0; levels.forEach((v, i) => { if ((c.indent as number) >= v - 8) l = i }); return l }
    return c.isReply || c.parentId ? 1 : 0
  }
  const stack: RawComment[] = []
  list.forEach((c) => {
    let lvl = Math.min(levelOf(c), stack.length)
    const explicit = c.parentId && ids.has(String(c.parentId)) && String(c.parentId) !== String(c.id)
    if (explicit) { const pi = stack.findIndex((s) => String(s.id) === String(c.parentId)); if (pi >= 0) lvl = pi + 1 }
    else c.parentId = lvl > 0 ? String(stack[lvl - 1].id) : ''
    stack.length = lvl; stack[lvl] = c
  })
  return list
}

function labelAuthor(label: unknown) {
  if (!label) return ''
  const l = String(label)
  let s = l.replace(/^(comentario|respuesta|comment|reply|réponse|commentaire|comentário|resposta|kommentar|antwort|commento|risposta)\s+(de|by|par|von|di|do|da)\s+/i, '')
  if (s === l) return ''
  s = s.replace(/\s+(hace|il y a|há|vor)\s+.*$/i, '').replace(/\s+\d+\s+\S+\s+ago$/i, '').replace(/\s+(just now|ahora|now)$/i, '')
  s = s.replace(/\s+(al comentario de|a la respuesta de|a una respuesta de|a un comentario de|en respuesta a|to|au commentaire de|à|ao comentário de|à resposta de|auf|al commento di)\s+.*$/i, '')
  return s.trim()
}
function profileFromUrl(href: unknown) {
  try {
    const u = new URL(String(href))
    if (/profile\.php/.test(u.pathname)) return u.origin + u.pathname + '?id=' + (u.searchParams.get('id') || '')
    if (/\/(posts|permalink|photo|videos|reel|watch|story\.php|groups\/[^/]+\/posts)/.test(u.pathname)) return ''
    return u.origin + u.pathname.replace(/\/$/, '')
  } catch { return '' }
}
/** Repara JSON de versiones antiguas del extractor que tomaban la mención inicial como autor. */
function repairExtractorAuthor(c: RawComment) {
  const la = labelAuthor(c.ariaLabel)
  if (!la) return
  const cur = normL(c.authorName), want = normL(la)
  if (cur && (cur === want || want.startsWith(cur + ' '))) return
  const wrong = c.authorName
  if (c.dateText && normL(c.dateText) === want) { c.authorUrl = profileFromUrl(c.permalink); c.authorId = (c.authorUrl.match(/id=(\d+)/) || [])[1] || ''; c.dateText = String(c.labelDate || '') }
  else { c.authorUrl = ''; c.authorId = '' }
  c.authorName = la
  if (wrong) { c.mentions = Array.from(new Set([...(c.mentions || []), wrong])); if (c.isReply && !c.replyTo) c.replyTo = wrong }
}

type Obj = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function fromExtractor(obj: Obj): Parsed {
  const base = obj.extractedAt
  const platform: Platform = PLATFORMS[obj.platform as Platform] ? obj.platform : 'facebook'
  const raw: RawComment[] = (obj.comments || []).map((c: Obj, i: number) => ({ ...c, order: c.order ?? i })).sort((a: Obj, b: Obj) => a.order - b.order)
  raw.forEach((c, i) => { if (!c.id) c.id = 'x-' + (i + 1); if (platform === 'facebook') repairExtractorAuthor(c) })
  inferHierarchy(raw)
  const caption = String(obj.postCaption || '').replace(/\s+/g, ' ').trim()
  const author = obj.postAuthor ? (platform !== 'facebook' ? '@' + String(obj.postAuthor).replace(/^@/, '') : obj.postAuthor) : ''
  const exact = (c: Obj) => (c.datetime && !isNaN(Date.parse(c.datetime)) ? new Date(c.datetime).toISOString() : null)
  return {
    meta: { url: obj.url, title: caption ? caption.slice(0, 160) : obj.title, postAuthor: author, postDate: obj.postDate || '', extractedAt: obj.extractedAt, source: 'Extractor de navegador', platform, netTotal: +obj.total || 0, order: obj.order || null, diag: obj.diag || null },
    comments: raw.map((c: Obj) => ({
      id: c.id, parentId: c.parentId, authorName: c.authorName, authorId: c.authorId, authorUrl: c.authorUrl, authorAvatar: c.authorAvatar,
      badges: c.badges, text: c.text, createdAt: exact(c) || parseFbDate(c.dateText, base) || parseFbDate(c.labelDate, base), dateText: c.dateText, dateApprox: !exact(c),
      reactions: c.reactions, likes: null, attachments: c.attachments, mentions: c.mentions, replyTo: c.replyTo, edited: c.edited, permalink: c.permalink, source: 'extractor', platform,
    })),
  }
}

const KEYMAP = {
  id: ['id', 'comment_id', 'commentid', 'id_comentario'],
  parentId: ['parentid', 'parent_id', 'parent', 'reply_to_id', 'id_padre'],
  authorName: ['authorname', 'author', 'autor', 'name', 'nombre', 'user', 'usuario', 'username', 'from', 'profilename', 'profile_name'],
  authorUrl: ['authorurl', 'author_url', 'profileurl', 'profile_url', 'url_autor', 'perfilautor', 'profilelink'],
  authorId: ['authorid', 'author_id', 'userid', 'user_id', 'profileid', 'idautor'],
  text: ['text', 'texto', 'message', 'mensaje', 'comment', 'comentario', 'content', 'body', 'commenttext'],
  createdAt: ['createdat', 'created_at', 'created_time', 'fechaiso', 'fecha_iso', 'date', 'fecha', 'timestamp', 'time', 'datetime'],
  reactions: ['reactions', 'reacciones', 'likes', 'like_count', 'likescount', 'reactioncount', 'reactionscount', 'me_gusta'],
  repliesCount: ['repliescount', 'replies', 'comment_count', 'respuestas', 'replycount'],
  permalink: ['permalink', 'link', 'url', 'enlace', 'commenturl', 'comment_url'],
}
export const KNOWN_COLUMNS = KEYMAP

function fromGeneric(arr: Obj[]): Parsed {
  const pick = (o: Obj, keys: string[]) => {
    const lk = Object.keys(o).reduce<Obj>((m, k) => ((m[k.toLowerCase().replace(/[\s_-]/g, '')] = o[k]), m), {})
    for (const k of keys) { const v = lk[k.replace(/[\s_-]/g, '')]; if (v != null && v !== '') return v }
    return ''
  }
  return {
    meta: { source: 'Archivo importado' },
    comments: arr.map((o) => {
      let author = pick(o, KEYMAP.authorName); if (typeof author === 'object') author = author?.name || ''
      let parent = pick(o, KEYMAP.parentId); if (typeof parent === 'object') parent = parent?.id || ''
      const date = pick(o, KEYMAP.createdAt)
      let iso: string | null = null
      if (date !== '') iso = typeof date === 'number' ? new Date(date < 1e12 ? date * 1000 : date).toISOString() : parseFbDate(String(date))
      const pf = String(pick(o, ['platform', 'plataforma', 'red', 'network']))
      return {
        id: pick(o, KEYMAP.id), parentId: parent, authorName: String(author), authorUrl: pick(o, KEYMAP.authorUrl), authorId: pick(o, KEYMAP.authorId),
        text: String(pick(o, KEYMAP.text)), createdAt: iso, dateText: String(date), dateApprox: false, reactions: +pick(o, KEYMAP.reactions) || 0,
        repliesCount: +pick(o, KEYMAP.repliesCount) || 0, permalink: pick(o, KEYMAP.permalink), source: 'importado',
        platform: /tik/i.test(pf) ? 'tiktok' : /insta/i.test(pf) ? 'instagram' : detectPlatform(pick(o, KEYMAP.permalink) + ' ' + pick(o, KEYMAP.authorUrl)) || 'facebook',
      }
    }),
  }
}

export function parseCSV(text: string): Obj[] {
  const first = text.split('\n')[0]
  const d = first.includes('\t') ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += ch }
    else if (ch === '"') q = true
    else if (ch === d) { row.push(f); f = '' }
    else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = '' }
    else if (ch !== '\r') f += ch
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, '').trim())
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const isIgGraphItem = (x: Obj) => x && typeof x === 'object' && 'timestamp' in x && ('text' in x || 'username' in x)
function flattenIg(list: Obj[]) { const out: Obj[] = []; (list || []).forEach((c) => { out.push(c); (c.replies?.data || []).forEach((r: Obj) => out.push({ ...r, parent_id: c.id })) }); return out }
function fromInstagramGraph(items: Obj[]): Parsed {
  return {
    meta: { source: 'API de Instagram', platform: 'instagram' },
    comments: items.map((c) => {
      const user = c.username || c.from?.username || ''
      return { id: c.id, parentId: c.parent_id || '', authorName: user, authorId: c.from?.id || '', authorUrl: user ? 'https://www.instagram.com/' + user + '/' : '', text: c.text || '', createdAt: c.timestamp ? new Date(c.timestamp).toISOString() : null, dateText: c.timestamp || '', dateApprox: false, reactions: c.like_count || 0, likes: c.like_count ?? null, repliesCount: c.replies?.data?.length || 0, hidden: !!c.hidden, source: 'graph-instagram', platform: 'instagram' as Platform }
    }),
  }
}
function fromGraph(items: Obj[]): Parsed {
  return {
    meta: { source: 'Graph API' },
    comments: items.map((c) => ({
      id: c.id, parentId: c.parent?.id || '', authorName: c.from?.name || '', authorId: c.from?.id || '', authorUrl: c.from?.id ? 'https://www.facebook.com/' + c.from.id : '', authorAvatar: c.from?.picture?.data?.url || '',
      text: c.message || '', createdAt: c.created_time ? new Date(c.created_time).toISOString() : null, dateText: c.created_time || '', dateApprox: false,
      reactions: c.reactions?.summary?.total_count ?? c.like_count ?? 0, likes: c.like_count ?? null, repliesCount: c.comment_count || 0,
      attachments: c.attachment ? [{ type: c.attachment.type || 'adjunto', url: c.attachment.media?.image?.src || c.attachment.url || '', title: c.attachment.title || '' }] : [],
      mentions: (c.message_tags || []).map((t: Obj) => t.name), hidden: !!c.is_hidden, permalink: c.permalink_url || '', source: 'graph',
    })),
  }
}

/** Reconoce el resultado del extractor, exportaciones propias, Graph API, JSON genérico o CSV. */
export function parseAny(input: string): Parsed {
  const raw = (input || '').trim()
  if (!raw) throw new Error('No hay datos para analizar. Pega el contenido o elige un archivo.')
  if (raw[0] === '{' || raw[0] === '[') {
    let obj: Obj
    try { obj = JSON.parse(raw) } catch (e) { throw new Error('El JSON no es válido: ' + (e as Error).message) }
    if (obj && (obj.source === 'fb-dom-extractor' || obj.source === 'social-dom-extractor')) return fromExtractor(obj)
    if (obj && ['fb-comments-analyzer', 'social-comments-analyzer', 'social-networks-manager'].includes(obj.app)) return { meta: obj.meta || {}, comments: obj.comments.map((c: Obj) => ({ ...c })) }
    if (obj && Array.isArray(obj.data) && obj.data.length && isIgGraphItem(obj.data[0])) return fromInstagramGraph(flattenIg(obj.data))
    if (obj && Array.isArray(obj.data) && obj.data.length && ('created_time' in obj.data[0] || 'message' in obj.data[0])) return fromGraph(obj.data)
    const arr = Array.isArray(obj) ? obj : obj.comments || obj.data || obj.items || obj.results
    if (!Array.isArray(arr)) throw new Error('No se encontró una lista de comentarios en el JSON.')
    if (arr.length && 'created_time' in arr[0]) return fromGraph(arr)
    if (arr.length && isIgGraphItem(arr[0])) return fromInstagramGraph(flattenIg(arr))
    return fromGeneric(arr)
  }
  return fromGeneric(parseCSV(raw))
}

/** Convierte datos importados en la lista lista para analizar. */
export function prepare(parsed: Parsed): { meta: Meta; comments: Comment[] } {
  if (!parsed.comments.length) throw new Error('No se encontraron comentarios. Asegúrate de que la sección de comentarios esté abierta antes de ejecutar el extractor.')
  const meta = { ...parsed.meta }
  const comments = finalize(parsed.comments.map((c) => ({ ...c })), meta)
  if (!meta.platform) {
    const n: Record<string, number> = {}
    comments.forEach((c) => (n[c.platform] = (n[c.platform] || 0) + 1))
    meta.platform = (Object.keys(n).sort((a, b) => n[b] - n[a])[0] || 'facebook') as Platform
  }
  return { meta, comments }
}
