/** Comentarios abiertos para explorar: carga, filtros, búsqueda con IA y respuesta. */
import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { toast } from '@/components/ui'
import { generate, parseJsonLoose, withTask } from '@/features/ai/engine'
import { computeTeam, fkey, focusKeywords, focusMatch, focusTextOf, semanticScores } from './analysis'
import { useAI } from '@/features/ai/engine'
import { finalize, prepare, rescoreSentiment, setSentOverride } from './normalize'
import { getPrefs, setPrefs, usePrefs } from './prefs'
import { appendToResult } from './tracking'
import { normName } from './db'
import type { Comment, Meta, Parsed, Sentiment } from './types'

export type SearchMode = 'sem' | 'ai'
export interface Filters { type: Set<string>; sent: Set<Sentiment>; extra: Set<'q' | 'react' | 'att' | 'noreply' | 'noteam'>; post: Set<string>; people: Set<string> }
interface ExploreState {
  meta: Meta | null
  comments: Comment[]
  version: number
  f: Filters
  q: string
  mode: SearchMode
  sem: { q: string; mode: 'sem' | 'ai'; scores: Map<string, number> } | null
  sort: 'idx' | 'old' | 'new' | 'react' | 'replies'
  teamOn: boolean
  /** Enfoque usado para decidir qué requiere respuesta y cómo se calculó. */
  focus: { q: string; keys: Set<string> | null; ai: boolean } | null
  /** Comentario recién añadido (se resalta un momento en la lista). */
  flash?: string | null
  /** Cambia solo al cargar otro conjunto de comentarios (no al recalcular equipo, polaridad o respuestas). */
  loadId: number
}
const emptyF = (): Filters => ({ type: new Set(), sent: new Set(), extra: new Set(), post: new Set(), people: new Set() })
export const useExplore = create<ExploreState>(() => ({ meta: null, comments: [], version: 0, f: emptyF(), q: '', mode: 'sem', sem: null, sort: 'idx', teamOn: false, focus: null, loadId: 0 }))
const set = useExplore.setState
const KEY = 'snm.explore'

export function loadParsed(parsed: Parsed, { silent = false } = {}) {
  const { meta, comments } = prepare(parsed)
  set({ meta, comments, version: Date.now(), loadId: Date.now(), f: emptyF(), q: '', sem: null, focus: null })
  applyTeam()
  idbSet(KEY, { meta, comments }).catch(() => {})
  if (!silent) toast(`${comments.length.toLocaleString('es')} comentarios cargados`)
}
export function loadComments(meta: Meta, comments: Comment[]) {
  const list = finalize(comments.map((c) => ({ ...c })), meta)
  set({ meta, comments: list, version: Date.now(), loadId: Date.now(), f: emptyF(), q: '', sem: null, focus: null })
  applyTeam()
  idbSet(KEY, { meta, comments: list }).catch(() => {})
}
export async function restoreExplore() {
  if (useExplore.getState().comments.length) return
  try {
    const d = await idbGet<{ meta: Meta; comments: Comment[] }>(KEY)
    if (d?.comments?.length) { set({ meta: d.meta, comments: d.comments, version: Date.now(), focus: null }); applyTeam() }
  } catch { /* */ }
}
export function clearExplore() { set({ meta: null, comments: [], version: Date.now(), loadId: Date.now(), f: emptyF(), sem: null }); idbDel(KEY).catch(() => {}) }
/**
 * Qué comentarios requieren respuesta: los que tratan del enfoque de los informes (Ajustes) y que nadie
 * del equipo ha respondido. Al instante se usan las palabras clave del enfoque; con la IA instalada se afina
 * con la búsqueda por significado (igual que los informes). Sin enfoque, cuentan todos.
 */
