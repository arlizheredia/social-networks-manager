import { describe, expect, it, vi } from 'vitest'
import type { PComments } from '@/features/comments/db'

// comentarios con su fecha de extracción (25 y 26 de noviembre) y una publicación ya quitada del seguimiento (p2)
const mk = (id: string, text: string, day: string, extra: object = {}) => ({ id, authorName: 'P' + id, text, platform: 'facebook' as const, extractedAt: `${day}T15:00:00`, ...extra })
const cache: Record<string, unknown[]> = {
  p1: [mk('1', 'Excelente servicio', '2026-11-25'), mk('2', 'Muy buena atención', '2026-11-25'), mk('3', 'El pedido llegó tarde', '2026-11-25'),
    mk('4', 'Todo perfecto, gracias', '2026-11-26'), mk('5', 'Pésimo, nadie responde', '2026-11-26')],
  p2: [mk('9', 'Este no debe salir', '2026-11-26')],
}
vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return { ...a, DB: { ...a.DB, pc: async (pid: string): Promise<PComments> => ({ postId: pid, comments: (cache[pid] || []) as PComments['comments'], updatedAt: '' }) } }
})
const { useTR } = await import('@/features/comments/tracking')
const { buildReport, dayOf, prevRange } = await import('@/features/comments/report')
const { reportHtml } = await import('@/features/comments/reportHtml')

describe('Informe por fecha de los comentarios', () => {
  const base = { status: 'done' as const, date: '2026-11-25', items: {}, fbOrder: 'all' as const, fbLimit: 0 }
  useTR.setState({
    // dos seguimientos con la misma publicación: sus comentarios no se duplican; p2 se quitó de «B» y ya no cuenta
    tracks: [{ ...base, id: 'A', name: 'Ofertas', postIds: ['p1'], createdAt: '2026-11-25T14:03:00Z' }, { ...base, id: 'B', name: 'Reels', postIds: ['p1'], createdAt: '2026-11-25T14:09:00Z' }],
    posts: [{ id: 'p1', url: 'https://www.facebook.com/x/posts/1', platform: 'facebook', name: 'Post', title: '', author: '', addedAt: '', method: 'extension', notes: '' }],
  })

  it('filtra por día de extracción y compara con el periodo anterior', async () => {
    const m = await buildReport({ tids: ['A', 'B'], range: { from: '2026-11-26', to: '2026-11-26', basis: 'extraction' }, focus: '', terms: [], author: '', client: '' })
    expect(m.cur.list.map((c) => c.id).sort()).toEqual(['4', '5'])   // solo los nuevos del 26, sin la publicación quitada
    expect(m.cmp[0]).toMatchObject({ a: 2, b: 3 })                     // frente al 25 (periodo anterior de un día)
    expect(reportHtml(m)).toContain('el periodo anterior')
  })

  it('sin periodo: todos, con la evolución día a día', async () => {
    const m = await buildReport({ tids: ['A', 'B'], range: { basis: 'extraction' }, focus: '', terms: [], author: '', client: '' })
    expect(m.cur.list.length).toBe(5)
    expect(m.evolution.map((e) => [e.total, !!e.base])).toEqual([[2, true], [3, false]])
    expect(m.evolution[0].dTotal).toBe(-1)
    const html = reportHtml(m)
    expect(html).toContain('Evolución por día')
    expect(html).toContain('(último día)')
    expect(html).toMatch(/Comentarios positivos destacados<\/h2><h3>Post<\/h3>/)
  })

  it('la fecha del comentario manda sobre la de extracción, y el periodo anterior dura lo mismo', () => {
    expect(dayOf({ createdAt: '2026-11-20T10:00:00', extractedAt: '2026-11-26T10:00:00' }, 'comment')).toBe('2026-11-20')
    expect(dayOf({ createdAt: '2026-11-20T10:00:00', extractedAt: '2026-11-26T10:00:00' }, 'extraction')).toBe('2026-11-26')
    expect(dayOf({ extractedAt: '2026-11-26T10:00:00' }, 'comment')).toBe('2026-11-26')
    expect(prevRange({ from: '2026-11-20', to: '2026-11-26' })).toMatchObject({ from: '2026-11-13', to: '2026-11-19' })
  })
})
