import { describe, expect, it } from 'vitest'
import { aspectsIn, commentAspects, evaluateAspects } from '@/features/comments/aspects'
import { finalize } from '@/features/comments/normalize'
import { getPrefs, setPrefs } from '@/features/comments/prefs'
import { buildReport, whatsappMessage } from '@/features/comments/report'
import { reportHtml } from '@/features/comments/reportHtml'

const mk = (rows: [string, string][]) => finalize(rows.map(([a, t], i) => ({ id: String(i + 1), authorName: a, text: t, platform: 'facebook' as const })), { platform: 'facebook' })

describe('Aspectos del servicio', () => {
  it('detecta cada aspecto', () => {
    expect(aspectsIn('El pedido llegó en 3 días')).toContain('entrega')
    expect(aspectsIn('Los precios están muy caros')).toContain('precio')
    expect(aspectsIn('No tienen aceite, cuándo vuelve?')).toContain('variedad')
    expect(aspectsIn('No puedo pagar con la tarjeta, la página no carga')).toContain('friccion')
    expect(aspectsIn('Excelente atención, muy amables')).toContain('servicio')
    expect(aspectsIn('Feliz cumpleaños')).toEqual([])
  })
  it('valora cada aspecto con su propia frase', () => {
    const [c] = mk([['Ana', 'Buenos precios, pero la entrega demoró 5 días']])
    const r = Object.fromEntries(commentAspects(c).map((x) => [x.key, x.s]))
    expect(r.precio).toBe('positivo')
    expect(r.entrega).toBe('negativo')
  })
  it('evalúa la marca y aparte lo que gana la competencia', () => {
    setPrefs({ report: { ...getPrefs().report, terms: 'Kanasta24' } })
    const list = mk([
      ['A', 'El pedido llegó tarde, 6 días esperando'], ['B', 'Mi entrega demoró una semana, pésimo'], ['C', 'Todavía no me llega el pedido'],
      ['D', 'Excelente atención, muy amables'], ['E', 'Muy buena atención y productos frescos'],
      ['F', 'Pues a mí me envían todo con La Bodega del Chago, menos de 12 horas. Productos de calidad'],
    ])
    const rivals = list.filter((c) => c.brandStance)
    const ev = evaluateAspects(list, rivals, () => ['La Bodega del Chago'])
    const ent = ev.brand.find((a) => a.key === 'entrega')!, srv = ev.brand.find((a) => a.key === 'servicio')!
    expect(ent).toMatchObject({ neg: 3, verdict: 'debil' })
    expect(srv).toMatchObject({ pos: 2, verdict: 'fortaleza' })
    expect(ev.rivals.find((r) => r.key === 'entrega')).toMatchObject({ favor: 1, rivals: ['La Bodega del Chago'] })
  })
  it('el informe y el WhatsApp lo muestran', async () => {
    const list = mk([['A', 'El pedido llegó tarde, 6 días esperando'], ['B', 'La entrega demoró una semana, pésimo'], ['C', 'Todavía no me llega el pedido'], ['D', 'Excelente atención, muy amables'], ['F', 'Pues a mí me envían todo con La Bodega del Chago, menos de 12 horas. Productos de calidad']])
    const m = await buildReport({ comments: list, focus: '', terms: ['Kanasta24'], author: '', client: 'Kanasta24' })
    const html = reportHtml(m)
    expect(html).toContain('<h2>Evaluación de Kanasta24 por aspecto</h2>')
    expect(html).toMatch(/Tiempos de entrega<\/td>.*Punto débil/)
    expect(html).toContain('A favor de la competencia')
    expect(m.recommendations.some((r) => r.startsWith('Tiempos de entrega:'))).toBe(true)
    const wa = whatsappMessage(m)
    expect(wa).toMatch(/Tiempos de entrega: 0 👍 · 3 👎 ⚠️/)
    expect(wa).toMatch(/Los valoran mejor en: .*tiempos de entrega/)
  })
})
