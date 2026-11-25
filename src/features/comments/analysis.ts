/** Estadísticas, equipo y pendientes, enfoque por IA y modelo de informe (portado de Social Comments Analyzer). */
import { dot, embed } from '@/features/ai/engine'
import { normName } from './db'
import { getPrefs } from './prefs'
import { COMMERCE_RE, ENTITY_STOP, brandIn, brandKeys, focusName, focusSubj } from './normalize'
import { norm, normL, sentiment, STOP, tokenize } from './text'
import type { Comment, Sentiment } from './types'

/* ---------- Estadísticas ---------- */
export function computeStats(list: Comment[]) {
  const authors: Record<string, { name: string; count: number; reactions: number }> = {}
  let reacts = 0, chars = 0, wordsN = 0, att = 0, q = 0, pos = 0, neg = 0, neu = 0, replies = 0
  const words: Record<string, number> = {}, emojis: Record<string, number> = {}, hashtags: Record<string, number> = {}, mentions: Record<string, number> = {}
  list.forEach((c) => {
    const k = c.authorName || '(desconocido)'
    authors[k] ||= { name: k, count: 0, reactions: 0 }
    authors[k].count++; authors[k].reactions += c.reactions
    reacts += c.reactions; chars += c.length; wordsN += c.words || 0
    if (c.attachments.length) att++
    if (c.isQuestion) q++
    if (c.type === 'reply') replies++
    c.sentiment === 'positivo' ? pos++ : c.sentiment === 'negativo' ? neg++ : neu++
    tokenize(c.text).forEach((w) => { if (w.length < 3 || STOP.has(w) || STOP.has(norm(w)) || /^\d+$/.test(w)) return; words[w] = (words[w] || 0) + 1 })
    c.emojis.forEach((e) => (emojis[e] = (emojis[e] || 0) + 1))
    c.hashtags.forEach((t) => (hashtags[t] = (hashtags[t] || 0) + 1))
    c.mentions.forEach((t) => { const m = String(t).replace(/^@/, ''); mentions[m] = (mentions[m] || 0) + 1 })
  })
  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
  return {
    total: list.length, comments: list.length - replies, replies, uniqueAuthors: Object.keys(authors).length, reacts,
    avgLen: list.length ? Math.round(chars / list.length) : 0, avgWords: list.length ? Math.round(wordsN / list.length) : 0, att, q, pos, neg, neu,
    authors: Object.values(authors).sort((a, b) => b.count - a.count || b.reactions - a.reactions),
    words: top(words, 30), emojis: top(emojis, 16), hashtags: top(hashtags, 14), mentions: top(mentions, 14),
  }
}
export type Stats = ReturnType<typeof computeStats>
export const sentOf = (list: Comment[]) => { const s = { total: list.length, pos: 0, neg: 0, neu: 0 }; list.forEach((c) => (c.sentiment === 'positivo' ? s.pos++ : c.sentiment === 'negativo' ? s.neg++ : s.neu++)); return s }

/** Actividad por día (o por hora si todo ocurre en menos de 2 días). */
export function activity(list: Comment[]) {
  const ts = list.map((c) => c.createdTs).filter((t) => !isNaN(t))
  if (!ts.length) return { buckets: [] as { label: string; n: number }[], per: 'día', approx: false, byHour: [] as number[] }
  const mn = Math.min(...ts), mx = Math.max(...ts)
  const hourly = mx - mn < 2 * 864e5
  const map = new Map<string, number>()
  const key = (t: number) => { const d = new Date(t); return hourly ? `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}h` : d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) }
  for (let t = hourly ? Math.floor(mn / 36e5) * 36e5 : new Date(new Date(mn).toDateString()).getTime(); t <= mx; t += hourly ? 36e5 : 864e5) map.set(key(t), 0)
  ts.forEach((t) => map.set(key(t), (map.get(key(t)) || 0) + 1))
  const byHour = new Array(24).fill(0)
  list.forEach((c) => { if (!isNaN(c.createdTs) && !c.dateApprox) byHour[new Date(c.createdTs).getHours()]++ })
  return { buckets: [...map].map(([label, n]) => ({ label, n })), per: hourly ? 'hora' : 'día', approx: list.some((c) => c.dateApprox), byHour }
}

