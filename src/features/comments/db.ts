/**
 * Almacenamiento de seguimientos en IndexedDB. Usa la misma base «sca-db» (v2) que Social Comments Analyzer:
 * en el mismo dominio, la app unificada ve directamente las publicaciones, seguimientos y comentarios ya guardados.
 */
import { norm } from './text'
import type { Meta, Platform, RawComment } from './types'

export interface Post { id: string; url: string; platform: Platform; name: string; title: string; author: string; addedAt: string; method: 'auto' | 'api' | 'extension'; notes: string }
export type ItemStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'
export interface TrackItem {
  status: ItemStatus; count: number; total?: number | null; saved?: number; phase?: '' | 'opening' | 'extracting' | 'retry'; error?: string; method?: string
  startedAt?: string; finishedAt?: string; partial?: boolean; order?: string | null; limit?: number; limitReached?: boolean; diag?: unknown; note?: string; attempts?: number
  retry?: { attempt: number; max: number; error: string; left: number; offline?: boolean }
  /** trabajo de la extensión en curso (para detenerlo si la página se recarga) */
  jobId?: string
}
export interface Tracking {
  id: string; createdAt: string; status: 'draft' | 'running' | 'paused' | 'done'; name: string; date: string; postIds: string[]
  items: Record<string, TrackItem>; fbOrder: 'all' | 'pert' | 'rec'; fbLimit: number; startedAt?: string; finishedAt?: string; inHist?: boolean
  halt?: { post: string; error: string; at: string }
  /** se interrumpió al recargar o cerrar la página: se ofrece continuar */
  interrupted?: boolean
}
export interface Result { key: string; tid: string; postId: string; date: string; meta: Meta; extractedAt: string; method: string; partial: boolean; keys?: string[]; comments?: RawComment[] }
interface PComments { postId: string; comments: RawComment[]; updatedAt: string; url?: string; postAuthor?: string }

export const normName = (s: unknown) => norm(String(s || '').toLowerCase().replace(/^@/, '').replace(/\s+/g, ' ').trim())
/** Clave de un comentario para no duplicarlo al fusionar extracciones. */
export const resKey = (c: RawComment) => (c.id && !/^(x|local)-/.test(String(c.id)) ? 'i:' + c.id : 't:' + normName((c.authorName || '') + ' ' + (c.text || '')).slice(0, 160))
export const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
export const fmtDayIso = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '')

let dbp: Promise<IDBDatabase> | null = null
function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('sca-db', 2)
    r.onupgradeneeded = (e) => {
      const d = r.result
      if (!d.objectStoreNames.contains('posts')) d.createObjectStore('posts', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('trackings')) d.createObjectStore('trackings', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('results')) { const s = d.createObjectStore('results', { keyPath: 'key' }); s.createIndex('tid', 'tid') }
      if (!d.objectStoreNames.contains('pcomments')) d.createObjectStore('pcomments', { keyPath: 'postId' })
      if (e.oldVersion >= 1 && e.oldVersion < 2) migrate(r.transaction!)
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error || new Error('No se pudo abrir la base de datos del navegador.'))
  }))
}
/** Migración v1 → v2: los comentarios pasan al almacén de su publicación y el resultado conserva solo las claves. */
function migrate(tx: IDBTransaction) {
  const rs = tx.objectStore('results'), pcs = tx.objectStore('pcomments'), acc = new Map<string, Map<string, RawComment>>()
  rs.openCursor().onsuccess = (ev) => {
    const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result
    if (cur) {
      const r = cur.value as Result
      if (Array.isArray(r.comments)) {
        const m = acc.get(r.postId) || new Map<string, RawComment>(), keys: string[] = []
        r.comments.forEach((c) => { const k = resKey(c); if (!keys.includes(k)) keys.push(k); m.set(k, m.has(k) ? { ...m.get(k), ...c } : c) })
        acc.set(r.postId, m); r.keys = keys; delete r.comments; cur.update(r)
      }
      cur.continue()
    } else acc.forEach((m, postId) => pcs.put({ postId, comments: [...m.values()], updatedAt: new Date().toISOString() }))
  }
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const d = await open()
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode, { durability: 'relaxed' }), s = t.objectStore(store)
    let out: T
    const r = fn(s)
    if (r) r.onsuccess = () => { out = r.result }
    t.oncomplete = () => res(out)
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error || new Error('Operación cancelada (¿sin espacio?)'))
  })
}

