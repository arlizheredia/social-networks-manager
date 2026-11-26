import { describe, expect, it } from 'vitest'
import { usePublisher, cleanGroups } from '@/features/publisher/store'
import { groupsByTag, normTag, setGroupTag } from '@/features/publisher/groups'
import { buildGroupsReport } from '@/features/publisher/report'
import { reportTextToHtml } from '@/lib/docexport'
import type { Group } from '@/features/publisher/types'

const g = (id: string, name: string, tags: string[] = []): Group => ({ id, name, url: `https://www.facebook.com/groups/${id}/`, tags, notes: '', active: true, approval: false, created: 0, lastShared: null, nameFixed: false } as Group)

describe('Etiqueta de los grupos (una por grupo)', () => {
  it('reutiliza la etiqueta existente aunque cambien mayúsculas o tildes', () => {
    expect(normTag('  #holguin ', ['Holguín'])).toBe('Holguín')
    expect(normTag('Las  Tunas')).toBe('Las Tunas')
  })
  it('asignar otra etiqueta la reemplaza; null la quita', () => {
    usePublisher.setState({ groups: [g('1', 'Compras Holguín'), g('2', 'Ventas Holguín'), g('3', 'Revolico Tunas', ['Las Tunas'])] })
    expect(setGroupTag(['1', '2'], 'Holguín')).toBe(2)
    expect(setGroupTag(['1', '2'], 'holguin')).toBe(0) // ya la tenían
    expect(setGroupTag(['2', '3'], 'Santiago de Cuba')).toBe(2)
    expect(setGroupTag(['1'], null)).toBe(1)
    expect(usePublisher.getState().groups.map((x) => x.tags)).toEqual([[], ['Santiago de Cuba'], ['Santiago de Cuba']])
  })
  it('los grupos guardados con varias etiquetas conservan solo la primera', () => {
    expect(cleanGroups([{ ...g('5', 'X'), tags: ['Holguín', 'Ventas'] }])[0].tags).toEqual(['Holguín'])
  })
  it('agrupa por etiqueta, en orden, y deja al final los que no tienen', () => {
    const secs = groupsByTag([g('1', 'B', ['Holguín']), g('2', 'A', ['Holguín']), g('3', 'C', ['Ventas']), g('4', 'D')])
    expect(secs.map((s) => [s.tag, s.items.map((x) => x.name)])).toEqual([['Holguín', ['A', 'B']], ['Ventas', ['C']], ['Sin etiqueta', ['D']]])
  })
  it('el reporte sale por secciones de etiqueta', () => {
    const t = buildGroupsReport([g('1', 'Compras', ['Holguín']), g('2', 'Ventas', ['Holguín']), g('3', 'Revolico', ['Las Tunas'])], 'all', { link: true, tags: true, notes: false, last: false }, { byTag: true })
    expect(t).toContain('Por etiqueta: Holguín (2), Las Tunas (1)')
    expect(t).toMatch(/Holguín · 2 grupos\n1\. Compras/)
    expect(t).not.toContain('Etiqueta: Holguín') // ya está en el título de la sección
    const html = reportTextToHtml(t)
    expect(html).toContain('<h2>Holguín · 2 grupos</h2>')
    expect(html).toContain('<h2>Las Tunas · 1 grupo</h2>')
  })
})
