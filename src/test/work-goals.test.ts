import { describe, expect, it } from 'vitest'
import { GOALS, goalStatus, type DayAct } from '@/pages/workGoals'

const now = new Date('2026-11-27T10:00:00')
const map = (days: Record<string, Partial<DayAct>>) => new Map(Object.entries(days).map(([d, a]) => [d, { shares: 0, extractions: 0, reports: 0, ...a }]))
const [pub, seg, comp] = GOALS

describe('Metas de ritmo de trabajo', () => {
  it('cada 2 días: al día, toca hoy y atrasado', () => {
    expect(goalStatus(map({ '2026-11-26': { shares: 3 } }), pub, now)).toMatchObject({ since: 1, left: 1, state: 'ok' })
    expect(goalStatus(map({ '2026-11-25': { shares: 1 } }), pub, now)).toMatchObject({ since: 2, left: 0, state: 'today' })
    expect(goalStatus(map({ '2026-11-22': { extractions: 1 } }), seg, now)).toMatchObject({ since: 5, left: -3, state: 'late' })
    expect(goalStatus(map({}), seg, now)).toMatchObject({ since: null, state: 'late' })
  })
  it('cumplimiento de los últimos 30 días: un día cubre también el siguiente', () => {
    const s = goalStatus(map({ '2026-11-27': { shares: 1 }, '2026-11-25': { shares: 1 } }), pub, now)
    expect(s).toMatchObject({ done: 3, of: 30, unit: 'días' }) // 25 cubre el 25 y el 26; 27 cubre el 27
  })
  it('mensual: meses con al menos un análisis', () => {
    const s = goalStatus(map({ '2026-11-10': { reports: 1 }, '2026-09-02': { reports: 2 } }), comp, now)
    expect(s).toMatchObject({ since: 17, left: 13, state: 'ok', done: 2, of: 6, unit: 'meses' })
  })
})