/* ---------- Equipo: quién responde y qué está pendiente ---------- */
export function computeTeam(list: Comment[], postAuthor = '', about?: ((c: Comment) => boolean) | null) {
  const { team, teamPostAuthor, teamAllReplies, answered } = getPrefs()
  const K = new Set<string>()
  team.forEach((m) => { K.add(normName(m.name)); if (m.id) K.add('id:' + m.id) })
  const byId = new Map(list.map((c) => [c.id, c]))
  const pa0 = teamPostAuthor && postAuthor ? normName(postAuthor) : null
  const paOf = (c: Comment) => (teamPostAuthor && (c as Comment & { _postAuthor?: string })._postAuthor ? normName((c as Comment & { _postAuthor?: string })._postAuthor) : pa0)
  const pa = pa0 || (list.some((c) => (c as Comment & { _postAuthor?: string })._postAuthor) && teamPostAuthor ? ' ' : null)
  const rootOf = (c: Comment) => { let p = c, g = 0; while (p.parentId && byId.has(p.parentId) && g++ < 12) p = byId.get(p.parentId)!; return p }
  const teamOn = K.size > 0 || !!pa
  list.forEach((c) => {
    const n = normName(c.authorName), cpa = paOf(c)
    c.isTeam = !!n && (K.has(n) || (!!c.authorId && K.has('id:' + c.authorId)) || (!!cpa && (n === cpa || c.badges.includes('Autor de la publicación'))))
    c.teamAnswered = !!answered[c.id]
    c.root = rootOf(c).id
  })
  const order = new Map(list.map((c, i) => [c.id, i]))
  const byRoot = new Map<string, Comment[]>()
  list.forEach((c) => { const a = byRoot.get(c.root!); if (a) a.push(c); else byRoot.set(c.root!, [c]) })
  list.forEach((y) => {
    if (!y.isTeam) return
    let p = y, g = 0
    while (p.parentId && byId.has(p.parentId) && g++ < 12) { p = byId.get(p.parentId)!; p.teamAnswered = true }
    const named = new Set([y.replyTo, ...(y.mentions || [])].filter(Boolean).map(normName))
    const yt = normName(y.text)
    ;(byRoot.get(y.root!) || []).forEach((x) => {
      if (x === y || x.isTeam || order.get(x.id)! > order.get(y.id)!) return
      const xn = normName(x.authorName)
      if (xn && (named.has(xn) || yt.startsWith(xn))) x.teamAnswered = true
    })
  })
  list.forEach((c) => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined
    const cpa = paOf(c)
    const directed = !c.parentId || teamAllReplies || (parent && parent.isTeam) || [c.replyTo, ...(c.mentions || [])].some((n) => n && (K.has(normName(n)) || (cpa && normName(n) === cpa)))
    c.needsTeam = teamOn && !c.isTeam && !c.teamAnswered && !!directed && (!about || about(c))
  })
  return teamOn
}

/* ---------- Enfoque (IA): comentarios que cumplen un criterio ---------- */
export const FOCUS_TH = 0.845
const FOCUS_STOP = new Set('comentario comentarios relacionados relacionadas relacionado relacionada sobre hablan habla mencionan menciona refieren refiere todo todos todas cosas temas tema para como desde hacia entre esta este estos estas'.split(' '))
export function focusKeywords(q: string) {
  const ws = normName(q).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !FOCUS_STOP.has(w))
  return [...new Set(ws.flatMap((w) => { const b = w.replace(/\d+$/, ''); return b.length >= 4 && b !== w ? [w, b] : [w] }).flatMap((w) => [w, w.replace(/k/g, 'c').replace(/z/g, 's')]))]
}
const focusText = (c: Comment) => { const t = normName((c.text || '') + ' ' + (c.mentions || []).join(' ')).replace(/k/g, 'c').replace(/z/g, 's'); return t + ' ' + t.replace(/[\s\-_.]+/g, '') }
export const fkey = (c: Comment) => (c._ref?.postId || '') + '|' + normName((c.authorName || '') + ' ' + (c.text || '')).slice(0, 160)

