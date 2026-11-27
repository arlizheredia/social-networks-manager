import { describe, expect, it } from 'vitest'
import { usePublisher } from '@/features/publisher/store'
import { buildDiffusionRangeReport, diffusionRangeFileName, entriesIn } from '@/features/publisher/report'
import { reportTextToHtml } from '@/lib/docexport'
import type { HistoryEntry } from '@/features/publisher/types'

const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime()
const item = (gid: string, name: string, d: string, extra: object = {}) => ({ gid, name, url: '', notes: '', status: 'done', at: at(d), ...extra })
const entry = (id: string, d: string, items: object[]): HistoryEntry => ({ id, date: at(d), url: 'https://www.facebook.com/reel/' + id, text: 'Descubriendo a Kanasta24 ' + id, mediaCount: 0, appendUrl: false, items, ack: true } as unknown as HistoryEntry)

describe('Informe de difusión por periodo', () => {
  usePublisher.setState({ history: [
    entry('a', '2026-11-17', [item('g1', 'Compras Holguín', '2026-11-17'), item('g2', 'Ventas Cuba', '2026-11-17')]),
    entry('b', '2026-11-23', [item('g1', 'Compras Holguín', '2026-11-23'), item('g3', 'Revolico', '2026-11-23', { status: 'skipped', error: 'El grupo no permite publicaciones' })]),
    entry('c', '2026-11-30', [item('g2', 'Ventas Cuba', '2026-11-30')]),
  ] })
  it('filtra por rango y resume totales, días y grupos', () => {
    expect(entriesIn('2026-11-17', '2026-11-23').map((h) => h.id).sort()).toEqual(['a', 'b'])
    const t = buildDiffusionRangeReport('2026-11-17', '2026-11-23', ['a', 'b', 'c'], { author: 'Yaimara', brand: 'Kanasta24' })
    expect(t).toMatch(/^Informe de difusión en grupos de Facebook\nPeriodo: del martes, 17 de noviembre de 2026 al lunes, 23 de noviembre de 2026/)
    expect(t).toContain('se difundieron 2 publicaciones en 2 días de actividad')
    expect(t).toContain('se compartieron 3 veces en 2 grupos distintos')
    expect(t).toContain('Actividad por día')
    expect(t).toMatch(/«Compras Holguín»: 2 publicaciones/)
    expect(t).toMatch(/No se pudo compartir en «Revolico»/)
    expect(t).not.toContain('reel/c')
    expect(reportTextToHtml(t)).toContain('<h2>Grupos más usados</h2>')
  })
  it('con un solo día es el informe diario', () => {
    expect(buildDiffusionRangeReport('2026-11-17', '2026-11-17', ['a'], { author: '', brand: '' })).toContain('Fecha: ')
    expect(diffusionRangeFileName('2026-11-17', '2026-11-23')).toBe('Informe de difusión en grupos de Facebook-17-11-2026_a_23-11-2026')
  })
})

describe('Nombre de la publicación en los informes', () => {
  it('se cita por su nombre y enlace', async () => {
    const { entryRef, entryTitle } = await import('@/features/publisher/logic')
    const h = { id: 'a', date: 0, name: 'Combos de Navidad', url: 'https://www.facebook.com/reel/1', text: 'Texto', mediaCount: 0, appendUrl: true, items: [], ack: false }
    expect(entryRef(h)).toBe('«Combos de Navidad» · https://www.facebook.com/reel/1')
    expect(entryTitle(h)).toBe('Combos de Navidad')
    expect(entryRef({ ...h, name: undefined })).toBe('https://www.facebook.com/reel/1')
  })
})

describe('El mismo reel en varias tandas', () => {
  it('cuenta como una sola publicación en el resumen y en el detalle', async () => {
    const { buildDiffusionReport } = await import('@/features/publisher/report')
    const same = (id: string, items: object[], extra: object = {}) => ({ ...entry(id, '2026-11-25', items), url: 'https://www.facebook.com/reel/1452025332928122', ...extra }) as HistoryEntry
    usePublisher.setState({ history: [
      same('x1', [item('g1', 'Compras Holguín', '2026-11-25'), item('g2', 'Ventas Cuba', '2026-11-25')], { name: 'Combos de Navidad' }),
      same('x2', [item('g3', 'Revolico', '2026-11-25'), item('g1', 'Compras Holguín', '2026-11-25')]),
      entry('y', '2026-11-25', [item('g2', 'Ventas Cuba', '2026-11-25')]),
    ] })
    const t = buildDiffusionReport('2026-11-25', ['x1', 'x2', 'y'], { author: '', brand: '' })
    expect(t).toContain('se compartieron 2 publicaciones en 5 grupos')
    expect(t.match(/reel\/1452025332928122/g)).toHaveLength(1)
    expect(t).toContain('1. «Combos de Navidad» · https://www.facebook.com/reel/1452025332928122')
    expect(t).toContain('Grupos en los que se compartió: 3 (4 veces en total)')
  })
})

describe('Listado de grupos en el informe de difusión', () => {
  it('lista cada grupo una vez con su nombre y enlace, también en HTML', async () => {
    const { buildDiffusionReport } = await import('@/features/publisher/report')
    const gi = (gid: string, name: string, extra: object = {}) => ({ ...item(gid, name, '2026-11-26'), url: `https://www.facebook.com/groups/${gid}`, ...extra })
    usePublisher.setState({ history: [
      entry('p1', '2026-11-26', [gi('g1', 'Ventas Cuba'), gi('g2', 'Compras Holguín', { review: 'awaiting' }), gi('g3', 'Revolico', { status: 'skipped', error: 'El grupo no permite publicaciones' })]),
      entry('p2', '2026-11-26', [gi('g1', 'Ventas Cuba')]),
    ] })
    const t = buildDiffusionReport('2026-11-26', ['p1', 'p2'], { author: '', brand: '' })
    expect(t).toContain('Listado de grupos en los que se compartió (2)\n- «Compras Holguín» (en aprobación): https://www.facebook.com/groups/g2\n- «Ventas Cuba» (2 veces): https://www.facebook.com/groups/g1')
    expect(t).not.toMatch(/- «Revolico».*groups\/g3/)
    const html = reportTextToHtml(t)
    expect(html).toContain('<h2>Listado de grupos en los que se compartió (2)</h2>')
    expect(html).toContain('<a href="https://www.facebook.com/groups/g1">https://www.facebook.com/groups/g1</a>')
  })
})
