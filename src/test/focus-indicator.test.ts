import { describe, expect, it, vi } from 'vitest'

// sin IA: el enfoque se decide solo por palabras clave
vi.mock('@/features/comments/analysis', async (orig) => {
  const a = await orig<typeof import('@/features/comments/analysis')>()
  return { ...a, focusMatch: async (list: Parameters<typeof a.focusMatch>[0], q: string) => new Set(list.filter((c) => a.focusKeywords(q).some((k) => a.focusTextOf(c).includes(k))).map(a.fkey)) }
})
const { demoParsed } = await import('@/features/comments/explore')
const { prepare } = await import('@/features/comments/normalize')
const { buildReport } = await import('@/features/comments/report')
const { reportHtml } = await import('@/features/comments/reportHtml')

describe('Indicador del enfoque en el informe', () => {
  it('añade «Comentarios que hablan de <enfoque>» y cuenta todos los revisados', async () => {
    const { comments } = prepare(demoParsed())
    const m = await buildReport({ comments, focus: 'pedido', terms: [], author: '', client: '' })
    const row = m.cmp.find((r) => r.k.startsWith('Comentarios que hablan de'))
    expect(row).toBeTruthy()
    expect(row!.k).toContain(m.focus!.name)
    expect(m.cmp[0].a).toBe(comments.length)
    expect(row!.a).toBeLessThanOrEqual(comments.length)
    expect(reportHtml(m)).toContain(`Comentarios que hablan de ${m.focus!.name}`)
  })
  it('sin enfoque no aparece', async () => {
    const m = await buildReport({ comments: prepare(demoParsed()).comments, focus: '', terms: [], author: '', client: '' })
    expect(m.cmp.some((r) => r.k.startsWith('Comentarios que hablan de'))).toBe(false)
  })
})
