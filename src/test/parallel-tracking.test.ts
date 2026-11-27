import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ createStore: () => 's', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))

// almacenamiento de comentarios en memoria
const pcs = new Map<string, { postId: string; comments: Record<string, unknown>[]; updatedAt: string; cursor?: unknown }>()
vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return {
    ...a,
    DB: {
      ...a.DB,
      put: async () => {}, get: async () => undefined, all: async () => [],
      pc: async (pid: string) => pcs.get(pid) || { postId: pid, comments: [], updatedAt: '' },
      getResult: async () => undefined,
      saveResult: async (r: { postId: string }, comments: Record<string, unknown>[]) => {
        const pc = pcs.get(r.postId) || { postId: r.postId, comments: [], updatedAt: '' }
        const { merged, fresh } = a.mergeComments(pc.comments as never, comments as never, new Date().toISOString())
        pcs.set(r.postId, { ...pc, comments: merged as never })
        return { fresh, total: merged.length }
      },
    },
  }
})

// extensión simulada: una extracción tarda un poco; se comprueba que nunca hay dos a la vez
let active = 0, maxActive = 0
const order: string[] = []
vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  a.useExtension.setState({ extractor: '3.0' } as never)
  const listeners = new Set<(m: Record<string, unknown>) => void>()
  return {
    ...a,
    onExtractorMessage: (l: (m: Record<string, unknown>) => void) => { listeners.add(l); return () => listeners.delete(l) },
    extractorSend: (msg: Record<string, unknown>) => {
      const emit = (m: Record<string, unknown>) => setTimeout(() => listeners.forEach((l) => l(m)), 0)
      if (msg.type === 'sessions') return emit({ type: 'sessions', facebook: true, instagram: true, tiktok: true })
      if (msg.type !== 'extract') return
      active++; maxActive = Math.max(maxActive, active); order.push(String(msg.url))
      setTimeout(() => {
        active--
        const n = String(msg.url).slice(-2)
        emit({ type: 'result', jobId: msg.jobId, data: { source: 'social-dom-extractor', platform: 'facebook', url: msg.url, comments: [{ id: n + '-1', authorName: 'A', text: 'Hola ' + n }, { id: n + '-2', authorName: 'B', text: 'Genial ' + n }] } })
      }, 15)
    },
  }
})

describe('Seguimientos en paralelo', () => {
  it('avanzan a la vez y se turnan en la misma ventana de extracción', async () => {
    const { useTR, runTracking } = await import('@/features/comments/tracking')
    const { setPrefs, getPrefs } = await import('@/features/comments/prefs')
    setPrefs({ extract: { ...getPrefs().extract, gap: 0, careful: false } })
    const post = (id: string) => ({ id, url: 'https://www.facebook.com/x/posts/' + id, platform: 'facebook' as const, name: id, title: '', author: '', addedAt: '', method: 'extension' as const, notes: '' })
    const tr = (id: string, postIds: string[]) => ({ id, name: id, createdAt: '2026-11-27T10:00:00Z', status: 'draft' as const, date: '2026-11-27', postIds, items: {}, fbOrder: 'all' as const, fbLimit: 1500 })
    useTR.setState({ posts: ['p1', 'p2', 'p3', 'p4'].map(post), tracks: [tr('A', ['p1', 'p2']), tr('B', ['p3', 'p4'])], loaded: true, sessions: { facebook: true, instagram: true, tiktok: true, known: true } })

    await Promise.all([runTracking('A'), runTracking('B')])
    expect(maxActive).toBe(1)                                   // nunca dos extracciones a la vez
    expect(order.map((u) => u.slice(-2)).slice(0, 2).sort()).toEqual(['p1', 'p3']) // se turnan
    const s = useTR.getState()
    expect(s.runs).toEqual([])
    expect(s.tracks.every((t) => t.status === 'done')).toBe(true)
    expect(s.tracks.find((t) => t.id === 'A')!.items.p1).toMatchObject({ count: 2, newCount: 2, mode: 'full' })
  })
})
