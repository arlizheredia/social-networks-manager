import { describe, expect, it } from 'vitest'
import { demoParsed } from '@/features/comments/explore'
import { prepare } from '@/features/comments/normalize'
import { activity } from '@/features/comments/analysis'
import { buildReport } from '@/features/comments/report'
import { reportHtml } from '@/features/comments/reportHtml'

describe('Resumen e informe de comentarios abiertos', () => {
  const { comments } = prepare(demoParsed())
  it('agrupa la actividad con sentimiento y media móvil', () => {
    const a = activity(comments)
    expect(a.per).toBe('hora')
    expect(a.buckets.reduce((s, b) => s + b.n, 0)).toBe(comments.length)
    expect(a.buckets.reduce((s, b) => s + b.pos + b.neu + b.neg, 0)).toBe(comments.length)
    expect(a.peak?.n).toBeGreaterThan(0)
  })
  it('genera el informe sin IA (sin enfoque)', async () => {
    const m = await buildReport({ comments, focus: '', terms: [], author: 'Ana', client: 'Mi Tienda' })
    const html = reportHtml(m)
    expect(html).toContain('<h1>Informe de comentarios</h1>')
    expect(html).toContain('Resumen')
    expect(html).toContain('Conclusiones')
  })
})

import { impactGroups, impactOf, topAuthorsBy } from '@/features/comments/analysis'
describe('Comentarios de mayor impacto', () => {
  const { comments } = prepare(demoParsed())
  it('ordena los grupos por impacto y separa positivos de negativos', () => {
    const pos = impactGroups(comments, 'positivo'), neg = impactGroups(comments, 'negativo')
    expect(pos.length).toBeGreaterThan(0)
    expect(neg.length).toBeGreaterThan(0)
    expect(pos.every((g) => g.items.every((c) => c.sentiment === 'positivo'))).toBe(true)
    expect(neg.every((g) => g.items.every((c) => c.sentiment === 'negativo'))).toBe(true)
    for (let i = 1; i < pos.length; i++) expect(pos[i - 1].impact).toBeGreaterThanOrEqual(pos[i].impact)
    expect(pos[0].rep.authorName).toBe('Ana López')   // 12 reacciones y una respuesta: el de más impacto
    expect(impactOf(pos[0].rep)).toBe(14)
  })
  it('lista a quién más comenta de cada tipo', () => {
    expect(topAuthorsBy(comments, 'negativo').map((a) => a.name)).toContain('Luis Pérez')
  })
})

import { commenters, filtered, setPeople, useExplore } from '@/features/comments/explore'
describe('Filtro por persona', () => {
  it('filtra por varias personas y lista quién comenta en la publicación elegida', () => {
    useExplore.setState({ comments: prepare(demoParsed()).comments })
    const s0 = useExplore.getState()
    expect(commenters(s0).length).toBeGreaterThan(5)
    setPeople(['Ana López', 'Luis Pérez'])
    const { list } = filtered(useExplore.getState(), 0.825)
    expect(new Set(list.map((c) => c.authorName))).toEqual(new Set(['Ana López', 'Luis Pérez']))
    // con una publicación elegida, solo aparecen quienes comentan en ella
    useExplore.setState((s) => ({ f: { ...s.f, post: new Set(['otra-publicacion']) } }))
    expect(commenters(useExplore.getState())).toEqual([])
  })
})

import { applyTeam } from '@/features/comments/explore'
import { getPrefs, setPrefs } from '@/features/comments/prefs'
describe('Comentarios que requieren respuesta', () => {
  it('solo los del enfoque que nadie del equipo respondió', () => {
    const { meta, comments } = prepare(demoParsed())
    setPrefs({ report: { ...getPrefs().report, focus: 'entregas' } })
    useExplore.setState({ meta, comments })
    applyTeam()
    const s = useExplore.getState()
    expect(s.comments.filter((c) => c.needsTeam).map((c) => c.authorName)).toEqual(['Marta Díaz'])
    // sin enfoque, cuentan todos los que nadie del equipo respondió
    setPrefs({ report: { ...getPrefs().report, focus: '' } })
    expect(useExplore.getState().comments.filter((c) => c.needsTeam).length).toBeGreaterThan(1)
  })
})