export async function focusMatch(list: Comment[], q: string, onProg?: (a: number, b: number) => void) {
  const kws = focusKeywords(q), keys = new Set<string>(), items = list.filter((c) => c.text?.trim())
  if (!items.length) return keys
  const need: Comment[] = []
  items.forEach((c) => {
    if (kws.some((k) => focusText(c).includes(k))) keys.add(fkey(c))
    else if (normName(c.text).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1).length >= 5) need.push(c)
  })
  if (need.length) {
    const [qv] = await embed([focusSubj(q)], 'query')
    const vs = await embed(need.map((c) => c.text), 'passage', onProg)
    need.forEach((c, i) => { if (dot(qv, vs[i]) >= FOCUS_TH) keys.add(fkey(c)) })
  }
  const byId = new Map(list.map((c) => [c.id, c]))
  list.forEach((c) => { if (!c.isTeam && (c.teamAnswered || c.brandStance)) keys.add(fkey(c)) })
  list.forEach((c) => {
    if (c.isTeam || !c.parentId) return
    let p = c, g = 0
    while (p.parentId && byId.has(p.parentId) && g++ < 12) p = byId.get(p.parentId)!
    if (p !== c && keys.has(fkey(p))) keys.add(fkey(c))
  })
  return keys
}
export function focusFilter(list: Comment[], keys: Set<string>) {
  const hit = (c: Comment) => !c.isTeam && keys.has(fkey(c))
  const roots = new Set(list.filter(hit).map((c) => c.root || c.id))
  return list.filter((c) => hit(c) || (c.isTeam && roots.has(c.root || c.id)))
}

/* ---------- Búsqueda por significado ---------- */
export async function semanticScores(list: Comment[], q: string, onProg?: (a: number, b: number) => void) {
  const items = list.filter((c) => c.text?.trim())
  const [qv] = await embed([q], 'query')
  const vs = await embed(items.map((c) => c.text), 'passage', onProg)
  const qn = normName(q).split(/\s+/).filter((w) => w.length > 2)
  const scores = new Map<string, number>()
  items.forEach((c, i) => { let s = dot(qv, vs[i]); const t = normName(c.text); if (qn.length && qn.every((w) => t.includes(w))) s = Math.max(s, 0.99); scores.set(c.id, s) })
  return scores
}

