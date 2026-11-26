import { describe, expect, it } from 'vitest'
import { consolidatedHtml } from '@/features/competition/html'
import type { CompModel } from '@/features/competition/analyze'

const combo = (name: string, price: number, weightLb = 10) => ({ name, price, currency: 'USD', weightLb, items: [], perLb: Math.round((price / weightLb) * 100) / 100, bestSeller: false, url: '' })
function model(gen: string, o: { fag: number; brand: number; extra?: boolean; pollo: number; demand: number }): CompModel {
  const cheapest = [{ who: 'Kanasta24', kind: 'marca' as const, combos: 1, combo: combo('Combo Básico', o.brand) }, { who: 'Fagales Market', kind: 'competidor' as const, combos: 2, combo: combo('Combo Desayuno', o.fag, 7) }]
  return {
    brand: 'Kanasta24', author: '', from: gen.slice(0, 10), to: gen.slice(0, 10), period: gen.slice(0, 10), provinces: ['Santiago de Cuba'], generatedAt: gen, network: 'Facebook',
    sources: { tracks: [], comments: 0 }, summary: [], mainRec: '', threats: [], payEco: { zelle: [], byCompetitor: [], brandHasZelle: false }, prices: [], provinceRows: [],
    social: { total: 0, pos: 0, neg: 0, neu: 0, posPct: 0, negPct: 0, authors: [], themes: [], strong: [], improve: [], reading: [] }, coverageQs: [], evidence: [], proposals: [],
    recommendations: [], pending: [], conclusions: [], annexes: [], detected: [], aiUsed: false,
    combos: {
      cheapest, floor: { who: 'Fagales Market', combo: combo('Combo Desayuno', o.fag, 7) }, bestPerLb: null, perLbRange: null, medianMin: o.fag, avgWeight: 10,
      top: [{ product: 'Pollo', count: o.pollo }, { product: 'Arroz', count: 2 }], brands: o.extra ? [{ brand: 'Ybarra', products: ['Aceite'], count: 1 }] : [], bestSellers: [],
      demanded: [{ product: 'Pollo', count: o.demand }], total: 4, reading: [],
      ladder: [{ who: 'Kanasta24', kind: 'marca', combos: [combo('Combo Básico', o.brand)] }, { who: 'Fagales Market', kind: 'competidor', combos: [combo('Combo Desayuno', o.fag, 7), ...(o.extra ? [combo('Combo Cárnico', 117.65)] : [])] }],
    },
  }
}
const rep = (id: string, m: CompModel) => ({ id, createdAt: Date.parse(m.generatedAt), from: m.from, to: m.to, provinces: m.provinces, brand: m.brand, author: '', headline: '', model: m })

describe('Consolidado: combos, alimentos y precios', () => {
  it('muestra la evolución del mercado, de cada combo, de los alimentos y de la demanda', () => {
    const h = consolidatedHtml([rep('b', model('2026-11-20T10:00:00Z', { fag: 65, brand: 59, extra: true, pollo: 4, demand: 5 })), rep('a', model('2026-11-13T10:00:00Z', { fag: 72, brand: 59, pollo: 2, demand: 2 }))])
    expect(h).toContain('<h2>4. Combos, alimentos y precios</h2>')
    expect(h).toMatch(/La mediana del combo de entrada de la competencia baja de 72 a 65 USD/)
    // combo de entrada de Fagales: lo abarata → rojo (compite mejor)
    expect(h).toMatch(/<td>Fagales Market<\/td><td>72 USD<\/td><td>65 USD <span class="neg">\(▼ -7 USD\)<\/span><\/td>/)
    expect(h).toMatch(/Cambian de precio[\s\S]*Combo Desayuno[\s\S]*65 USD <span class="neg">/)
    expect(h).toMatch(/Combos nuevos[\s\S]*Fagales Market: «Combo Cárnico» · 117.65 USD/)
    expect(h).toMatch(/<td>Pollo<\/td><td>100 % <span class="muted">\(▲ \+50 pp\)<\/span>/)
    expect(h).toMatch(/Marcas nuevas en los combos: Ybarra \(aceite\)/)
    expect(h).toMatch(/4.5 Lo que piden los clientes[\s\S]*<td>Pollo<\/td><td>5 <span class="muted">\(▲ \+3\)<\/span>/)
    expect(h).toMatch(/estuvo por encima de la mediana de la competencia en 0 de 2 informes. En el más reciente está 6 USD por debajo/)
    expect(h).toContain('<h2>8. Conclusión</h2>')
  })
})
