/**
 * Seguimientos: lista de publicaciones y extracción automática de sus comentarios con la extensión.
 * Reglas del original: secuencial, reintentos con espera exponencial, vigilancia de la extensión, guardados parciales,
 * ritmo prudente y fusión con lo ya guardado (nunca se pierden comentarios).
 */
import { create } from 'zustand'
import { createStore, del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { download } from '@/lib/util'
import { toast } from '@/components/ui'
import { wsleep } from '@/lib/timers'
import { extractorSend, onExtractorMessage, useExtension } from '@/features/extension/bridge'
import { DB, postLabel, resKey, todayISO, uid, type Post, type TrackItem, type Tracking } from './db'
import { fromExtractor, parseCSV } from './normalize'
import { getPrefs } from './prefs'
import { canonUrl, detectPlatform, normL, platName } from './text'
import type { Parsed, Platform, RawComment } from './types'

export interface Sessions { facebook: boolean; instagram: boolean; tiktok: boolean; known: boolean }
interface TRState {
  posts: Post[]; tracks: Tracking[]
  /** seguimientos en curso (pueden ser varios: se turnan en la ventana de extracción) */
  runs: string[]
  /** el primero en curso (compatibilidad) */
  running: string | null
  /** seguimientos en curso pasados a segundo plano */
  bgIds: string[]
  /** seguimiento que se muestra en la ventana flotante */
  win: string | null
  loaded: boolean; sessions: Sessions; tick: number
}
export const useTR = create<TRState>(() => ({ posts: [], tracks: [], runs: [], running: null, bgIds: [], win: null, loaded: false, sessions: { facebook: false, instagram: false, tiktok: false, known: false }, tick: 0 }))
const bump = () => useTR.setState((s) => ({ tick: s.tick + 1, tracks: [...s.tracks] }))

export const countTxt = (n: number, one: string, many: string) => `${n.toLocaleString('es')} ${n === 1 ? one : many}`

export async function loadTR() {
  try {
    const [posts, tracks] = await Promise.all([DB.all<Post>('posts'), DB.all<Tracking>('trackings')])
    posts.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    tracks.sort((a, b) => trackTs(b) - trackTs(a))
    // un seguimiento que quedó «en curso» al recargar o cerrar la página pasa a «en pausa» sin perder lo recogido:
    // los comentarios ya extraídos de la publicación en curso se recuperan del punto de control y se guardan como parciales
    const orphans: string[] = []
    for (const t of tracks) if (t.status === 'running' && !useTR.getState().runs.includes(t.id)) {
      t.status = 'paused'; t.interrupted = true
      for (const [pid, i] of Object.entries(t.items)) {
        if (i.status !== 'running') continue
        if (i.jobId) orphans.push(i.jobId)
        const ck = await idbGet<RawComment[]>(ckKey(t.id, pid), ckStore()).catch(() => undefined)
        const p = posts.find((x) => x.id === pid)
        if (ck?.length && p) {
          await storeResult(t, p, fromExtractor({ source: 'social-dom-extractor', platform: p.platform, version: 3, url: p.url, title: p.title || '', comments: ck }), 'extension', true).catch(() => {})
        }
        Object.assign(i, { status: 'pending', phase: '', jobId: undefined, ...(ck?.length ? { partial: true } : {}) })
        delete i.retry
        await idbDel(ckKey(t.id, pid), ckStore()).catch(() => {})
      }
      await DB.put('trackings', t)
    }
    if (orphans.length) stopOrphans(orphans)
    // una sola vez: fecha de extracción e índice para los comentarios guardados antes de existir
    try { if (!localStorage.getItem('snm.extractedAt.v1')) { await DB.backfillExtractedAt(); localStorage.setItem('snm.extractedAt.v1', '1') } } catch { /* */ }
    useTR.setState({ posts, tracks, loaded: true })
  } catch (e) {
    useTR.setState({ loaded: true })
    toast('No se pudo abrir el almacenamiento del navegador: ' + (e as Error).message)
  }
}

/* ---------- Publicaciones ---------- */
export async function addPosts(urls: string[], name = '') {
  let added = 0, dup = 0, bad = 0
  const posts = [...useTR.getState().posts]
  for (let u of urls) {
    u = u.trim()
    if (!u) continue
    const plat = detectPlatform(u)
    if (!plat) { bad++; continue }
    const url = canonUrl(u)
    if (posts.some((p) => p.url === url)) { dup++; continue }
    const p: Post = { id: uid('p_'), url, platform: plat, name: urls.length === 1 && name ? name : '', title: '', author: '', addedAt: new Date().toISOString(), method: 'auto', notes: '' }
    await DB.put('posts', p)
    posts.unshift(p)
    added++
  }
  useTR.setState({ posts })
  const parts = [added && countTxt(added, 'publicación añadida', 'publicaciones añadidas'), dup && countTxt(dup, 'ya estaba en la lista', 'ya estaban en la lista'), bad && countTxt(bad, 'enlace no reconocido', 'enlaces no reconocidos')].filter(Boolean)
  toast(parts.join(' · ') || 'No había enlaces')
  return added
}
/* ---------- Importar / exportar publicaciones ---------- */
export interface PostIn { url: string; name?: string; title?: string; author?: string; notes?: string }
const URL_RE = /https?:\/\/[^\s"'<>,;]+/i
const clean = (v: unknown, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** Lee publicaciones de un archivo: JSON (de esta app o una lista), CSV/Excel con columna de enlace, o texto con un enlace por línea. */
export function parsePostsFile(text: string, fileName = ''): PostIn[] {
  text = text.replace(/^\uFEFF/, '')
  const t = text.trim()
  if (/\.json$/i.test(fileName) || /^[[{]/.test(t)) {
    try {
      const d = JSON.parse(t)
      const arr: unknown[] = Array.isArray(d) ? d : Array.isArray(d?.posts) ? d.posts : Array.isArray(d?.data?.posts) ? d.data.posts : []
      return arr.map((x) => (typeof x === 'string' ? { url: x } : x && typeof x === 'object' ? (() => { const o = x as Record<string, unknown>; return { url: String(o.url || o.link || o.enlace || ''), name: clean(o.name || o.nombre), title: clean(o.title || o.titulo, 140), author: clean(o.author || o.autor), notes: clean(o.notes || o.notas, 500) } })() : { url: '' })).filter((x) => x.url)
    } catch { /* no es JSON: se lee como texto */ }
  }
  const first = t.split('\n')[0] || ''
  if (!URL_RE.test(first) && /[,;\t]/.test(first)) {
    const rows = parseCSV(text)
    const key = (r: Record<string, string>, re: RegExp) => Object.keys(r).find((k) => re.test(normL(k)))
    if (rows.length) {
      const r0 = rows[0], ku = key(r0, /^(url|enlace|link|direccion|publicacion)/)
      if (ku) {
        const kn = key(r0, /^(nombre|name)/), kt = key(r0, /^(titulo|title)/), ka = key(r0, /^(autor|author|pagina)/), ko = key(r0, /^(notas?|notes?)/)
        return rows.map((r) => ({ url: (String(r[ku] || '').match(URL_RE) || [''])[0], name: kn ? clean(r[kn]) : '', title: kt ? clean(r[kt], 140) : '', author: ka ? clean(r[ka]) : '', notes: ko ? clean(r[ko], 500) : '' })).filter((x) => x.url)
      }
    }
  }
  // texto: un enlace por línea; lo demás de la línea es el nombre
  return t.split(/\r?\n/).map((l): PostIn | null => { const m = l.match(URL_RE); return m ? { url: m[0], name: clean(l.replace(m[0], ' ').replace(/^[\s\-–—:|,;\t]+|[\s\-–—:|,;\t]+$/g, '')) } : null }).filter((x): x is PostIn => !!x)
}

/** Añade las publicaciones importadas: no duplica y completa el nombre o las notas de las que ya estaban sin ellos. */
export async function importPosts(items: PostIn[]) {
  let added = 0, updated = 0, dup = 0, bad = 0
  const posts = [...useTR.getState().posts]
  for (const it of items) {
    const plat = detectPlatform(it.url || '')
    if (!plat) { bad++; continue }
    const url = canonUrl(it.url.trim())
    const ex = posts.find((p) => p.url === url)
    if (ex) {
      const ch: Partial<Post> = {}
      if (!ex.name && it.name) ch.name = it.name
      if (!ex.notes && it.notes) ch.notes = it.notes
      if (!ex.title && it.title) ch.title = it.title
      if (!ex.author && it.author) ch.author = it.author
      if (Object.keys(ch).length) { const np = { ...ex, ...ch }; await DB.put('posts', np); posts[posts.indexOf(ex)] = np; updated++ } else dup++
      continue
    }
    const p: Post = { id: uid('p_'), url, platform: plat, name: it.name || '', title: it.title || '', author: it.author || '', addedAt: new Date().toISOString(), method: 'auto', notes: it.notes || '' }
    await DB.put('posts', p)
    posts.unshift(p)
    added++
  }
  useTR.setState({ posts })
  const parts = [added && countTxt(added, 'publicación importada', 'publicaciones importadas'), updated && countTxt(updated, 'actualizada', 'actualizadas'), dup && countTxt(dup, 'ya estaba', 'ya estaban'), bad && countTxt(bad, 'enlace no reconocido', 'enlaces no reconocidos')].filter(Boolean)
  toast(parts.join(' · ') || 'El archivo no tiene enlaces de publicaciones')
  return { added, updated, dup, bad }
}

export function exportPosts(list: Post[], kind: 'json' | 'csv') {
  const day = todayISO()
  if (kind === 'json') {
    const data = { app: 'social-networks-manager', type: 'posts', version: 1, exportedAt: new Date().toISOString(), posts: list.map((p) => ({ name: p.name, url: p.url, platform: p.platform, title: p.title, author: p.author, notes: p.notes })) }
    download(`publicaciones-${day}.json`, JSON.stringify(data, null, 2), 'application/json')
  } else {
    const q = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Nombre', 'Enlace', 'Red', 'Título', 'Autor', 'Notas'], ...list.map((p) => [p.name || postLabel(p), p.url, platName(p.platform), p.title, p.author, p.notes])]
    download(`publicaciones-${day}.csv`, '\uFEFF' + rows.map((r) => r.map(q).join(';')).join('\r\n'), 'text/csv')
  }
  toast(countTxt(list.length, 'publicación exportada', 'publicaciones exportadas'))
}

export async function updatePost(p: Post) { await DB.put('posts', p); useTR.setState((s) => ({ posts: s.posts.map((x) => (x.id === p.id ? p : x)) })) }
export async function deletePosts(ids: string[]) {
  for (const id of ids) await DB.del('posts', id)
  useTR.setState((s) => ({ posts: s.posts.filter((p) => !ids.includes(p.id)) }))
}

/* ---------- Seguimientos ---------- */
/**
 * Crea o actualiza un seguimiento. Sus publicaciones se pueden cambiar en cualquier momento: al quitar una, sus
 * comentarios siguen en la caché (no salen en nuevos informes) y, si se vuelve a añadir, la extracción continúa
 * desde su índice. El tipo de comentarios a revisar ya no se elige: lo decide la extracción.
 */
export async function saveTracking(data: { id?: string; name: string; date?: string; postIds: string[]; fbLimit: number }) {
  const tracks = [...useTR.getState().tracks]
  let t = data.id ? tracks.find((x) => x.id === data.id) : undefined
  if (!t) { t = { id: uid('t_'), createdAt: new Date().toISOString(), status: 'draft', items: {}, name: '', date: '', postIds: [], fbOrder: 'all', fbLimit: 1500 }; tracks.unshift(t) }
  Object.assign(t, { name: data.name.trim() || 'Seguimiento', date: t.date || data.date || todayISO(), postIds: data.postIds, fbLimit: data.fbLimit })
  data.postIds.forEach((id) => { t!.items[id] ||= { status: 'pending', count: 0 } })
  // con publicaciones nuevas, un seguimiento completado queda pendiente de extraerlas
  if (t.status === 'done' && data.postIds.some((id) => t!.items[id].status === 'pending')) t.status = 'paused'
  Object.keys(t.items).forEach((id) => { if (!data.postIds.includes(id)) delete t!.items[id] })
  await DB.put('trackings', t)
  tracks.sort((a, b) => trackTs(b) - trackTs(a))
  useTR.setState({ tracks })
  return t
}
export async function putTracking(t: Tracking) { await DB.put('trackings', t); bump() }
export async function deleteTracking(id: string) { await DB.delTracking(id); useTR.setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })) }

export const hasResult = (it?: TrackItem) => !!it && (it.status === 'done' || (it.saved ?? 0) > 0 || (!!it.partial && it.count > 0))
export const inHistory = (t: Tracking) => t.status === 'done' || (t.status === 'paused' && t.inHist === true && t.postIds.some((id) => hasResult(t.items[id])))
export function trackProgress(t: Tracking) {
  const ids = t.postIds, n = ids.length || 1
  let done = 0, frac = 0, hasRunning = false
  ids.forEach((id) => {
    const it = t.items[id]
    if (!it) return
    if (['done', 'skipped', 'error'].includes(it.status)) done++
    else if (it.status === 'running') {
      hasRunning = true
      if (it.limit || (it.total && (it.order || 'all') === 'all')) {
        const goal = (it.order || 'all') === 'all' && it.total ? (it.limit ? Math.min(it.total, it.limit) : it.total) : it.limit!
        frac += Math.min(0.99, (it.count || 0) / goal)
      } else frac += it.count ? 0.5 : 0.1
    }
  })
  const comments = ids.reduce((s, id) => { const it = t.items[id]; if (!it) return s; return s + (it.status === 'running' ? Math.max(it.count || 0, it.saved || 0) : it.count || it.saved || 0) }, 0)
  const raw = Math.round(((done + frac) / n) * 100)
  return { pct: hasRunning ? Math.min(99, raw) : Math.min(100, raw), done, n: ids.length, comments, errors: ids.filter((id) => t.items[id]?.status === 'error').length }
}
/** Última actualización del seguimiento (la última vuelta de extracción), o su creación si aún no se ha extraído. */
export const trackTs = (t: Tracking) => Date.parse(t.rounds?.[t.rounds.length - 1]?.at || t.finishedAt || t.startedAt || t.createdAt || '') || Date.parse((t.date || '') + 'T12:00:00') || 0
export function trackWhen(t: Tracking) {
  const ts = trackTs(t)
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}
const dayL = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** ¿El seguimiento tuvo actividad en ese periodo? (desde que se creó hasta su última actualización) */
export function activeIn(t: Tracking, from?: string, to?: string) {
  const first = t.createdAt ? dayL(Date.parse(t.createdAt)) : t.date, last = dayL(trackTs(t))
  return (!from || last >= from) && (!to || first <= to)
}
/** Comentarios nuevos en las vueltas de los últimos días. */
export const newSince = (t: Tracking, days: number) => (t.rounds || []).filter((r) => Date.parse(r.at) >= Date.now() - days * 864e5).reduce((a, r) => a + r.newComments, 0)

/* ---------- Extensión: sesiones y extracción ---------- */
const CP_TAG = '\u0001sca-cp:'
interface Job { acc: RawComment[]; accKeys: Set<string>; watchdog?: boolean; resolve: (v: ExtResult) => void; reject: (e: Error) => void; onProgress: (m: Record<string, unknown>) => void }
interface ExtResult { data?: Record<string, unknown>; stopped?: boolean; closed?: boolean; watchdog?: boolean; acc?: RawComment[] }
const jobs = new Map<string, Job>()

onExtractorMessage((m) => {
  if (m.type === 'sessions') { useTR.setState({ sessions: { facebook: !!m.facebook, instagram: !!m.instagram, tiktok: !!m.tiktok, known: true } }); return }
  const job = jobs.get(String(m.jobId))
  if (!job) return
  if (m.type === 'progress') job.onProgress(m)
  else if (m.type === 'result') { jobs.delete(String(m.jobId)); job.resolve(m as ExtResult) }
  else if (m.type === 'error' && /Se cerró la (pestaña|ventana)/i.test(String(m.error || ''))) { jobs.delete(String(m.jobId)); job.resolve({ closed: true }) }
  else if (m.type === 'error' || m.type === 'stopped') { jobs.delete(String(m.jobId)); m.type === 'stopped' ? job.resolve({ stopped: true }) : job.reject(new Error(String(m.error || 'Error de la extensión'))) }
})

export const requestSessions = () => { if (useExtension.getState().extractor) extractorSend({ type: 'sessions' }) }
export function refreshSessions() {
  if (!useExtension.getState().extractor) return Promise.resolve()
  return new Promise<void>((res) => {
    const off = onExtractorMessage((m) => { if (m.type === 'sessions') { off(); clearTimeout(t); res() } })
    const t = setTimeout(() => { off(); res() }, 3000)
    requestSessions()
  })
}
export const LOGIN_URL: Record<Platform, string> = { facebook: 'https://www.facebook.com/login', instagram: 'https://www.instagram.com/accounts/login/', tiktok: 'https://www.tiktok.com/login' }
export function missingAuth(posts: Post[]): Platform[] {
  const s = useTR.getState().sessions
  return [...new Set(posts.map((p) => p.platform).filter((p) => !s[p]))]
}

function extOpts() {
  const e = getPrefs().extract
  return { window: e.win, visible: e.win === 'normal', keepOpen: e.keep, maxMinutes: e.maxMin || 60, gap: e.gap, retries: Math.min(10, Math.max(1, Math.round(e.retries) || 10)), retryBase: Math.max(0.01, e.retryBase || 15), careful: e.careful }
}
const extStop = (jobId: string) => extractorSend({ type: 'stop', jobId })

/* Punto de control: los comentarios que la extensión va enviando se guardan cada pocos segundos para no perderlos si
   la página se recarga a mitad de una publicación. */
let ck_: ReturnType<typeof createStore> | null = null
const ckStore = () => (ck_ ||= createStore('snm-ckpt', 'ckpt'))
const ckKey = (tid: string, pid: string) => tid + '|' + pid
/** Detiene en la extensión las extracciones que quedaron huérfanas tras recargar (espera a que la extensión conteste). */
function stopOrphans(ids: string[]) {
  let tries = 0
  const go = () => { if (useExtension.getState().extractor) ids.forEach(extStop); else if (++tries < 20) setTimeout(go, 1500) }
  setTimeout(go, 500)
}

function extExtract(url: string, onProgress: (m: Record<string, unknown>) => void, fb: { order: string; limit: number } | null) {
  const opts = extOpts(), cfg = fb || { order: 'all', limit: 0 }
  const jobId = uid('j_') + '~o=' + cfg.order + '~l=' + cfg.limit // el orden pedido viaja en el identificador (lo lee el extractor)
  const promise = new Promise<ExtResult>((resolve, reject) => {
    let last = Date.now(), asked = 0
    const idleMax = 5 * 60000, hardMax = (opts.maxMinutes + 3) * 60000, started = Date.now()
    const wd = setInterval(() => {
      const now = Date.now()
      if (!asked && (now - last > idleMax || now - started > hardMax)) { asked = now; extStop(jobId); const j = jobs.get(jobId); if (j) j.watchdog = true }
      else if (asked && now - asked > 30000) {
        const j = jobs.get(jobId)
        if (j && j.acc.length) finish(resolve)({ watchdog: true, stopped: true, acc: j.acc })
        else finish(reject)(new Error('La extensión dejó de responder (la pestaña o Chrome pueden haberse bloqueado).'))
      }
    }, 15000)
    const finish = <T,>(fn: (v: T) => void) => (v: T) => { clearInterval(wd); jobs.delete(jobId); fn(v) }
    const job: Job = {
      acc: [], accKeys: new Set(),
      resolve: (v) => finish(resolve)({ ...v, acc: job.acc, ...(job.watchdog ? { watchdog: true } : {}) }),
      reject: finish(reject),
      onProgress: (m) => {
        last = Date.now()
        if (typeof m.note === 'string' && m.note.startsWith(CP_TAG)) {
          try {
            (JSON.parse(m.note.slice(CP_TAG.length)) as RawComment[]).forEach((c) => {
              const k = String(c.id || (c.authorName || '') + '|' + (c.text || ''))
              if (!job.accKeys.has(k)) { job.accKeys.add(k); job.acc.push(c) }
            })
          } catch { /* */ }
          m = { ...m, note: '' }
        }
        onProgress(m)
      },
    }
    jobs.set(jobId, job)
    extractorSend({ type: 'extract', jobId, url, options: opts })
  })
  return { jobId, promise }
}

/* ---------- Motor ---------- */
/** Control de cada seguimiento en curso (detener, reintentar, trabajo de la extensión, error que lo detuvo). */
interface Ctl { stopReq: boolean; job: string | null; halt: { post: string; error: string } | null; retryNow: boolean }
const CTL = new Map<string, Ctl>()
const ctl = (tid: string) => { let c = CTL.get(tid); if (!c) { c = { stopReq: false, job: null, halt: null, retryNow: false }; CTL.set(tid, c) } return c }
/* Varios seguimientos pueden estar en curso: se turnan en la ventana de extracción, una publicación cada vez, con la
   pausa entre publicaciones (y la pausa larga del modo prudente) común a todos. */
const EXT = { tail: Promise.resolve() as Promise<void>, lastEnd: 0, count: 0 }
function takeTurn(): Promise<() => void> {
  let release!: () => void
  const mine = new Promise<void>((res) => { release = res })
  const prev = EXT.tail
  EXT.tail = prev.then(() => mine)
  return prev.then(() => release)
}
const setRuns = (f: (ids: string[]) => string[]) => useTR.setState((s) => { const runs = f(s.runs); return { runs, running: runs[0] ?? null, bgIds: s.bgIds.filter((x) => runs.includes(x)) } })
/**
 * Pasa un seguimiento a segundo plano (su tarjeta queda arriba a la derecha) o lo trae a la ventana flotante; el que
 * estaba en la ventana y sigue en curso pasa a segundo plano.
 */
export const setTrackBg = (tid: string, bg: boolean) => useTR.setState((s) => bg
  ? { bgIds: [...new Set([...s.bgIds, tid])] }
  : { win: tid, bgIds: [...new Set([...s.bgIds.filter((x) => x !== tid), ...(s.win && s.win !== tid && s.runs.includes(s.win) ? [s.win] : [])])] })
/** Cierra la ventana flotante (si sigue en curso, pasa a segundo plano). */
export const closeTrackWin = () => useTR.setState((s) => (s.win && s.runs.includes(s.win) ? { bgIds: [...new Set([...s.bgIds, s.win])] } : { win: null }))
const NO_RETRY = /no está instalada|Enlace no admitido|no admitido|no responde\. Instálala/i
const isRetryable = (e: Error) => !!e && e.name !== 'AbortError' && !NO_RETRY.test(e.message || '')
const isFatal = (e: Error) => /no está instalada|no responde\. Instálala/i.test(e?.message || '')
const retryDelay = (n: number, base: number) => Math.min(300000, base * 1000 * Math.pow(2, n - 1))
export const retryNow = (tid = useTR.getState().running) => { if (tid) ctl(tid).retryNow = true }

function uniqueIds(parsed: Parsed, postId: string) {
  const fix = (v: string) => (v && /^(x|local)-/.test(v) ? postId + '-' + v : v)
  parsed.comments.forEach((c) => { c.id = fix(String(c.id || '')); if (c.parentId) c.parentId = fix(String(c.parentId)) })
  return parsed
}
/** Guarda lo extraído en la caché de la publicación; devuelve cuántos comentarios son nuevos. */
async function storeResult(t: Tracking, p: Post, parsed: Parsed, method: string, partial: boolean): Promise<number> {
  uniqueIds(parsed, p.id)
  const meta = { ...parsed.meta, platform: parsed.meta.platform || p.platform, url: parsed.meta.url || p.url }
  let comments = parsed.comments
  const prev = await DB.getResult(t.id + '|' + p.id).catch(() => undefined)
  if (prev?.comments?.length) {
    const seen = new Set(comments.map(resKey)), kept = prev.comments.filter((c) => !seen.has(resKey(c)))
    if (kept.length) comments = comments.concat(kept)
  }
  const { fresh, total } = await DB.saveResult({ key: t.id + '|' + p.id, tid: t.id, postId: p.id, date: t.date, meta, extractedAt: new Date().toISOString(), method, partial: !!partial }, comments, { cursor: !partial })
  const it = t.items[p.id]
  Object.assign(it, { status: 'done', count: total, saved: total, newCount: (it.newCount || 0) + fresh, method, finishedAt: new Date().toISOString(), partial: !!partial, error: '' })
  let ch = false
  if (meta.title && !p.title) { p.title = String(meta.title).replace(/\s+/g, ' ').slice(0, 140); ch = true }
  if (meta.postAuthor && !p.author) { p.author = meta.postAuthor; ch = true }
  if (ch) await updatePost(p)
  return fresh
}

/**
 * Cómo extraer una publicación (lo decide la app, no el usuario). El máximo de la preferencia es un CUPO POR EXTRACCIÓN:
 * cada vez que se inicia o se continúa el seguimiento, cada publicación trae como mucho esos comentarios (o los que le
 * queden, si son menos); después el proceso se detiene solo hasta que se pulse continuar.
 * - Primera vez: todos los comentarios, hasta el cupo.
 * - Quedan comentarios antiguos por extraer (la red tiene más que los guardados): se sigue el orden de «todos» desde
 *   donde se quedó (los ya guardados más el cupo).
 * - Al día: los más recientes en una ventana que basta para llegar a los ya guardados (índice); si toda la ventana son
 *   comentarios nuevos, se amplía (sin pasar del cupo). Instagram y TikTok no permiten ordenar: se recorren y se suman
 *   los nuevos.
 */
export interface Plan { mode: 'full' | 'catch' | 'inc'; fb: { order: 'all' | 'rec'; limit: number } | null; quota: number }
export const INC_WINDOW = 150
export function planFor(p: Pick<Post, 'platform'>, st: { known: number; total?: number | null }, policy: number, window = INC_WINDOW): Plan {
  const quota = policy   // 0 = sin límite
  if (!st.known) return { mode: 'full', fb: { order: 'all', limit: quota }, quota }
  const backlog = !!st.total && st.known < st.total * 0.97
  if (backlog || p.platform !== 'facebook') return { mode: backlog ? 'catch' : 'inc', fb: { order: 'all', limit: quota ? st.known + quota : 0 }, quota }
  return { mode: 'inc', fb: { order: 'rec', limit: quota ? Math.min(quota, window) : window }, quota }
}
/** Con «al día»: ¿hay que ampliar la ventana? (todo lo leído era nuevo y se llegó al tope de la ventana, sin pasar del cupo) */
export const needsWider = (plan: Plan, got: number, overlap: number) =>
  plan.mode === 'inc' && plan.fb?.order === 'rec' && overlap === 0 && got >= plan.fb.limit && (!plan.quota || plan.fb.limit < plan.quota)

async function collectPost(t: Tracking, p: Post, it: TrackItem, onProg: (u: Record<string, unknown>) => void, plan?: Plan) {
  if (!useExtension.getState().extractor) throw new Error('La extensión de Chrome no está instalada o no responde. Instálala (Ajustes › Extensión) y recarga la página.')
  const fb = plan ? plan.fb : p.platform === 'facebook' ? { order: 'all' as const, limit: t.fbLimit ?? 1500 } : null
  it.order = fb ? fb.order : null; it.limit = fb ? fb.limit : 0
  const job = extExtract(p.url, (m) => onProg({ phase: m.phase, count: m.count, total: m.total, note: m.note }), fb)
  const C = ctl(t.id)
  C.job = job.jobId
  it.jobId = job.jobId
  await DB.put('trackings', t).catch(() => {})
  let ckN = 0
  const ck = setInterval(() => {
    const j = jobs.get(job.jobId)
    if (j && j.acc.length > ckN) { ckN = j.acc.length; idbSet(ckKey(t.id, p.id), j.acc, ckStore()).catch(() => {}) }
  }, 4000)
  let r: ExtResult
  try { r = await job.promise } finally { clearInterval(ck); delete it.jobId; idbDel(ckKey(t.id, p.id), ckStore()).catch(() => {}) }
  C.job = null
  if (!r.data && r.acc?.length) r.data = { source: 'social-dom-extractor', platform: p.platform, version: 3, url: p.url, title: p.title || '', comments: r.acc }
  if (r.closed) {
    onProg({ note: 'Se cerró la ventana de extracción: se da por terminada con lo recogido.' })
    return { parsed: r.data ? fromExtractor(r.data) : { meta: { platform: p.platform, url: p.url }, comments: [] }, partial: false }
  }
  if (r.watchdog && !C.stopReq) {
    if (r.data && ((r.data.comments as unknown[]) || []).length) { await storeResult(t, p, fromExtractor(r.data), 'extension', true); Object.assign(it, { status: 'running', partial: true }) }
    throw new Error('La extensión dejó de dar noticias durante varios minutos; se guardó lo recogido y se reintenta.')
  }
  if (r.stopped && !r.data) return { stopped: true as const }
  if (!r.data) throw new Error('La extensión no devolvió datos.')
  if (r.data.cambioDePublicacion) onProg({ note: 'La página cambió de publicación durante la extracción; se guardó solo lo de la original.' })
  if (!r.stopped && !((r.data.comments as unknown[]) || []).length) throw Object.assign(new Error('No se encontraron comentarios: la sección de comentarios no se abrió o la red cambió su diseño. Reintenta; si sigue fallando, copia el diagnóstico y envíalo.'), { diag: r.data.diag })
  return { parsed: fromExtractor(r.data), partial: !!r.stopped, stopped: !!r.stopped && C.stopReq }
}

function notifyDesk(title: string, body: string, link?: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
    const n = new Notification(title, { body, tag: 'snm-tracking' })
    // al pulsarla se vuelve a la app y, si hay enlace, se abre el seguimiento en el historial
    n.onclick = () => { window.focus(); if (link) location.hash = link; n.close() }
  } catch { /* */ }
}

/** Enlace a un seguimiento en Historial › Seguimientos de comentarios. */
export const historyLink = (tid: string) => `#/historial?tab=seg&t=${encodeURIComponent(tid)}`

export async function runTracking(tid: string) {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* */ }
  const st = useTR.getState()
  if (st.runs.includes(tid)) { setTrackBg(tid, false); return }   // ya está en curso: se trae al frente
  const t = st.tracks.find((x) => x.id === tid)
  if (!t) return
  // el seguimiento es continuo: si la última vuelta terminó, empieza otra (solo traerá los comentarios nuevos)
  const fresh = t.status === 'done' || t.status === 'draft' || !t.postIds.some((id) => ['pending', 'running', 'error'].includes(t.items[id]?.status))
  if (fresh) t.postIds.forEach((id) => { const it = (t.items[id] ||= { status: 'pending', count: 0 }); Object.assign(it, { status: 'pending', newCount: 0, error: '', partial: false }); delete it.diag })
  const pend = t.postIds.map((id) => st.posts.find((p) => p.id === id)).filter((p): p is Post => !!p && !['done', 'skipped'].includes(t.items[p.id]?.status))
  if (!useExtension.getState().extractor && pend.length) { toast('Para extraer automáticamente necesitas la extensión de Chrome (Ajustes › Extensión).'); return }
  await refreshSessions()
  const miss = missingAuth(pend)
  if (miss.length) { toast(`Inicia sesión en ${miss.map(platName).join(', ')} en este navegador para iniciar el seguimiento.`); return }
  const RUN = ctl(tid)
  Object.assign(RUN, { stopReq: false, halt: null, retryNow: false, job: null })
  setRuns((ids) => [...ids, tid])
  setTrackBg(tid, false)   // se muestra en la ventana flotante; si había otro, pasa a segundo plano
  if (useTR.getState().runs.length > 1) toast(`Seguimientos en paralelo: ${useTR.getState().runs.length} en curso. Se turnan publicación a publicación en la misma ventana.`, 'stacks')
  delete t.halt; delete t.interrupted
  t.status = 'running'; t.startedAt ||= new Date().toISOString()
  const roundStart = new Date().toISOString()
  await putTracking(t)
  const opts = extOpts(), gap = opts.gap * 1000
  let last = 0
  const save = () => { const now = Date.now(); if (now - last > 1500) { last = now; DB.put('trackings', t).catch(() => {}) } bump() }

  for (const id of t.postIds) {
    if (RUN.stopReq) break
    const it = t.items[id], p = useTR.getState().posts.find((x) => x.id === id)
    if (!p) { it.status = 'skipped'; continue }
    if (['done', 'skipped'].includes(it.status)) continue
    // plan: todos la primera vez; después, solo los nuevos (a partir del índice de la publicación)
    const pc = await DB.pc(p.id).catch(() => ({ comments: [] as RawComment[], cursor: undefined }))
    const knownKeys = new Set(pc.comments.map(resKey))
    const policy = t.fbLimit ?? 1500
    let plan = planFor(p, { known: knownKeys.size, total: pc.cursor?.total }, policy)
    const cupo = plan.quota ? ` · hasta ${plan.quota.toLocaleString('es')} en esta extracción` : ''
    Object.assign(it, { status: 'running', count: 0, total: null, phase: '', error: '', method: 'extension', mode: plan.mode, startedAt: new Date().toISOString(),
      note: plan.mode === 'full' ? `Primera vez: se extraen todos los comentarios${cupo}` : plan.mode === 'catch' ? `Continúa con los que faltan (ya hay ${knownKeys.size.toLocaleString('es')})${cupo}` : `Solo los nuevos (ya hay ${knownKeys.size.toLocaleString('es')})${cupo}` })
    bump()
    try {
      let r: Awaited<ReturnType<typeof collectPost>>, attempt = 0
      delete it.retry; it.attempts = 0
      for (;;) {
        attempt++; it.attempts = attempt
        try {
          // turno en la ventana de extracción (compartida con los demás seguimientos en curso)
          const busy = useTR.getState().runs.length > 1
          if (busy) { it.phase = ''; it.note = 'Esperando turno: otro seguimiento está usando la ventana de extracción…'; bump() }
          const release = await takeTurn()
          try {
            if (RUN.stopReq) throw Object.assign(new Error('Detenido'), { name: 'AbortError' })
            // pausa entre publicaciones, común a todos (±50 %) y, en modo prudente, una pausa larga cada 5 publicaciones
            let wait = EXT.lastEnd && gap ? EXT.lastEnd + gap * (0.5 + Math.random()) - Date.now() : 0
            if (opts.careful && EXT.count && EXT.count % 5 === 0) wait += 30000 + Math.random() * 30000
            const end = Date.now() + Math.max(0, wait)
            if (wait > 0) { it.note = 'Pausa entre publicaciones…'; bump() }
            while (!RUN.stopReq && Date.now() < end) await wsleep(Math.min(500, end - Date.now()))
            if (RUN.stopReq) throw Object.assign(new Error('Detenido'), { name: 'AbortError' })
            it.note = plan.mode === 'full' ? 'Primera vez: se extraen todos los comentarios' : plan.mode === 'catch' ? 'Continúa con los que faltan' : 'Solo los nuevos'
            r = await collectPost(t, p, it, (u) => {
              if (u.phase) it.phase = u.phase as TrackItem['phase']
              if (u.count != null) it.count = Number(u.count)
              if (u.total) it.total = Number(u.total)
              if (u.note) it.note = String(u.note)
              save()
            }, plan)
          } finally { EXT.lastEnd = Date.now(); EXT.count++; release() }
          // continuación: si todo lo leído era nuevo y se llegó al tope de la ventana, faltan comentarios: se amplía
          if ('parsed' in r && r.parsed && !('stopped' in r && r.stopped)) {
            uniqueIds(r.parsed, p.id)
            const overlap = r.parsed.comments.filter((c) => knownKeys.has(resKey(c))).length
            if (needsWider(plan, r.parsed.comments.length, overlap) && attempt < opts.retries) {
              await storeResult(t, p, r.parsed, 'extension', true)
              r.parsed.comments.forEach((c) => knownKeys.add(resKey(c)))
              const wider = plan.fb!.limit * 4
              plan = { ...plan, fb: { ...plan.fb!, limit: plan.quota ? Math.min(plan.quota, wider) : wider } }
              Object.assign(it, { status: 'running', note: `Hay más comentarios nuevos: ampliando a ${plan.fb!.limit.toLocaleString('es')}…`, count: 0 })
              continue
            }
          }
          delete it.retry
          break
        } catch (err) {
          const e = err as Error & { exhausted?: boolean; attempts?: number }
          if (e.name === 'AbortError' || RUN.stopReq || !isRetryable(e)) throw e
          if (attempt >= opts.retries) { e.exhausted = true; e.attempts = attempt; throw e }
          const ms = retryDelay(attempt, opts.retryBase)
          it.retry = { attempt: attempt + 1, max: opts.retries, error: e.message, left: Math.ceil(ms / 1000) }
          Object.assign(it, { phase: 'retry', count: 0, total: null })
          await DB.put('trackings', t).catch(() => {})
          const end = Date.now() + ms
          RUN.retryNow = false
          while (!RUN.stopReq && !RUN.retryNow && (Date.now() < end || !navigator.onLine)) {
            it.retry.left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); it.retry.offline = !navigator.onLine
            bump()
            await wsleep(Math.min(1000, Math.max(10, end - Date.now())))
          }
          if (RUN.stopReq) throw Object.assign(new Error('Detenido'), { name: 'AbortError' })
          it.phase = ''
        }
      }
      if ('stopped' in r! && r.stopped && !('parsed' in r!)) it.status = 'pending'
      else if ('parsed' in r!) {
        const res = r as { parsed: Parsed; partial: boolean; stopped?: boolean }
        if ((res.stopped || (RUN.stopReq && res.partial)) && res.parsed.comments.length) { await storeResult(t, p, res.parsed, 'extension', true); it.status = 'pending'; it.partial = true }
        else {
          if (res.parsed.meta.netTotal) it.total = res.parsed.meta.netTotal
          it.limitReached = !!res.parsed.meta.order?.alcanzado
          it.diag = res.parsed.meta.diag || null
          await storeResult(t, p, res.parsed, 'extension', res.partial)
          // ¿quedan comentarios por extraer? (se llegó al cupo de esta extracción y la red tiene más)
          it.more = !!it.total && (it.count || 0) < it.total * 0.97
        }
      }
    } catch (err) {
      const e = err as Error & { exhausted?: boolean; attempts?: number; diag?: unknown }
      if (e.name === 'AbortError' || (RUN.stopReq && !RUN.halt)) it.status = 'pending'
      else {
        it.status = 'error'; it.diag = e.diag || null
        it.error = e.exhausted ? `${e.message} (sin éxito tras ${countTxt(e.attempts!, 'intento', 'intentos')})` : e.message
        if (e.exhausted || isFatal(e)) { RUN.stopReq = true; RUN.halt = { post: postLabel(p), error: it.error } }
      }
    }
    delete it.retry
    it.phase = ''
    await putTracking(t)
  }

  const pr = trackProgress(t), left = t.postIds.some((id) => t.items[id].status === 'pending')
  // registro de la vuelta: cuántas publicaciones se revisaron y cuántos comentarios nuevos aparecieron
  const touched = t.postIds.filter((id) => (t.items[id]?.finishedAt || '') >= roundStart)
  if (touched.length) {
    const newComments = touched.reduce((a, id) => a + (t.items[id].newCount || 0), 0)
    t.rounds = [...(t.rounds || []), { at: new Date().toISOString(), posts: touched.length, newComments }].slice(-200)
  }
  if (RUN.halt) { t.status = 'paused'; t.halt = { ...RUN.halt, at: new Date().toISOString() }; toast(`Extracción detenida: «${RUN.halt.post}» falló. Revisa la conexión o la sesión y pulsa Continuar.`) }
  else if (RUN.stopReq || left) { t.status = 'paused'; toast(pr.comments ? `Seguimiento en pausa: ${countTxt(pr.comments, 'comentario guardado', 'comentarios guardados')}. Pulsa Continuar cuando quieras.` : `Seguimiento en pausa: ${pr.done} de ${pr.n} publicaciones`) }
  else if (pr.errors) { t.status = 'paused'; toast(countTxt(pr.errors, 'publicación no se pudo extraer', 'publicaciones no se pudieron extraer') + ': reinténtalas o finaliza el seguimiento') }
  else {
    t.status = 'done'; t.finishedAt = new Date().toISOString()
    const nuevos = t.postIds.reduce((a, id) => a + (t.items[id]?.newCount || 0), 0)
    toast(pr.comments ? `✓ Seguimiento «${t.name}» actualizado: ${countTxt(nuevos, 'comentario nuevo', 'comentarios nuevos')} · ${countTxt(pr.comments, 'comentario', 'comentarios')} en total.` : '⚠ El seguimiento terminó sin comentarios: reintenta las publicaciones.', undefined, { label: 'Ver en el historial', href: historyLink(t.id) })
  }
  if (t.status === 'done') notifyDesk('Seguimiento completado', `${t.name}: ${countTxt(pr.comments, 'comentario', 'comentarios')}. Pulsa para verlo en el historial.`, historyLink(t.id))
  else if (RUN.halt) notifyDesk('Extracción detenida', `${t.name}: ${RUN.halt.error}`)
  setRuns((ids) => ids.filter((x) => x !== tid))
  CTL.delete(tid)
  await putTracking(t)
}

