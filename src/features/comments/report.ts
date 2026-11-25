/** Informe de comentarios a partir de seguimientos del historial o de los comentarios abiertos. */
import { DB, normName, postLabel } from './db'
import { finalize } from './normalize'
import { getPrefs } from './prefs'
import { useTR } from './tracking'
import { computeStats, computeTeam, detectRivals, focusFilter, focusMatch, focusName, focusSubj, reportOpinions, sentOf, type Stats } from './analysis'
import type { Comment, Platform, RawComment } from './types'
import type { Tracking } from './db'

const fmtN = (n: number) => (n ?? 0).toLocaleString('es')
export const countTxt = (n: number, one: string, many: string) => `${fmtN(n)} ${n === 1 ? one : many}`
const fmtDay = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export interface Snapshot { list: Comment[]; st: Stats; s: ReturnType<typeof sentOf>; authorsN: number }
export interface CmpRow { k: string; a: number | null; b: number | null; good: 'up' | 'down'; D: string; tone: '' | 'up' | 'down' }
export interface ReportModel {
  title: string
  focus: { q: string; name: string; total: number } | null
  author: string
  client: string
  terms: string[]
  generatedAt: string
  period: string
  tracks: Pick<Tracking, 'id' | 'name' | 'date'>[]
  cur: Snapshot
  prev: Snapshot | null
  prevName: string
  cmp: CmpRow[]
  teamOn: boolean
  pending: number
  answered: number
  posts: { id: string; label: string; url: string; platform: Platform; total: number; pos: number; neg: number; negPct: number }[]
  evolution: { name: string; date: string; total: number; pos: number; neg: number }[]
  topAuthors: { name: string; count: number }[]
  fans: [string, number][]
  critics: [string, number][]
  opinions: ReturnType<typeof reportOpinions>
  rivals: ReturnType<typeof detectRivals>
  highlightsPos: Comment[]
  highlightsNeg: Comment[]
  questions: Comment[]
  summary: string[]
  conclusions: string[]
  recommendations: string[]
}

/** Comentarios de varios seguimientos, sin duplicar los de una misma publicación. */
export async function gather(tids: string[]) {
  const { tracks, posts } = useTR.getState()
  const out = new Map<string, RawComment>(), plat: Record<string, number> = {}
  const ts = tids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Tracking => !!t).sort((a, b) => a.date.localeCompare(b.date))
  for (const t of ts) {
    for (const r of await DB.resultsOf(t.id)) {
      const p = posts.find((x) => x.id === r.postId)
      ;(r.comments || []).forEach((c) => {
        const k = r.postId + '|' + (c.id && !/^(x|local)-/.test(String(c.id)) ? c.id : normName((c.authorName || '') + ' ' + (c.text || '')).slice(0, 160))
        const item = { ...c, platform: c.platform || r.meta.platform, _ref: { tid: t.id, postId: r.postId }, _post: p ? postLabel(p) : r.meta.title || '', _postAuthor: r.meta.postAuthor || '', _postUrl: p?.url || r.meta.url, _date: t.date }
        out.set(k, item)
        plat[String(item.platform)] = (plat[String(item.platform)] || 0) + 1
      })
    }
  }
  return { comments: [...out.values()], platform: (Object.keys(plat).sort((a, b) => plat[b] - plat[a])[0] || 'facebook') as Platform, tracks: ts }
}

const topBy = (arr: Comment[], n: number): [string, number][] => {
  const k: Record<string, number> = {}
  arr.forEach((x) => { const a = x.authorName || ''; if (a) k[a] = (k[a] || 0) + 1 })
  return Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, n)
}
const snap = (list: Comment[]): Snapshot => ({ list, st: computeStats(list), s: sentOf(list), authorsN: new Set(list.filter((c) => !c.isTeam).map((c) => c.authorName)).size })
const sign = (n: number) => (n > 0 ? '+' + fmtN(n) : fmtN(n))

