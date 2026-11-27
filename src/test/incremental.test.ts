import { describe, expect, it } from 'vitest'
import { mergeComments } from '@/features/comments/db'
import { needsWider, planFor } from '@/features/comments/tracking'

const fb = { platform: 'facebook' as const }
describe('Extracción continua con cupo por cada extracción', () => {
  it('primera vez: todos, hasta el cupo', () => {
    expect(planFor(fb, { known: 0 }, 1500)).toEqual({ mode: 'full', fb: { order: 'all', limit: 1500 }, quota: 1500 })
    expect(planFor(fb, { known: 0 }, 0)).toMatchObject({ mode: 'full', fb: { order: 'all', limit: 0 } }) // sin límite
  })
  it('quedan comentarios antiguos: cada extracción sigue el orden de «todos» desde donde se quedó, con un cupo más', () => {
    expect(planFor(fb, { known: 1500, total: 4000 }, 1500)).toEqual({ mode: 'catch', fb: { order: 'all', limit: 3000 }, quota: 1500 })
    expect(planFor(fb, { known: 3000, total: 4000 }, 1500)).toMatchObject({ mode: 'catch', fb: { limit: 4500 } })
  })
  it('al día: los más recientes en una ventana que se amplía sin pasar del cupo', () => {
    const p = planFor(fb, { known: 320, total: 320 }, 1500)
    expect(p).toEqual({ mode: 'inc', fb: { order: 'rec', limit: 150 }, quota: 1500 })
    expect(needsWider(p, 150, 0)).toBe(true)
    expect(needsWider(p, 150, 3)).toBe(false) // ya llegó a los guardados (índice)
    expect(needsWider(p, 90, 0)).toBe(false)  // no había más
    const chico = planFor(fb, { known: 320, total: 320 }, 100)
    expect(chico.fb!.limit).toBe(100)         // la ventana nunca pasa del cupo
    expect(needsWider(chico, 100, 0)).toBe(false)
  })
  it('Instagram y TikTok: se recorren con el cupo y se suman los nuevos', () => {
    expect(planFor({ platform: 'instagram' }, { known: 50, total: 50 }, 1500)).toMatchObject({ mode: 'inc', fb: { order: 'all', limit: 1550 } })
  })
  it('solo los nuevos toman la fecha de esta extracción; los conocidos conservan la suya', () => {
    const cached = [{ id: 'a', text: 'hola', reactions: 1, extractedAt: '2026-11-20T10:00:00Z' }]
    const r = mergeComments(cached, [{ id: 'a', text: 'hola', reactions: 5 }, { id: 'b', text: 'nuevo' }], '2026-11-27T09:00:00Z')
    expect(r.fresh).toBe(1)
    expect(r.merged.find((c) => c.id === 'a')).toMatchObject({ reactions: 5, extractedAt: '2026-11-20T10:00:00Z' })
    expect(r.merged.find((c) => c.id === 'b')).toMatchObject({ extractedAt: '2026-11-27T09:00:00Z' })
  })
})
