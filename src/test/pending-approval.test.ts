import { describe, expect, it, vi } from 'vitest'
vi.mock('idb-keyval', () => ({ createStore: () => 'm', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))

// Facebook responde de tres formas: aviso de aprobación presentado como error, grupo que no permite publicar y publicado
vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  a.useExtension.setState({ publisher: '2.3.5' })
  return {
    ...a,
    publisherCommand: async (cmd: string, job: { groupName?: string }) => {
      if (cmd === 'status') return { ok: true, loggedIn: true, online: true }
      if (cmd !== 'post') return { ok: true }
      if (job.groupName === 'Grupo A') return { ok: false, step: 'publish', error: 'Tu publicación está pendiente de aprobación de un administrador', messages: ['Tu publicación está pendiente de aprobación de un administrador'] }
      if (job.groupName === 'Grupo B') return { ok: false, step: 'group', error: 'Solo los administradores pueden publicar en este grupo', messages: [] }
      return { ok: true }
    },
  }
})

describe('Pendiente de aprobación y grupos que no permiten publicar', () => {
  it('la publicación pendiente de aprobación cuenta como compartida; la que el grupo no permite, como fallida', async () => {
    const { setPub, getPub, DEF_SETTINGS } = await import('@/features/publisher/store')
    const { startRun, useRun } = await import('@/features/publisher/run')
    const { failedItems, reasonOf } = await import('@/features/publisher/logic')
    const g = (id: string, name: string) => ({ id, name, nameFixed: true, url: `https://www.facebook.com/groups/${id}`, tags: [], notes: '', active: true, approval: false, lastShared: null, created: 1 })
    setPub({ groups: [g('a', 'Grupo A'), g('b', 'Grupo B'), g('c', 'Grupo C')], history: [], lock: null, runIds: [], sel: null,
      settings: { ...DEF_SETTINGS, pause: 0, autoMode: true, autoTest: false, autoClose: false, sound: false, sysNotify: false, retries: 1 },
      draft: { url: '', text: 'Hola', name: '' } })
    await startRun()
    await vi.waitFor(() => expect(useRun.getState().runs.every((r) => !r.autoRunning)).toBe(true), { timeout: 3000 })
    const h = getPub().history[0]
    expect(h.items.find((i) => i.name === 'Grupo A')).toMatchObject({ status: 'done', review: 'awaiting' })
    expect(h.items.find((i) => i.name === 'Grupo C')).toMatchObject({ status: 'done' })
    const F = failedItems(h)
    expect(F.map((i) => i.name)).toEqual(['Grupo B'])
    expect(reasonOf(F[0].error)).toBe('el grupo no permite publicar')
    expect(getPub().groups.find((x) => x.id === 'a')!.approval).toBe(true) // se recuerda que ese grupo pide aprobación
  })
})