let focusRun = 0
export function applyTeam() {
  const s = useExplore.getState(), list = s.comments, pa = s.meta?.postAuthor || ''
  const q = getPrefs().report.focus.trim()
  if (!q || !list.length) { set({ teamOn: computeTeam(list, pa), focus: null, version: Date.now() }); return }
  const cached = s.focus && s.focus.q === q && s.focus.keys ? s.focus : null
  if (cached) { set({ teamOn: computeTeam(list, pa, (c) => cached.keys!.has(fkey(c))), version: Date.now() }); return }
  // 1) palabras clave del enfoque (inmediato)
  const kws = focusKeywords(q)
  set({ teamOn: computeTeam(list, pa, (c) => kws.some((k) => focusTextOf(c).includes(k))), focus: { q, keys: null, ai: false }, version: Date.now() })
  // 2) por significado con la IA, en segundo plano
  if (!useAI.getState().installed) return
  const run = ++focusRun
  focusMatch(list, q).then((keys) => {
    if (run !== focusRun || useExplore.getState().comments !== list) return
    set({ teamOn: computeTeam(list, pa, (c) => keys.has(fkey(c))), focus: { q, keys, ai: true }, version: Date.now() })
  }).catch(() => { /* se quedan las palabras clave */ })
}
export const refreshTeam = applyTeam
// si cambia el enfoque en Ajustes o se instala la IA, se recalcula
usePrefs.subscribe((p, prev) => { if (p.report.focus !== prev.report.focus || p.team !== prev.team || p.teamPostAuthor !== prev.teamPostAuthor || p.teamAllReplies !== prev.teamAllReplies) { set({ focus: null }); applyTeam() } })
useAI.subscribe((a, prev) => { if (a.installed && !prev.installed) { set({ focus: null }); applyTeam() } })

export function setSentiment(c: Comment, v: Sentiment | null) {
  setSentOverride(c, v)
  const list = useExplore.getState().comments
  rescoreSentiment(list)
  set({ comments: [...list], version: Date.now() })
}

export function toggleFilter<K extends keyof Filters>(k: K, v: Filters[K] extends Set<infer T> ? T : never) {
  const f = useExplore.getState().f
  const s = new Set(f[k] as Set<unknown>)
  s.has(v) ? s.delete(v) : s.add(v)
  set({ f: { ...f, [k]: s } })
}
export const clearFilters = () => set({ f: emptyF(), q: '', sem: null })

/** Lista filtrada y ordenada en forma de hilos. */
export function filtered(s: ExploreState, semLevel: number) {
  const F = s.f
  const list = s.comments.filter((c) => {
    if (F.post.size && !F.post.has(c._ref?.postId || '')) return false
    if (F.type.size && !F.type.has(c.type)) return false
    if (F.sent.size && !F.sent.has(c.sentiment)) return false
    if (F.extra.has('att') && !c.attachments.length) return false
    if (F.extra.has('q') && !c.isQuestion) return false
    if (F.extra.has('react') && !c.reactions) return false
    if (F.extra.has('noreply') && (c.type !== 'comment' || c.repliesCount)) return false
    if (F.extra.has('noteam') && s.teamOn && !c.needsTeam) return false
    if (F.people.size && !F.people.has(c.authorName)) return false
    if (s.sem) { const sc = s.sem.scores.get(c.id) ?? 0; return s.sem.mode === 'ai' ? sc >= 1 : sc >= semLevel }
    return true
  })
  const ids = new Set(list.map((c) => c.id))
  const kids: Record<string, Comment[]> = {}
  list.forEach((c) => { if (c.parentId && ids.has(c.parentId)) (kids[c.parentId] ||= []).push(c) })
  Object.values(kids).forEach((a) => a.sort((x, y) => (x.createdTs || 0) - (y.createdTs || 0) || x.idx - y.idx))
  const val = (c: Comment) => ({ idx: c.idx, old: isNaN(c.createdTs) ? Infinity : c.createdTs, new: isNaN(c.createdTs) ? Infinity : -c.createdTs, react: -c.reactions, replies: -c.repliesCount })[s.sort]
  let tops = list.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => val(a) - val(b) || a.idx - b.idx)
  if (s.sem?.mode === 'sem' && s.sort === 'idx') tops = tops.sort((a, b) => (s.sem!.scores.get(b.id) || 0) - (s.sem!.scores.get(a.id) || 0))
  return { list, tops, kids }
}

