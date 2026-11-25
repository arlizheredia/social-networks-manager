import { describe, expect, it } from 'vitest'
import { applyTeam, demoParsed, useExplore } from '@/features/comments/explore'
import { prepare } from '@/features/comments/normalize'
import { reportHtml } from '@/features/comments/reportHtml'
import { buildReport } from '@/features/comments/report'

describe('Responder comentarios', () => {
  it('recalcular los pendientes no cambia el conjunto cargado (la vista no vuelve al resumen)', () => {
    const { meta, comments } = prepare(demoParsed())
    useExplore.setState({ meta, comments, loadId: 42 })
    const v = useExplore.getState().version
    applyTeam()
    expect(useExplore.getState().version).not.toBe(v)
    expect(useExplore.getState().loadId).toBe(42)
  })
  it('el informe de comentarios no lleva gráficos', async () => {
    const { comments } = prepare(demoParsed())
    const html = reportHtml(await buildReport({ comments, focus: '', terms: [], author: '', client: '' }))
    expect(html).not.toMatch(/class="(chart|bar)/)
  })
})
