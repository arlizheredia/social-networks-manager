import { describe, expect, it, vi } from 'vitest'

// Almacenamiento en memoria en lugar de IndexedDB
const kv = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  createStore: (db: string) => db,
  get: async (k: string, s: string) => kv.get(s + '/' + k),
  set: async (k: string, v: unknown, s: string) => { kv.set(s + '/' + k, v) },
  del: async (k: string, s: string) => { kv.delete(s + '/' + k) },
  entries: async () => [], clear: async () => {}, getMany: async () => [], setMany: async () => {},
}))
const tables: Record<string, Map<string, any>> = { posts: new Map(), trackings: new Map(), results: new Map() }
vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return {
    ...a,
    DB: {
      ...a.DB,
      all: async (t: string) => [...tables[t].values()].map((x) => structuredClone(x)),
      put: async (t: string, v: any) => { tables[t].set(v.id, structuredClone(v)) },
      getResult: async (k: string) => tables.results.get(k),
      saveResult: async (r: any, comments: any[]) => { tables.results.set(r.key, { ...r, comments }) },
    },
  }
})

describe('Recargar la página durante una extracción', () => {
  it('se recuperan los comentarios ya recogidos y el seguimiento queda listo para continuar', async () => {
    const post = { id: 'p1', url: 'https://www.facebook.com/x/posts/1', platform: 'facebook', name: 'Post', addedAt: '2026-11-27' }
    tables.posts.set('p1', post)
    tables.trackings.set('t1', { id: 't1', createdAt: '', status: 'running', name: 'Seguimiento', date: '2026-11-27', postIds: ['p1'], fbOrder: 'all', fbLimit: 0,
      items: { p1: { status: 'running', count: 2, jobId: 'j_1' } } })
    kv.set('snm-ckpt/t1|p1', [{ id: 'c1', authorName: 'Ana', text: 'Buen servicio' }, { id: 'c2', authorName: 'Luis', text: '¿Llegan a Holguín?' }])
    const { loadTR, useTR } = await import('@/features/comments/tracking')
    await loadTR()
    const t = useTR.getState().tracks[0]
    expect(t.status).toBe('paused')
    expect(t.interrupted).toBe(true)
    expect(t.items.p1.status).toBe('pending')
    expect(t.items.p1.partial).toBe(true)
    expect(tables.results.get('t1|p1').comments).toHaveLength(2) // nada se pierde
    expect(kv.has('snm-ckpt/t1|p1')).toBe(false)
  })
})