/* ---------- Búsqueda con IA ---------- */
export async function runSearch() {
  const s = useExplore.getState(), q = s.q.trim()
  if (!q) return
  try {
    if (s.mode === 'sem') {
      const scores = await withTask('Buscando por significado', (p) => semanticScores(s.comments, q, (a, b) => p(a / b)))
      set({ sem: { q, mode: 'sem', scores } })
    } else {
      const list = s.comments.filter((c) => c.text?.trim()).slice(0, 600)
      if (s.comments.length > 600) toast('Se clasificarán los primeros 600 comentarios')
      const ok = new Set<string>()
      await withTask('Clasificando comentarios', async (p) => {
        for (let i = 0; i < list.length; i += 25) {
          p(i / list.length)
          const batch = list.slice(i, i + 25)
          const user = `Criterio: "${q}"\nDevuelve {"ids":[…]} con los números de los comentarios que cumplen el criterio (incluye los relacionados de forma indirecta).\n\n` + batch.map((c, n) => `${n + 1}. ${c.text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
          const txt = await generate('Clasificas comentarios de redes sociales. Respondes SOLO con JSON válido.', user, { maxTokens: 160 })
          const j = parseJsonLoose<{ ids?: number[] }>(txt)
          const ids = j?.ids ?? (String(txt).match(/\d+/g) || []).map(Number)
          ids.forEach((n) => { const c = batch[+n - 1]; if (c) ok.add(c.id) })
        }
      })
      set({ sem: { q, mode: 'ai', scores: new Map(list.map((c) => [c.id, ok.has(c.id) ? 1 : 0])) } })
    }
  } catch (e) { toast('IA: ' + (e as Error).message) }
}

/* ---------- Respuestas ---------- */
export function fillTemplate(t: string, c: Comment) {
  const name = String(c.authorName || '').replace(/^@/, '')
  const first = c.platform === 'facebook' ? name.split(/\s+/)[0] || name : name
  const page = useExplore.getState().meta?.postAuthor || ''
  return t.replace(/\{nombre\}/g, name).replace(/\{nombre_pila\}/g, first).replace(/\{usuario\}/g, '@' + name).replace(/\{pagina\}/g, page)
}
export function suggestScore(r: { id: string; tags: string[] }, c: Comment) {
  return (r.tags.includes(c.sentiment) ? 3 : 0) + (c.isQuestion && r.tags.includes('pregunta') ? 4 : 0) + Math.min(2, (getPrefs().replyUse[r.id] || 0) / 5)
}
export function markAnswered(c: Comment, via = 'manual', replyId?: string) {
  const p = getPrefs()
  setPrefs({ answered: { ...p.answered, [c.id]: { at: Date.now(), via } }, ...(replyId ? { replyUse: { ...p.replyUse, [replyId]: (p.replyUse[replyId] || 0) + 1 } } : {}) })
  refreshTeam()
}
/**
 * Respuesta publicada desde la app: se añade a la conversación abierta (sin cambiar filtros ni vista),
 * se guarda en el seguimiento de origen y la cuenta que respondió pasa a contar como equipo.
 */
export async function addReply(parent: Comment, text: string, r: { author?: string; link?: string } = {}) {
  const s = useExplore.getState()
  const now = new Date().toISOString()
  const author = (r.author || '').trim()
  const raw = {
    id: 'app-' + Date.now().toString(36), parentId: parent.id, isReply: true, replyTo: parent.authorName,
    authorName: author || 'Tu cuenta', text, createdAt: now, dateText: '', platform: parent.platform,
    permalink: r.link || parent.permalink, source: 'respuesta desde la app', badges: ['Respuesta desde la app'],
  }
  const [c] = finalize([{ ...raw }], s.meta || {})
  Object.assign(c, { idx: s.comments.length + 1, depth: Math.min(parent.depth + 1, 2), replyTo: parent.authorName, _ref: parent._ref, _post: parent._post, _postUrl: parent._postUrl, _date: parent._date })
  const comments = s.comments.map((x) => (x.id === parent.id ? { ...x, repliesCount: x.repliesCount + 1 } : x))
  comments.push(c)
  set({ comments, flash: c.id, version: Date.now() })
  setTimeout(() => { if (useExplore.getState().flash === c.id) set({ flash: null }) }, 6000)
  // la cuenta con la que se respondió es la de la marca
  const p = getPrefs()
  if (author && !p.team.some((m) => normName(m.name) === normName(author))) setPrefs({ team: [...p.team, { name: author }] })
  else applyTeam()
  idbSet(KEY, { meta: s.meta, comments: useExplore.getState().comments }).catch(() => {})
  if (parent._ref) await appendToResult(parent._ref.tid, parent._ref.postId, raw).catch(() => false)
  return c
}
export async function aiReplies(c: Comment, n = 3): Promise<string[]> {
  const examples = getPrefs().replies.slice(0, 4).map((r) => `- ${r.text}`).join('\n')
  const brand = getPrefs().report.client || useExplore.getState().meta?.postAuthor || 'la marca'
  const sys = `Eres el community manager de ${brand}. Respondes comentarios de redes sociales en español con un tono cordial, breve (1 a 3 frases) y humano. No inventes datos, precios ni promesas. Si hay un problema, invita a escribir por mensaje privado. Responde SOLO con JSON: {"respuestas":["…","…"]}.`
  const user = `Comentario de ${c.authorName || 'una persona'} (${c.sentiment}${c.isQuestion ? ', pregunta' : ''}):\n«${c.text}»\n\nEscribe ${n} respuestas distintas.\nEjemplos del estilo de la marca:\n${examples}`
  const txt = await withTask('Pensando sugerencias', (p) => generate(sys, user, { onProgress: p }))
  const j = parseJsonLoose<{ respuestas?: string[] } | string[]>(txt)
  const arr = Array.isArray(j) ? j : j?.respuestas
  const out = (Array.isArray(arr) ? arr : String(txt).split(/\n+/)).map((x) => String(x).replace(/^[-*\d.)\s"]+|"$/g, '').trim()).filter((x) => x.length > 3)
  return out.slice(0, n)
}

/* ---------- Datos de ejemplo ---------- */
export function demoParsed(): Parsed {
  const now = Date.now(), h = (n: number) => new Date(now - n * 36e5).toISOString()
  const C = (id: string, parentId: string, authorName: string, text: string, hours: number, reactions = 0) => ({ id, parentId, authorName, text, createdAt: h(hours), dateText: '', reactions, source: 'demo', platform: 'facebook' as const })
  return {
    meta: { title: 'Publicación de ejemplo: ¡nuevos combos a domicilio!', postAuthor: 'Mi Tienda', source: 'Datos de ejemplo', platform: 'facebook', extractedAt: new Date().toISOString(), url: 'https://www.facebook.com/' },
    comments: [
      C('d1', '', 'Ana López', '¡Excelente servicio! Llegó todo rapidísimo y fresco. Los recomiendo 100 % 👏', 30, 12),
      C('d2', 'd1', 'Mi Tienda', '¡Muchas gracias, Ana! Nos alegra mucho leerte 😊', 29, 3),
      C('d3', '', 'Luis Pérez', 'Mi pedido lleva 3 días de demora y nadie responde. Muy decepcionado.', 26, 8),
      C('d4', 'd3', 'Carla Ruiz', 'A mí me pasó lo mismo la semana pasada', 25, 2),
      C('d5', '', 'Marta Díaz', '¿Hacen entregas en Holguín? ¿Cuánto cuesta el envío?', 20, 1),
      C('d6', '', 'Pedro Gómez', 'Buenos precios, pero el pollo vino un poco descongelado.', 18, 0),
      C('d7', '', 'Sofía Martín', 'Lo mejor de lo mejor, siempre puntuales ❤️', 12, 6),
      C('d8', '', 'Jorge Castro', 'Prefiero la tienda de la esquina, es más barata y más rápida.', 8, 4),
      C('d9', '', 'Elena Vidal', '¿Tienen combos para cumpleaños?', 5, 0),
      C('d10', 'd7', 'Raúl Torres', 'Totalmente de acuerdo con Sofía', 4, 1),
    ],
  }
}

/** Personas que comentan (en la publicación elegida, si hay filtro de publicación), de más a menos comentarios. */
export function commenters(s: ExploreState) {
  const n = new Map<string, number>()
  s.comments.forEach((c) => {
    if (!c.authorName || (s.f.post.size && !s.f.post.has(c._ref?.postId || ''))) return
    n.set(c.authorName, (n.get(c.authorName) || 0) + 1)
  })
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
}
/** Filtra por una o varias personas (sustituye la selección). */
export const setPeople = (names: string[]) => { const s = useExplore.getState(); set({ f: { ...s.f, people: new Set(names) } }) }
