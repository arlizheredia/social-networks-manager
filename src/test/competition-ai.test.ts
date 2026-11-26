import { describe, expect, it, vi } from 'vitest'

// la IA (simulada) devuelve el texto fuera de tema de la captura
const ESSAY = 'Para crear un ensayo sin inventar datos, se requiere una serie de técnicas clave: 1. Utilizar información única: Asegúrate de tener todos los datos relevantes sobre la entrada objetivo. 2. Redacción personalizada: Si has encontrado algún dato especial sobre la persona.'
let reply = ESSAY
vi.mock('@/features/ai/engine', async (orig) => {
  const a = await orig<typeof import('@/features/ai/engine')>()
  a.useAI.setState({ installed: true })
  return { ...a, generate: async () => reply }
})
const { buildCompetitionModel } = await import('@/features/competition/analyze')
const { getPrefs, setPrefs } = await import('@/features/comments/prefs')
const { newCompetitor } = await import('@/features/competition/store')

describe('Resumen del informe de competencia con la IA', () => {
  setPrefs({ report: { ...getPrefs().report, client: 'Kanasta24', terms: 'Kanasta24' } })
  const run = () => buildCompetitionModel({ from: '2026-11-14', to: '2026-11-20', provinces: ['Santiago de Cuba'], tids: [],
    competitors: [newCompetitor('Fagales Market', { provinces: ['Santiago de Cuba'], payments: ['Zelle'], deliveryHours: 24, status: 'confirmado' })],
    brandProfile: { coverage: { 'Santiago de Cuba': '8 municipios' }, payments: [], deliveryHours: 48, publicPrices: false, reviews: '' } })
  it('descarta un texto fuera de tema y usa el resumen con los datos', async () => {
    reply = ESSAY
    const m = await run()
    expect(m.aiUsed).toBe(false)
    expect(m.summary.join(' ')).not.toMatch(/ensayo|técnicas clave/)
    expect(m.summary.join(' ')).toMatch(/Fagales Market/)
  })
  it('acepta un resumen que habla de la marca y de la competencia', async () => {
    reply = 'Durante la semana, Kanasta24 mantuvo una conversación favorable en Facebook, aunque Fagales Market presiona en Santiago de Cuba con Zelle y entregas en 24 horas. La prioridad es publicar combos con precio y contenido visibles y comunicar los métodos de pago para la diáspora.'
    const m = await run()
    expect(m.aiUsed).toBe(true)
    expect(m.summary[0]).toBe(reply)
  })
})

describe('Sección 2.4 de combos', () => {
  it('sale siempre; sin combos explica por qué, y los precios guardados cuentan como combos', async () => {
    const { compHtml } = await import('@/features/competition/html')
    const bp = { coverage: {}, payments: [], deliveryHours: 0, publicPrices: false, reviews: '' }
    const none = await buildCompetitionModel({ from: '2026-11-14', to: '2026-11-20', provinces: ['Santiago de Cuba'], tids: [], competitors: [newCompetitor('Fagales Market', { status: 'confirmado' })], brandProfile: bp })
    expect(compHtml(none)).toMatch(/<h3>2.4 Combos de comida<\/h3>\s*<p>No se encontraron combos con precio/)
    const old = await buildCompetitionModel({ from: '2026-11-14', to: '2026-11-20', provinces: ['Santiago de Cuba'], tids: [], competitors: [newCompetitor('Fagales Market', { status: 'confirmado', prices: [{ product: 'Combo Cárnico', price: 117.65, currency: 'USD', note: '' }] })], brandProfile: bp })
    expect(old.combos?.floor).toMatchObject({ who: 'Fagales Market', combo: { name: 'Combo Cárnico', price: 117.65 } })
  })
})