export function stopTracking(tid = useTR.getState().running, saveToHistory = true) {
  if (!tid || !useTR.getState().runs.includes(tid)) return
  const t = useTR.getState().tracks.find((x) => x.id === tid)
  if (t && saveToHistory) t.inHist = true
  const RUN = ctl(tid)
  RUN.stopReq = true
  if (RUN.job) extStop(RUN.job)
  toast('Deteniendo… se guardará lo ya extraído, también lo de la publicación en curso')
}

export async function retryItem(t: Tracking, postId: string) {
  Object.assign(t.items[postId], { status: 'pending', error: '' })
  if (t.status === 'done') t.status = 'paused'
  await putTracking(t)
}
export async function skipItem(t: Tracking, postId: string) { t.items[postId].status = 'skipped'; await putTracking(t) }
/** Archiva un seguimiento: deja de actualizarse y sale de la lista de activos (conserva sus comentarios). */
export async function finishTracking(t: Tracking) {
  t.postIds.forEach((id) => { if (t.items[id].status === 'pending' || t.items[id].status === 'error') t.items[id].status = 'skipped' })
  t.status = 'done'; t.finishedAt ||= new Date().toISOString(); t.archived = true
  await putTracking(t)
}
export async function unarchiveTracking(t: Tracking) { t.archived = false; await putTracking(t) }

/** Añade un comentario (p. ej. una respuesta enviada desde la app) al resultado de un seguimiento. */
export async function appendToResult(tid: string, postId: string, raw: RawComment) {
  const r = await DB.getResult(tid + '|' + postId)
  if (!r) return false
  const { keys: _k, comments, ...rest } = r // eslint-disable-line @typescript-eslint/no-unused-vars
  const list = [...(comments || []), raw]
  await DB.saveResult(rest, list)
  const t = useTR.getState().tracks.find((x) => x.id === tid)
  if (t?.items[postId]) { t.items[postId].count = list.length; t.items[postId].saved = list.length; await putTracking(t) }
  return true
}