function compareRows(c: Snapshot, p: Snapshot | null): CmpRow[] {
  const rows: Omit<CmpRow, 'D' | 'tone'>[] = [
    { k: 'Comentarios revisados', a: c.list.length, b: p ? p.list.length : null, good: 'up' },
    { k: 'Personas que comentan', a: c.authorsN, b: p ? p.authorsN : null, good: 'up' },
    { k: 'Interacciones', a: c.st.reacts, b: p ? p.st.reacts : null, good: 'up' },
    { k: 'Positivos', a: c.s.pos, b: p ? p.s.pos : null, good: 'up' },
    { k: 'Negativos', a: c.s.neg, b: p ? p.s.neg : null, good: 'down' },
    { k: 'Preguntas', a: c.st.q, b: p ? p.st.q : null, good: 'down' },
  ]
  return rows.map((r) => {
    const has = r.b != null && r.a != null, d = has ? r.a! - r.b! : 0
    const D = !has ? '—' : d === 0 ? '=' : (d > 0 ? '▲ ' : '▼ ') + sign(d) + (r.b ? ` (${sign(Math.round((d / r.b) * 100))} %)` : '')
    return { ...r, D, tone: !has || d === 0 ? '' : (d > 0) === (r.good === 'up') ? 'up' : 'down' }
  })
}

/** Construye el informe. Con enfoque, la IA selecciona los comentarios del tema. */
export async function buildReport(opts: { tids?: string[]; comments?: Comment[]; title?: string; focus: string; terms: string[]; author: string; client: string; onProgress?: (a: number, b: number) => void }): Promise<ReportModel> {
  let all: Comment[], tracks: Tracking[] = [], title = opts.title || 'Informe de comentarios'
  if (opts.tids?.length) {
    const g = await gather(opts.tids)
    if (!g.comments.length) throw new Error('Los seguimientos elegidos no tienen comentarios.')
    all = finalize(g.comments.map((c, i) => ({ ...c, id: c.id || 'r' + i })), { platform: g.platform })
    tracks = g.tracks
  } else {
    all = (opts.comments || []).map((c) => ({ ...c }))
    if (!all.length) throw new Error('No hay comentarios para el informe.')
  }
  const teamOn = computeTeam(all, '')
  const fq = opts.focus.trim()
  let list = all, focus: ReportModel['focus'] = null, keys: Set<string> | null = null
  if (fq) {
    keys = await focusMatch(all, fq, opts.onProgress)
    list = focusFilter(all, keys)
    if (!list.some((c) => !c.isTeam)) throw new Error(`ningún comentario habla de ${focusName(fq)}. Prueba con un enfoque más amplio.`)
    focus = { q: fq, name: focusName(fq), total: all.length }
  }
  const cur = snap(list)
  // seguimiento anterior: solo si comparte publicaciones con el último
  let prev: Snapshot | null = null, prevName = ''
  const evolution: ReportModel['evolution'] = []
  if (tracks.length > 1) {
    for (const t of tracks) {
      const l = list.filter((c) => c._ref?.tid === t.id)
      const s = sentOf(l.length ? l : [])
      evolution.push({ name: t.name, date: t.date, total: l.length, pos: s.pos, neg: s.neg })
    }
    const last = tracks[tracks.length - 1], before = tracks[tracks.length - 2]
    const lastPosts = new Set(last.postIds)
    if (before.postIds.some((id) => lastPosts.has(id))) {
      const g2 = await gather([before.id])
      const l2 = finalize(g2.comments.map((c, i) => ({ ...c, id: c.id || 's' + i })), { platform: g2.platform })
      computeTeam(l2, '')
      prev = snap(keys ? focusFilter(l2, keys) : l2)
      prevName = `«${before.name}» (${fmtDay(before.date)})`
    }
  }
  const nonTeam = list.filter((c) => !c.isTeam)
  const byPost = new Map<string, Comment[]>()
  list.forEach((c) => { const k = c._ref?.postId || 'x'; byPost.set(k, [...(byPost.get(k) || []), c]) })
  const posts = [...byPost].map(([id, items]) => { const s = sentOf(items); return { id, label: items[0]._post || title, url: items[0]._postUrl || '', platform: items[0].platform, total: items.length, pos: s.pos, neg: s.neg, negPct: pct(s.neg, s.total) } }).sort((a, b) => b.total - a.total)
  const pos = nonTeam.filter((c) => c.sentiment === 'positivo'), neg = nonTeam.filter((c) => c.sentiment === 'negativo')
  const byReact = (a: Comment, b: Comment) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length
  const m: ReportModel = {
    title, focus, author: opts.author, client: opts.client, terms: opts.terms, generatedAt: new Date().toISOString(),
    period: tracks.length ? (tracks.length === 1 ? fmtDay(tracks[0].date) : `${fmtDay(tracks[0].date)} – ${fmtDay(tracks[tracks.length - 1].date)}`) : new Date().toLocaleDateString('es', { dateStyle: 'long' }),
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, date: t.date })),
    cur, prev, prevName, cmp: compareRows(cur, prev), teamOn,
    pending: nonTeam.filter((c) => c.needsTeam).length, answered: nonTeam.filter((c) => c.teamAnswered).length,
    posts, evolution,
    topAuthors: cur.st.authors.filter((a) => !list.find((c) => c.authorName === a.name)?.isTeam).slice(0, 8).map((a) => ({ name: a.name, count: a.count })),
    fans: topBy(pos, 5), critics: topBy(neg, 5), opinions: reportOpinions(list), rivals: detectRivals(list),
    highlightsPos: [...pos].sort(byReact).slice(0, 5), highlightsNeg: [...neg].sort(byReact).slice(0, 5),
    questions: nonTeam.filter((c) => c.isQuestion && (teamOn ? c.needsTeam : !c.repliesCount)).slice(0, 10),
    summary: [], conclusions: [], recommendations: [],
  }
  writeTexts(m)
  return m
}

