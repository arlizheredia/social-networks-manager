import { describe, expect, it, vi } from 'vitest'
vi.mock('idb-keyval', () => ({ createStore: () => 's', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))
const { finalize } = await import('@/features/comments/normalize')
const { computeTeam } = await import('@/features/comments/analysis')
const { focusPredicate } = await import('@/features/comments/explore')
const { setPrefs, getPrefs } = await import('@/features/comments/prefs')
import type { Comment } from '@/features/comments/types'

describe('Resumen de los comentarios sobre la marca', () => {
  it('incluye los que la nombran, los que hablan de ella sin nombrarla y las respuestas del equipo; deja fuera el resto', () => {
    setPrefs({ report: { ...getPrefs().report, focus: 'Kanasta24 y comentarios relacionados', client: 'Kanasta24', terms: 'Kanasta24' }, team: [], teamPostAuthor: true })
    const list = finalize([
      { id: '1', authorName: 'Ana', text: 'Kanasta 24 son los mejores' },
      { id: '2', authorName: 'Pedro', text: 'Bien caro q estan las cosas, ademas, los envios los cobran bien caro, mi mujer enviaba por ahi, pero son los que tienen el precio mas caro' },
      { id: '3', authorName: 'Kanasta24', text: 'Hola Pedro, escríbenos por privado', parentId: '2' },
      { id: '4', authorName: 'Luis', text: 'Saludos para mi familia en Holguín' },
    ], { platform: 'facebook' }) as Comment[]
    computeTeam(list, 'Kanasta24')
    const pred = focusPredicate({ focus: null, comments: list })!
    expect(list.filter(pred).map((c) => c.id)).toEqual(['1', '2', '3'])
  })
  it('sin enfoque no se filtra', () => {
    setPrefs({ report: { ...getPrefs().report, focus: '' } })
    expect(focusPredicate({ focus: null, comments: [] })).toBeNull()
  })
})
