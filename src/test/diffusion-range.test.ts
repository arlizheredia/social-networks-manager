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
