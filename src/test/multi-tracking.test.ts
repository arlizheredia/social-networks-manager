import { describe, expect, it, vi } from 'vitest'
import type { Result } from '@/features/comments/db'

const mk = (id: string, text: string) => ({ id, authorName: 'P' + id, text, platform: 'facebook' as const })
const older = [mk('1', 'Excelente servicio'), mk('2', 'Muy buena atención'), mk('3', 'El pedido llegó tarde')]
const newer = [...older, mk('4', 'Todo perfecto, gracias'), mk('5', 'Pésimo, nadie responde')]
const res = (tid: string, comments: unknown[]): Result => ({ key: tid + '|p1', tid, postId: 'p1', date: '2026-11-25', meta: { platform: 'facebook' }, extractedAt: '', method: 'extension', partial: false, comments: comments as Result['comments'] })

vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return { ...a, DB: { ...a.DB, resultsOf: async (tid: string) => (tid === 'A' ? [res('A', older)] : [res('B', newer)]) } }
})
const { useTR } = await import('@/features/comments/tracking')
const { buildReport } = await import('@/features/comments/report')
const { reportHtml } = await import('@/features/comments/reportHtml')

describe('Informe con varios seguimientos', () => {
  it('toma el más reciente como base y lo compara con los demás, sin mezclar comentarios', async () => {
    const base = { status: 'done' as const, date: '2026-11-25', postIds: ['p1'], items: {}, fbOrder: 'all' as const, fbLimit: 0 }
    useTR.setState({
      tracks: [{ ...base, id: 'B', name: 'Tarde', createdAt: '2026-11-25T14:09:00Z', finishedAt: '2026-11-25T14:09:00Z' }, { ...base, id: 'A', name: 'Mañana', createdAt: '2026-11-25T14:03:00Z', finishedAt: '2026-11-25T14:03:00Z' }],
      posts: [{ id: 'p1', url: 'https://www.facebook.com/x/posts/1', platform: 'facebook', name: 'Post', title: '', author: '', addedAt: '', method: 'extension', notes: '' }],
    })
    const m = await buildReport({ tids: ['B', 'A'], focus: '', terms: [], author: '', client: '' })
    expect(m.cur.list.length).toBe(5)                  // base = «Tarde», con sus 5 comentarios
    expect(m.cmp[0]).toMatchObject({ a: 5, b: 3 })     // comparado con «Mañana»
    expect(m.evolution.map((e) => [e.name, e.total, !!e.base])).toEqual([['Tarde', 5, true], ['Mañana', 3, false]])
    expect(m.evolution[1].dTotal).toBe(2)
    const html = reportHtml(m)
    expect(html).toContain('(base)')
    expect(html).toContain('▲ +2')
    // destacados agrupados por publicación: nombre y URL visible
    expect(html).toMatch(/Comentarios positivos destacados<\/h2><h3>Post<\/h3><p class="muted meta"><a href="https:\/\/www.facebook.com\/x\/posts\/1">https:\/\/www.facebook.com\/x\/posts\/1<\/a>/)
  })
})
