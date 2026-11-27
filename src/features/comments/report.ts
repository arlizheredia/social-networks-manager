/** Informe de comentarios a partir de seguimientos del historial o de los comentarios abiertos. */
import { DB, normName, postLabel } from './db'
import { finalize } from './normalize'
import { getPrefs } from './prefs'
import { useTR } from './tracking'
import { computeStats, computeTeam, detectRivals, fkey, focusFilter, focusMatch, focusName, focusSubj, reportOpinions, sentOf, type Stats } from './analysis'
import type { Comment, Platform, RawComment } from './types'
import { ASPECTS, evaluateAspects, type AspectEval } from './aspects'
const ASPECT_ADVICE = Object.fromEntries(ASPECTS.map((a) => [a.key, a.advice])) as Record<string, string>
import type { Tracking } from './db'

const fmtN = (n: number) => (n ?? 0).toLocaleString('es')
export const countTxt = (n: number, one: string, many: string) => `${fmtN(n)} ${n === 1 ? one : many}`
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
  /** Seguimientos de más reciente a más antiguo; `base` es el más reciente y `d…` lo que cambia la base respecto a cada uno. */
  evolution: { name: string; date: string; total: number; pos: number; neg: number; base?: boolean; dTotal?: number; dPos?: number; dNeg?: number }[]
  topAuthors: { name: string; count: number }[]
  fans: [string, number][]
  critics: [string, number][]
  opinions: ReturnType<typeof reportOpinions>
  rivals: ReturnType<typeof detectRivals>
  /** Evaluación de la marca por aspecto (servicio, entregas, precio, variedad, búsqueda y pago) y de la competencia en esos aspectos. */
  aspects: AspectEval
  /** Nombre de la marca evaluada. */
  brand: string
  highlightsPos: Comment[]
  highlightsNeg: Comment[]
  questions: Comment[]
  summary: string[]
  conclusions: string[]
  recommendations: string[]
}

/** Periodo de los comentarios de un informe y qué fecha se usa: la del comentario o la de su extracción. */
export interface Range { from?: string; to?: string; basis?: 'comment' | 'extraction' }
const localDay = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Día de un comentario según la base elegida (con la otra fecha como respaldo si falta). */
export function dayOf(c: RawComment, basis: Range['basis'] = 'comment') {
  const cr = typeof c.createdAt === 'string' ? c.createdAt : '', ex = typeof c.extractedAt === 'string' ? c.extractedAt : ''
  return localDay(basis === 'extraction' ? ex || cr : cr || ex)
}
const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return localDay(d.toISOString()) }
/** Periodo inmediatamente anterior y de la misma duración (para comparar). */
export function prevRange(r: Range): Range | null {
  if (!r.from || !r.to) return null
  const len = Math.round((Date.parse(r.to + 'T12:00:00') - Date.parse(r.from + 'T12:00:00')) / 864e5) + 1
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), basis: r.basis }
}

/**
 * Comentarios de varios seguimientos: los de sus publicaciones actuales (la caché de cada publicación es común a todos
 * los seguimientos que la incluyen), sin duplicar, y solo los del periodo pedido. Una publicación quitada de un
 * seguimiento conserva sus comentarios en la caché, pero ya no aparece en sus informes.
 */