function writeTexts(m: ReportModel) {
  const c = m.cur, ab = m.focus ? ` sobre ${m.focus.name}` : ''
  const S: string[] = []
  S.push(m.focus
    ? `Se revisaron ${countTxt(m.focus.total, 'comentario', 'comentarios')}; ${countTxt(c.list.filter((x) => !x.isTeam).length, 'habla', 'hablan')} de ${m.focus.name}.`
    : `Se analizaron ${countTxt(c.list.length, 'comentario', 'comentarios')} de ${countTxt(c.authorsN, 'persona', 'personas')}.`)
  S.push(`De ellos, ${countTxt(c.s.pos, 'es positivo', 'son positivos')} (${pct(c.s.pos, c.s.total)} %), ${countTxt(c.s.neg, 'es negativo', 'son negativos')} (${pct(c.s.neg, c.s.total)} %) y ${countTxt(c.s.neu, 'es neutral', 'son neutrales')}.`)
  if (m.prev) {
    const d = c.list.length - m.prev.list.length
    S.push(`Frente a ${m.prevName}, hay ${d === 0 ? 'los mismos comentarios' : d > 0 ? `${fmtN(d)} comentarios más` : `${fmtN(-d)} comentarios menos`}${ab}; antes había ${fmtN(m.prev.s.pos)} positivos y ${fmtN(m.prev.s.neg)} negativos.`)
  }
  if (c.st.q) S.push(`Hay ${countTxt(c.st.q, 'pregunta', 'preguntas')}${m.teamOn ? `, y ${countTxt(m.pending, 'comentario sigue', 'comentarios siguen')} sin respuesta del equipo` : ''}.`)
  m.summary = S

  const C: string[] = []
  const negP = pct(c.s.neg, c.s.total), posP = pct(c.s.pos, c.s.total)
  C.push(posP >= negP * 2 && posP > 0 ? `La conversación${ab} es mayoritariamente favorable: los comentarios positivos superan con claridad a los negativos.`
    : negP > posP ? `Predominan las críticas${ab}: los comentarios negativos superan a los positivos y conviene atenderlos.`
      : `La conversación${ab} está equilibrada entre comentarios positivos y negativos.`)
  if (m.critics.length) C.push(`Quienes más critican son ${m.critics.slice(0, 3).map(([a, n]) => `${a} (${n})`).join(', ')}.`)
  if (m.fans.length) C.push(`Quienes más hablan a favor son ${m.fans.slice(0, 3).map(([a, n]) => `${a} (${n})`).join(', ')}.`)
  if (m.rivals.length) C.push(`Se mencionan posibles competidores: ${m.rivals.slice(0, 3).map((r) => r.name).join(', ')}.`)
  if (m.prev) { const r = m.cmp.find((x) => x.k === 'Negativos'); if (r && r.tone) C.push(r.tone === 'up' ? 'Los comentarios negativos bajaron respecto al seguimiento anterior.' : 'Los comentarios negativos aumentaron respecto al seguimiento anterior.') }
  m.conclusions = C

  const R: string[] = []
  if (m.fans.length) R.push('Agradecer y reconocer a quienes más comentan a favor: son posibles embajadores de la marca.')
  if (m.rivals.length) R.push('Vigilar las menciones a la competencia para detectar comparaciones de precio o servicio.')
  if (!R.length) R.push('Mantener el seguimiento periódico de los comentarios.')
  m.recommendations = R
}

