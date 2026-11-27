import { describe, expect, it, vi } from 'vitest'
vi.mock('idb-keyval', () => ({ createStore: () => 's', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))
const { analysisName, createAnalysis, provKey, runsOf, syncAnalyses, useCompetition } = await import('@/features/competition/store')

const rep = (id: string, provinces: string[], createdAt: number) => ({ id, createdAt, from: '2026-11-01', to: '2026-11-20', provinces, brand: 'K', author: '', headline: '', model: {} }) as never

describe('Un análisis de competencia por conjunto de provincias', () => {
  it('la clave no depende del orden y no se puede crear otro con las mismas provincias', () => {
    useCompetition.setState({ analyses: [] })
    expect(provKey(['Holguín', 'Granma'])).toBe(provKey(['Granma', 'Holguín']))
    const a = createAnalysis(['Holguín', 'Granma'], '2026-11-01')
    expect(a.existed).toBe(false)
    const b = createAnalysis(['Granma', 'Holguín'], '2026-10-01')
    expect(b.existed).toBe(true)
    expect(b.analysis.id).toBe(a.analysis.id)
    expect(useCompetition.getState().analyses).toHaveLength(1)
    expect(analysisName(['Las Tunas', 'Granma', 'Holguín', 'Santiago de Cuba', 'Guantánamo'])).toBe('Todo el oriente')
  })
  it('los informes repetidos de las mismas provincias pasan a ser actualizaciones de un único análisis', () => {
    useCompetition.setState({ analyses: [] })
    const list = [rep('r3', ['Holguín'], 3), rep('r2', ['Granma', 'Holguín'], 2), rep('r1', ['Holguín', 'Granma'], 1)]
    syncAnalyses(list)
    const an = useCompetition.getState().analyses
    expect(an.map((a) => a.id).sort()).toEqual([provKey(['Granma', 'Holguín']), provKey(['Holguín'])].sort())
    expect(runsOf(list, an.find((a) => a.provinces.length === 2)!).map((r) => (r as { id: string }).id)).toEqual(['r2', 'r1'])
  })
})