export const DB = {
  all: <T,>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll()),
  get: <T,>(store: string, key: IDBValidKey) => tx<T | undefined>(store, 'readonly', (s) => s.get(key)),
  put: (store: string, val: unknown) => tx<void>(store, 'readwrite', (s) => s.put(val)),
  del: (store: string, key: IDBValidKey) => tx<void>(store, 'readwrite', (s) => s.delete(key)),
  async pc(postId: string): Promise<PComments> { return (await DB.get<PComments>('pcomments', postId)) || { postId, comments: [], updatedAt: '' } },
  async resolve(rs: Result[]) {
    const cache = new Map<string, Map<string, RawComment>>()
    for (const r of rs) {
      if (!r || Array.isArray(r.comments)) continue
      let m = cache.get(r.postId)
      if (!m) { const pc = await DB.pc(r.postId); m = new Map(pc.comments.map((c) => [resKey(c), c])); cache.set(r.postId, m) }
      r.comments = (r.keys || []).map((k) => m!.get(k)).filter(Boolean) as RawComment[]
    }
    return rs
  },
  async getResult(key: string) { const r = await DB.get<Result>('results', key); if (r) await DB.resolve([r]); return r },
  /** Guarda un resultado: los comentarios van al almacén de la publicación (se fusionan) y el resultado guarda sus claves. */
  async saveResult(r: Omit<Result, 'keys' | 'comments'>, comments: RawComment[]) {
    const pc = await DB.pc(r.postId), m = new Map(pc.comments.map((c) => [resKey(c), c])), keys: string[] = [], seen = new Set<string>()
    comments.forEach((c) => { const k = resKey(c); m.set(k, m.has(k) ? { ...m.get(k), ...c } : c); if (!seen.has(k)) { seen.add(k); keys.push(k) } })
    pc.comments = [...m.values()]; pc.updatedAt = new Date().toISOString()
    if (r.meta?.url) pc.url = r.meta.url
    if (r.meta?.postAuthor) pc.postAuthor = r.meta.postAuthor
    await DB.put('pcomments', pc)
    await DB.put('results', { ...r, keys })
  },
  async resultsOfRaw(tid: string): Promise<Result[]> {
    const d = await open()
    return new Promise((res, rej) => { const r = d.transaction('results').objectStore('results').index('tid').getAll(tid); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  },
  async resultsOf(tid: string) { return DB.resolve(await DB.resultsOfRaw(tid)) },
  /** Al eliminar un seguimiento, los comentarios de una publicación solo se borran si ningún otro los usa. */
  async delTracking(tid: string) {
    const mine = await DB.resultsOfRaw(tid), posts = [...new Set(mine.map((r) => r.postId))]
    for (const r of mine) await DB.del('results', r.key)
    await DB.del('trackings', tid)
    const rest = await DB.all<Result>('results')
    for (const pid of posts) if (!rest.some((r) => r.postId === pid)) await DB.del('pcomments', pid)
  },
  async exportAll() {
    const [posts, trackings, results, pcomments] = await Promise.all([DB.all('posts'), DB.all('trackings'), DB.all('results'), DB.all('pcomments')])
    return { posts, trackings, results, pcomments }
  },
}

export function postLabel(p: Pick<Post, 'name' | 'title' | 'url'>) {
  if (p.name) return p.name
  if (p.title && !/^(facebook|instagram|tiktok)$/i.test(p.title)) return p.title
  try { const x = new URL(p.url); return x.hostname.replace(/^www\./, '') + decodeURIComponent(x.pathname).slice(0, 60) } catch { return p.url }
}