export async function gather(tids: string[], range: Range = {}) {
  const { tracks, posts } = useTR.getState()
  const out = new Map<string, RawComment>(), plat: Record<string, number> = {}
  const ts = tids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Tracking => !!t).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  const basis = range.basis || 'comment'
  for (const t of ts) {
    for (const pid of t.postIds) {
      const pc = await DB.pc(pid)
      const p = posts.find((x) => x.id === pid)
      pc.comments.forEach((c) => {
        const k = pid + '|' + (c.id && !/^(x|local)-/.test(String(c.id)) ? c.id : normName((c.authorName || '') + ' ' + (c.text || '')).slice(0, 160))
        if (out.has(k)) return
        const day = dayOf(c, basis)
        if ((range.from && (!day || day < range.from)) || (range.to && (!day || day > range.to))) return
        const item = { ...c, platform: c.platform || p?.platform, _ref: { tid: t.id, postId: pid }, _post: p ? postLabel(p) : pc.title || '', _postTitle: [pc.title, p?.title].filter(Boolean).join(' '), _postAuthor: pc.postAuthor || p?.author || '', _postUrl: p?.url || pc.url, _date: day }
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

/**
 * Indicadores. Con enfoque, «Comentarios revisados» son todos los del seguimiento y se añade
 * «Comentarios que hablan de <enfoque>» (sin contar al equipo, como en el resumen).
 */
function compareRows(c: Snapshot, p: Snapshot | null, f?: { name: string; q?: string; all: number; allPrev: number | null }): CmpRow[] {
  const talk = (x: Snapshot) => x.list.filter((y) => !y.isTeam).length
  const rows: Omit<CmpRow, 'D' | 'tone'>[] = [
    { k: 'Comentarios revisados', a: f ? f.all : c.list.length, b: p ? (f ? f.allPrev : p.list.length) : null, good: 'up' },
    ...(f ? [{ k: `Comentarios que hablan de ${f.name}${f.q && normName(f.q) !== normName(f.name.replace(/[«»]/g, '')) ? ` (enfoque: «${f.q}»)` : ''}`, a: talk(c), b: p ? talk(p) : null, good: 'up' as const }] : []),
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

const dayTxt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
/** Periodo de los comentarios: «mié, 25 nov 2026» o «del … al …», y la fecha en que se basa. */
function periodOf(days: string[], range: Range) {
  const ds = days.filter(Boolean).sort()
  const a = range.from || ds[0], b = range.to || ds[ds.length - 1]
  const base = range.basis === 'extraction' ? 'por fecha de extracción' : 'por fecha del comentario'
  if (!a || !b) return base
  return (a === b ? dayTxt(a) : `del ${dayTxt(a)} al ${dayTxt(b)}`) + ` · ${base}`
}

/**
 * Construye el informe. Con seguimientos, toma los comentarios del periodo (por fecha del comentario o de extracción)
 * y los compara con el periodo anterior de la misma duración; la evolución se muestra día a día.
 * Con enfoque, la IA selecciona los comentarios del tema.
 */
export async function buildReport(opts: { tids?: string[]; range?: Range; comments?: Comment[]; title?: string; focus: string; terms: string[]; author: string; client: string; onProgress?: (a: number, b: number) => void }): Promise<ReportModel> {
  let all: Comment[], tracks: Tracking[] = [], title = opts.title || 'Informe de comentarios'
  const range = opts.range || {}
  let prevAllList: Comment[] = [], prevR: Range | null = null
  if (opts.tids?.length) {
    const g = await gather(opts.tids, range)
    tracks = g.tracks
    if (!g.comments.length) throw new Error(range.from || range.to ? 'No hay comentarios en ese periodo en los seguimientos elegidos.' : 'Los seguimientos elegidos no tienen comentarios.')
    all = finalize(g.comments.map((c, i) => ({ ...c, id: c.id || 'r' + i })), { platform: g.platform })
    computeTeam(all, '')
    prevR = prevRange(range)
    if (prevR) {
      const gp = await gather(opts.tids, prevR)
      if (gp.comments.length) { prevAllList = finalize(gp.comments.map((c, i) => ({ ...c, id: c.id || 'q' + i })), { platform: gp.platform }); computeTeam(prevAllList, '') }
    }
  } else {
    all = (opts.comments || []).map((c) => ({ ...c }))
    if (!all.length) throw new Error('No hay comentarios para el informe.')
  }
  const teamOn = computeTeam(all, '')
  const fq = opts.focus.trim()
  let list = all, focus: ReportModel['focus'] = null, keys: Set<string> | null = null
  if (fq) {
    // el enfoque se decide una sola vez sobre los comentarios de ambos periodos (sin repetir textos)
    const pool = new Map<string, Comment>()
    ;[...all, ...prevAllList].forEach((c) => pool.set(fkey(c), c))
    keys = await focusMatch([...pool.values()], fq, opts.onProgress)
    list = focusFilter(all, keys)
    if (!list.some((c) => !c.isTeam)) throw new Error(`ningún comentario habla de ${focusName(fq)}. Prueba con un enfoque más amplio.`)
    focus = { q: fq, name: focusName(fq), total: all.length }
  }
  const cur = snap(list)
  let prev: Snapshot | null = null, prevName = '', prevAll: number | null = null
  if (prevAllList.length && prevR) {
    prev = snap(keys ? focusFilter(prevAllList, keys) : prevAllList)
    prevAll = prevAllList.length
    prevName = `el periodo anterior (${periodOf([], prevR).split(' · ')[0]})`
  }
  // evolución día a día (de más reciente a más antiguo; cada día con su cambio respecto al anterior)
  const evolution: ReportModel['evolution'] = []
  const byDay = new Map<string, Comment[]>()
  list.forEach((c) => { const d = String((c as Comment & { _date?: string })._date || ''); if (d) byDay.set(d, [...(byDay.get(d) || []), c]) })
  const days = [...byDay.keys()].sort()
  if (days.length > 1) {
    const rows = days.slice(-31).map((d) => { const l = byDay.get(d)!, st = sentOf(l); return { name: dayTxt(d), date: '', total: l.length, pos: st.pos, neg: st.neg } })
    rows.forEach((r, i) => { const p = rows[i - 1]; evolution.unshift(i === rows.length - 1 ? { ...r, base: true, ...(p ? { dTotal: r.total - p.total, dPos: r.pos - p.pos, dNeg: r.neg - p.neg } : {}) } : p ? { ...r, dTotal: r.total - p.total, dPos: r.pos - p.pos, dNeg: r.neg - p.neg } : r) })
  }
  const nonTeam = list.filter((c) => !c.isTeam)
  const byPost = new Map<string, Comment[]>()
  list.forEach((c) => { const k = c._ref?.postId || 'x'; byPost.set(k, [...(byPost.get(k) || []), c]) })
  const posts = [...byPost].map(([id, items]) => { const s = sentOf(items); return { id, label: items[0]._post || title, url: items[0]._postUrl || '', platform: items[0].platform, total: items.length, pos: s.pos, neg: s.neg, negPct: pct(s.neg, s.total) } }).sort((a, b) => b.total - a.total)
  const pos = nonTeam.filter((c) => c.sentiment === 'positivo'), neg = nonTeam.filter((c) => c.sentiment === 'negativo')
  // competencia: en todos los comentarios del seguimiento base (una comparación puede no nombrar la marca)
  const rivals = detectRivals(all)
  const rivalNames = new Map<string, string[]>()
  rivals.forEach((r) => r.ids.forEach((id) => rivalNames.set(id, [...(rivalNames.get(id) || []), r.name])))
  const aspects = evaluateAspects(list, all.filter((c) => rivalNames.has(c.id)), (c) => rivalNames.get(c.id) || [])
  const byReact = (a: Comment, b: Comment) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length
  const m: ReportModel = {
    title, focus, author: opts.author, client: opts.client, terms: opts.terms, generatedAt: new Date().toISOString(),
    period: opts.tids?.length ? periodOf(all.map((c) => String((c as Comment & { _date?: string })._date || '')), range) : new Date().toLocaleDateString('es', { dateStyle: 'long' }),
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, date: t.date })),
    cur, prev, prevName, cmp: compareRows(cur, prev, focus ? { name: focus.name, q: focus.q, all: all.length, allPrev: prevAll } : undefined), teamOn,
    pending: nonTeam.filter((c) => c.needsTeam).length, answered: nonTeam.filter((c) => c.teamAnswered).length,
    posts, evolution,
    topAuthors: cur.st.authors.filter((a) => !list.find((c) => c.authorName === a.name)?.isTeam).slice(0, 8).map((a) => ({ name: a.name, count: a.count })),
    fans: topBy(pos, 5), critics: topBy(neg, 5), opinions: reportOpinions(list), rivals, aspects, brand: opts.client || focus?.name || opts.terms[0] || 'la marca',
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
  const A = m.aspects.brand
  if (A.length) {
    const best = [...A].filter((a) => a.verdict === 'fortaleza').sort((a, b) => b.pos - a.pos)[0]
    const worst = [...A].filter((a) => a.verdict === 'debil').sort((a, b) => b.neg - a.neg)[0]
    S.push(`Por aspectos, se habla sobre todo de ${A.slice(0, 3).map((a) => a.short).join(', ')}${best ? `; lo mejor valorado es ${best.short}` : ''}${worst ? `${best ? ' y' : ';'} el principal punto débil, ${worst.short}` : ''}.`)
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
  A.filter((a) => a.verdict === 'debil').forEach((a) => C.push(`${a.name}: ${countTxt(a.neg, 'comentario negativo', 'comentarios negativos')} frente a ${countTxt(a.pos, 'positivo', 'positivos')}; es un punto débil de ${m.brand}.`))
  A.filter((a) => a.verdict === 'fortaleza').forEach((a) => C.push(`${a.name}: es una fortaleza de ${m.brand} (${countTxt(a.pos, 'comentario positivo', 'comentarios positivos')}${a.neg ? ` y ${fmtN(a.neg)} negativo${a.neg === 1 ? '' : 's'}` : ''}).`))
  const rvFav = m.aspects.rivals.filter((r) => r.favor > 0)
  if (rvFav.length) C.push(`La competencia${rvFav[0].rivals.length ? ` (${rvFav[0].rivals.join(', ')})` : ''} se valora mejor en ${rvFav.map((r) => r.short).join(', ')}.`)
  if (m.rivals.length) { const nR = m.rivals.reduce((a, r) => a + r.n, 0); C.push(`Hay ${countTxt(nR, 'comentario que compara', 'comentarios que comparan')} con la competencia (${m.rivals.slice(0, 3).map((r) => r.name).join(', ')}): es un punto crítico a atender.`) }
  if (m.prev) { const r = m.cmp.find((x) => x.k === 'Negativos'); if (r && r.tone) C.push(r.tone === 'up' ? 'Los comentarios negativos bajaron respecto al seguimiento anterior.' : 'Los comentarios negativos aumentaron respecto al seguimiento anterior.') }
  m.conclusions = C

  const R: string[] = []
  if (m.fans.length) R.push('Agradecer y reconocer a quienes más comentan a favor: son posibles embajadores de la marca.')
  A.filter((a) => a.verdict === 'debil').slice(0, 3).forEach((a) => R.push(`${a.name}: ${a.advice}`))
  const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  rvFav.slice(0, 2).forEach((r) => { if (!A.some((a) => a.key === r.key && a.verdict === 'debil')) R.push(`${r.name}: la competencia se compara a su favor; conviene ${lc(ASPECT_ADVICE[r.key] || '')}`) })
  if (m.rivals.length && !rvFav.length) R.push('Analizar las comparaciones con la competencia y responder a quienes las hacen.')
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
  // las comparaciones con la competencia van en su propio apartado (no se repiten como ejemplo de crítica)
  const rivalIds = new Set(m.rivals.flatMap((r) => r.ids))
  const seenA = new Set<string>()
  const examples = [...neg].filter((x) => !rivalIds.has(x.id)).sort((a, b) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length).filter((x) => x.text && !seenA.has(x.authorName) && !!seenA.add(x.authorName)).slice(0, 3)
  const diff = m.prev ? c.list.length - m.prev.list.length : null
  const vsPrev = diff == null ? '' : diff > 0 ? ` (${diff} más que en el seguimiento anterior)` : diff < 0 ? ` (${-diff} menos que en el seguimiento anterior)` : ' (los mismos que en el seguimiento anterior)'
  const formal = tone === 'formal', L: string[] = []
  L.push(`📊 *Informe de comentarios${brand ? ' · ' + brand : ''}*`)
  L.push(`${m.tracks.length ? 'Seguimiento' : 'Periodo'}: ${m.period}.`, '')
  if (m.focus) L.push(`Se revisaron *${countTxt(m.focus.total, 'comentario', 'comentarios')}*.`)
  else L.push(`Se analizaron *${countTxt(c.list.length, 'comentario', 'comentarios')}* de ${countTxt(c.authorsN, 'persona', 'personas')}${vsPrev}.`)
  if (others.length) L.push(`${crit ? `Sobre *${crit}* hay ${others.length === 1 ? '1 comentario' : `${others.length} comentarios`}${m.focus ? vsPrev : ''}` : 'De ellos'}: *${pos.length} ${pos.length === 1 ? 'positivo' : 'positivos'}* 👍 y *${neg.length} ${neg.length === 1 ? 'negativo' : 'negativos'}* 👎${others.length - pos.length - neg.length ? ' (el resto, neutrales)' : ''}.`)
  const AS = m.aspects.brand
  if (AS.length) {
    if (tone === 'breve') { const w = AS.filter((a) => a.verdict === 'debil'); if (w.length) L.push('', `📌 A mejorar: ${w.map((a) => a.short).join(', ')}.`) }
    else { L.push('', `📌 *${formal ? 'Evaluación por aspectos' : 'Por aspectos'}*:`); AS.forEach((a) => L.push(`• ${a.name}: ${a.pos} 👍 · ${a.neg} 👎${a.verdict === 'debil' ? ' ⚠️' : ''}`)) }
  }
  if (m.rivals.length) {
    const rv = m.rivals.slice(0, 3)
    L.push('', `⚠️ *${formal ? 'Se registraron comparaciones con la competencia' : 'Comparan con la competencia'}*: ${people(rv.map((r) => `${r.name} (${r.n})`))}.${tone !== 'breve' ? ' Por ejemplo:' : ''}`)
    const fav = m.aspects.rivals.filter((r) => r.favor > 0)
    if (fav.length) L.push(`${formal ? 'Se los valora mejor en' : 'Los valoran mejor en'}: ${fav.map((r) => r.short).join(', ')}.`)
    if (tone !== 'breve') { const seenR = new Set<string>(); rv.flatMap((r) => r.samples).filter((x) => x.text && !seenR.has(x.id) && !!seenR.add(x.id)).slice(0, 2).forEach((x) => L.push(`• «${clip(x.text)}» — ${x.authorName}`)) }
  }
  if (tone !== 'breve') {
    if (m.critics.length) { L.push('', `👎 ${formal ? 'Comentaron en contra' : 'Comentan en contra'}${crit ? ' de ' + crit : ''}: ${withN(m.critics.slice(0, 4))}.${examples.length ? ' Por ejemplo:' : ''}`); examples.forEach((x) => L.push(`• «${clip(x.text)}» — ${x.authorName}`)) }
    if (m.fans.length) L.push('', `👍 ${formal ? 'Quienes más comentaron a favor' : 'Quienes más comentan a favor'}: ${withN(m.fans.slice(0, 3))}.`)
  }
  L.push('', formal ? 'Se adjunta el informe completo con todo el detalle.' : tone === 'breve' ? 'Se adjunta el informe completo 👇' : 'Se adjunta el informe completo con el detalle 👇')
  return L.join('\n')
}

export const reportDefaults = () => getPrefs().report