/* ---------- Opiniones que más se repiten ---------- */
const AVOID_RE = /(^|[^\p{L}])(no (compres|compren|compro|recomiendo)|nunca mas (compro|pido|vuelvo)|no vuelvo mas)(?=$|[^\p{L}])/u
const PREFER_RE = /(^|[^\p{L}])(prefiero|preferible|me quedo con|es preferible)(?=$|[^\p{L}])/u
export function reportOpinions(list: Comment[], max = 6) {
  const jacc = (a: Set<string>, b: Set<string>) => { let i = 0; a.forEach((x) => { if (b.has(x)) i++ }); return i / Math.max(1, a.size + b.size - i) }
  type Cand = { t: string; c: Comment; toks: Set<string>; s: Sentiment }
  const pick = (minW: number) => {
    const cands: Cand[] = []
    list.forEach((c) => {
      if (c.isTeam || !c.text) return
      let raw = c.text
      ;[c.replyTo, ...(c.mentions || []), c.authorName].filter(Boolean).forEach((n) => { raw = raw.split(n!).join(' ') })
      raw.split(/(?<=[.!?…])\s+|\n+/).forEach((s0) => {
        const s = s0.replace(/\s+/g, ' ').replace(/^[\s,;:·\-–—]+/, '').trim()
        const w = s.split(' ').length
        if (w < minW || w > 40) return
        const sc = sentiment(s).score, t = normL(s)
        if (!(sc !== 0 || c.brandStance || AVOID_RE.test(t) || PREFER_RE.test(t))) return
        const toks = new Set(tokenize(s).map(norm).filter((x) => x.length > 2 && !STOP.has(x)))
        if (toks.size < 3) return
        const tone: Sentiment = c.sentimentManual || c.brandStance ? c.sentiment : sc > 0 ? 'positivo' : sc < 0 ? 'negativo' : c.sentiment
        cands.push({ t: s.charAt(0).toUpperCase() + s.slice(1), c, toks, s: tone })
      })
    })
    const groups: { items: Cand[]; cs: Set<Comment>; s: Sentiment; rep?: Cand }[] = []
    cands.forEach((x) => { const g = groups.find((g) => g.s === x.s && jacc(g.items[0].toks, x.toks) >= 0.3); if (g) { g.items.push(x); g.cs.add(x.c) } else groups.push({ items: [x], cs: new Set([x.c]), s: x.s }) })
    groups.forEach((g) => { g.rep = [...g.items].sort((a, b) => (b.c.reactions || 0) - (a.c.reactions || 0) || Math.abs(a.t.split(' ').length - 16) - Math.abs(b.t.split(' ').length - 16))[0] })
    return groups.sort((a, b) => b.cs.size - a.cs.size || (b.rep!.c.reactions || 0) - (a.rep!.c.reactions || 0))
  }
  let groups = pick(6)
  if (groups.length < 3) groups = pick(4)
  const neg = groups.filter((g) => g.s === 'negativo'), pos = groups.filter((g) => g.s === 'positivo'), neu = groups.filter((g) => g.s === 'neutral'), out: typeof groups = []
  while (out.length < max && (neg.length || pos.length || neu.length)) {
    if (neg.length) out.push(neg.shift()!)
    if (out.length < max && pos.length) out.push(pos.shift()!)
    if (!neg.length && !pos.length && neu.length && out.length < max) out.push(neu.shift()!)
  }
  return out.map((g) => ({ t: g.rep!.t, n: g.cs.size, s: g.s, a: g.rep!.c.authorName || '' }))
}

