import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ createStore: () => 'm', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))

// Extensión simulada: cada publicación tarda un poco; se comprueba que nunca hay dos a la vez
const posts: string[] = []
let active = 0, maxActive = 0
vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  a.useExtension.setState({ publisher: '2.3.5' })
  return {
    ...a,
    publisherCommand: async (cmd: string, job: { groupName?: string; text?: string }) => {
      if (cmd === 'status') return { ok: true, loggedIn: true, online: true }
      if (cmd !== 'post') return { ok: true }
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      posts.push(`${job.text}@${job.groupName}`)
      active--
      return { ok: true }
    },
  }
})

describe('Publicación en grupos en paralelo', () => {
  it('dos publicaciones automáticas avanzan a la vez, por turnos y sin solaparse', async () => {
    const { setPub, getPub, DEF_SETTINGS } = await import('@/features/publisher/store')
    const { startRun, useRun } = await import('@/features/publisher/run')
    const g = (id: string) => ({ id, name: 'Grupo ' + id, nameFixed: true, url: `https://www.facebook.com/groups/${id}`, tags: [], notes: '', active: true, approval: false, lastShared: null, created: 1 })
    setPub({ groups: ['g1', 'g2', 'g3', 'g4'].map(g), history: [], lock: null, runIds: [],
      settings: { ...DEF_SETTINGS, pause: 0, autoMode: true, autoTest: false, autoClose: false, sound: false, sysNotify: false } })

    setPub({ draft: { url: '', text: 'A', name: 'Primera' }, sel: { ids: ['g1', 'g2'], known: ['g1', 'g2', 'g3', 'g4'] } })
    await startRun()
    setPub({ draft: { url: '', text: 'B', name: 'Segunda' }, sel: { ids: ['g3', 'g4'], known: ['g1', 'g2', 'g3', 'g4'] } })
    await startRun()
    expect(useRun.getState().runs).toHaveLength(2)

    await vi.waitFor(() => expect(posts).toHaveLength(4), { timeout: 3000, interval: 20 })
    expect(maxActive).toBe(1)                       // la extensión nunca publica dos a la vez
    expect(posts.slice(0, 2).map((p) => p[0]).sort()).toEqual(['A', 'B']) // se turnan: no termina una antes de empezar la otra
    const hist = getPub().history
    expect(hist).toHaveLength(2)
    expect(hist.every((h) => h.items.every((i) => i.status === 'done'))).toBe(true)
    await vi.waitFor(() => expect(useRun.getState().runs.every((r) => !r.autoRunning)).toBe(true))
  })
})