/** Mensaje para WhatsApp (determinista; la IA puede reescribirlo con naturalidad). */
export function whatsappMessage(m: ReportModel, tone: 'cercano' | 'formal' | 'breve' = 'cercano') {
  const c = m.cur, brand = m.client || m.terms[0] || ''
  const crit = m.focus ? focusSubj(m.focus.q) : m.terms.join(', ')
  const people = (arr: string[]) => (arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1])
  const others = c.list.filter((x) => !x.isTeam)
  const pos = others.filter((x) => x.sentiment === 'positivo'), neg = others.filter((x) => x.sentiment === 'negativo')
  const withN = (arr: [string, number][]) => people(arr.map(([a, n]) => `${a} (${n})`))
  const clip = (s: string) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, '') + '…' : s }
  const seenA = new Set<string>()
  const examples = [...neg].sort((a, b) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length).filter((x) => x.text && !seenA.has(x.authorName) && !!seenA.add(x.authorName)).slice(0, 3)
  const diff = m.prev ? c.list.length - m.prev.list.length : null
  const vsPrev = diff == null ? '' : diff > 0 ? ` (${diff} más que en el seguimiento anterior)` : diff < 0 ? ` (${-diff} menos que en el seguimiento anterior)` : ' (los mismos que en el seguimiento anterior)'
  const formal = tone === 'formal', L: string[] = []
  L.push(`📊 *Informe de comentarios${brand ? ' · ' + brand : ''}*`)
  L.push(`${m.tracks.length ? 'Seguimiento' : 'Periodo'}: ${m.period}.`, '')
  if (m.focus) L.push(`Se revisaron *${countTxt(m.focus.total, 'comentario', 'comentarios')}*.`)
  else L.push(`Se analizaron *${countTxt(c.list.length, 'comentario', 'comentarios')}* de ${countTxt(c.authorsN, 'persona', 'personas')}${vsPrev}.`)
  if (others.length) L.push(`${crit ? `Sobre *${crit}* hay ${others.length === 1 ? '1 comentario' : `${others.length} comentarios`}${m.focus ? vsPrev : ''}` : 'De ellos'}: *${pos.length} ${pos.length === 1 ? 'positivo' : 'positivos'}* 👍 y *${neg.length} ${neg.length === 1 ? 'negativo' : 'negativos'}* 👎${others.length - pos.length - neg.length ? ' (el resto, neutrales)' : ''}.`)
  if (tone !== 'breve') {
    if (m.critics.length) { L.push('', `👎 ${formal ? 'Comentaron en contra' : 'Comentan en contra'}${crit ? ' de ' + crit : ''}: ${withN(m.critics.slice(0, 4))}.${examples.length ? ' Por ejemplo:' : ''}`); examples.forEach((x) => L.push(`• «${clip(x.text)}» — ${x.authorName}`)) }
    if (m.fans.length) L.push('', `👍 ${formal ? 'Quienes más comentaron a favor' : 'Quienes más comentan a favor'}: ${withN(m.fans.slice(0, 3))}.`)
    if (m.pending) L.push('', '⏳ Hay comentarios negativos y preguntas sin responder.')
  }
  L.push('', formal ? 'Se adjunta el informe completo con todo el detalle.' : tone === 'breve' ? 'Se adjunta el informe completo 👇' : 'Se adjunta el informe completo con el detalle 👇')
  return L.join('\n')
}

export const reportDefaults = () => getPrefs().report