/* ---------- Posibles referencias a la competencia ---------- */
const RIVAL_NOUN = /(^|[^\p{L}])(bodegas?|tiendas?|market|mercado|supermercado|minimarket|shop|store|express|envios?|delivery|combos?|mipymes?|agencia|online|cafeteria)(?=$|[^\p{L}])/u
const PLACE_STOP = new Set('holguin cuba habana santiago oriente miami mexico espana gibara moa banes camaguey tunas granma bayamo manzanillo guantanamo florida usa dios'.split(' '))
const onlyPlaces = (n: string) => n.split(' ').filter((w) => !/^(de|del|la|el|los|las|y)$/.test(w)).every((w) => PLACE_STOP.has(w))
const COMPARE_RE = /(^|[^\p{L}])(mejor|mejores|lo mejor|mas barat[oa]s?|mas rapid[oa]s?|mas competitiv[oa]s?|prefiero|preferible|bajando|en cambio|que en|igual que|como en)(?=$|[^\p{L}])/u
function rivalNames(c: Comment, keys: string[]): [string, string][] {
  if (!c.text || c.isTeam) return []
  let raw = c.text
  ;[c.replyTo, ...(c.mentions || []), c.authorName].filter(Boolean).forEach((n) => { raw = raw.split(n!).join(' · ') })
  const t = normL(raw), ctx = COMMERCE_RE.test(t), cmp = COMPARE_RE.test(t) || c.brandStance
  if (brandIn(t, keys) && !c.brandStance && !/(^|[^\p{L}])(prefiero|mejor que|mas barat[oa] que|en cambio)(?=$|[^\p{L}])/u.test(t)) return []
  const out: [string, string][] = []
  const ok = (name: string) => { const n = normL(name).replace(/^(en |a )?(la|el|los|las) /, ''); return n.length >= 3 && !brandIn(n, keys) && !onlyPlaces(n) && !ENTITY_STOP.has(n) && n }
  ;(raw.match(/[A-ZÁÉÍÓÚÑ][\p{L}\d]+(?:\s+(?:del|de|la|el|los|las|y|&)?\s*[A-ZÁÉÍÓÚÑ0-9][\p{L}\d]*)*/gu) || []).forEach((e0) => {
    let words = e0.trim().split(/\s+/)
    while (words.length > 1 && !/^(la|el|los|las)$/i.test(words[0]) && (ENTITY_STOP.has(normL(words[0])) || /^(en|a|por|con|para|desde|hasta|lo|es|y)$/i.test(words[0]))) words = words.slice(1)
    const e = words.join(' ')
    if (words.length === 1 && e === e.toUpperCase()) return
    const core = words.filter((w) => !/^(la|el|los|las|del|de|y|&)$/i.test(w))
    const generic = core.length === 1 && RIVAL_NOUN.test(normL(core[0]))
    const noun = !generic && RIVAL_NOUN.test(normL(e))
    if (noun || (core.length >= 2 && ctx && cmp)) { const n = ok(e); if (n) out.push([n, e.replace(/^(En |A )?(la|el|La|El) (?=\S)/, (m) => m.replace(/^(En |A )/, ''))]) }
  })
  if (ctx && cmp) (raw.match(/(?:^|[^\p{L}])(?:la|el)\s+(bodega|tienda|mipyme|agencia|cafeter[ií]a|supermercado)(?:\s+(?:de|del)\s+[\p{L}]+)?/giu) || []).forEach((e) => { const n = ok(e.trim()); if (n) out.push([n, e.trim()]) })
  ;(raw.match(/\b(?:https?:\/\/)?(?:www\.)?([\w-]+\.(?:com|net|org|cu|shop|store))\b/gi) || []).forEach((e) => { const d = e.replace(/^https?:\/\/(www\.)?|^www\./i, ''); const n = ok(d); if (n) out.push([n, d]) })
  const seen = new Set<string>()
  return out.filter(([n]) => !seen.has(n) && !!seen.add(n))
}
export function detectRivals(list: Comment[]) {
  const keys = brandKeys()
  if (!keys.length) return []
  const g = new Map<string, { key: string; name: string; items: Comment[] }>()
  list.forEach((c) => rivalNames(c, keys).forEach(([n, label]) => { const r = g.get(n) || { key: n, name: label, items: [] }; if (!r.items.includes(c)) r.items.push(c); if (label.length > r.name.length && /[A-ZÁÉÍÓÚÑ]/.test(label)) r.name = label; g.set(n, r) }))
  const all = [...g.values()]
  all.forEach((a) => {
    const big = all.find((b) => b !== a && g.has(b.key) && new RegExp('(^|\\s)' + a.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(b.key))
    if (big && g.has(a.key)) { a.items.forEach((c) => { if (!big.items.includes(c)) big.items.push(c) }); g.delete(a.key) }
  })
  return [...g.values()].map((r) => ({ name: r.name.charAt(0).toUpperCase() + r.name.slice(1), n: r.items.length, neg: r.items.filter((c) => c.sentiment === 'negativo').length, sample: [...r.items].sort((a, b) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length)[0] }))
    .sort((a, b) => b.n - a.n || b.neg - a.neg).slice(0, 8)
}

export { focusName, focusSubj }
