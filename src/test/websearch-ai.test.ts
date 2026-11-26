import { describe, expect, it, vi } from 'vitest'

// IA instalada y simulada: contamos cuántas veces se le consulta
const calls: string[] = []
vi.mock('@/features/ai/engine', async (orig) => {
  const a = await orig<typeof import('@/features/ai/engine')>()
  a.useAI.setState({ installed: true })
  return { ...a, generate: async (_s: string, user: string) => { calls.push(user); return user.includes('¿Cuáles venden') ? '{"competidores":[1]}' : 'Combos a domicilio en el oriente.' } }
})
const hit = (query: string, url: string, title: string, snippet: string, pos = 0) => ({ query, pos, url, title, snippet })
vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  a.useExtension.setState({ publisher: '2.3.3' })
  return {
    ...a,
    publisherCommand: async (cmd: string, job: { queries?: string[]; sites?: { key: string }[] }) => {
      const q = job.queries || []
      if (cmd === 'search') return { ok: true, results: [
        hit(q[2], 'https://claro1.com/', 'Claro Uno · Combos a Cuba', 'Combos de alimentos, carne y aseo con envío a domicilio en Holguín.'),
        hit(q[2], 'https://claro2.com/', 'Claro Dos', 'Tienda online de comida y combos con entrega a domicilio en Granma, Cuba.'),
        hit(q[2], 'https://regalos.com/', 'Regalos', 'Tienda de regalos con envío a Cuba.'),
        hit(q[2], 'https://flores.com/', 'Flores', 'Tienda de flores con envío a Cuba.'),
        hit(q[2], 'https://deportes.com/', 'Deportes', 'Resultados deportivos de la semana.'),
      ] }
      if (cmd === 'sites') return { ok: true, sites: (job.sites || []).map((s) => ({ key: s.key, pages: [] })) }
      return { ok: false }
    },
  }
})

describe('Clasificación rápida de competidores encontrados', () => {
  it('los claros sin IA, los dudosos en una sola consulta', async () => {
    const { researchOnWeb } = await import('@/features/competition/websearch')
    const r = await researchOnWeb({ provinces: ['Holguín', 'Granma'], brand: 'Kanasta24', brandKeys: ['kanasta24'], brandProfile: { coverage: {}, payments: [], deliveryHours: 0, publicPrices: false, reviews: '' }, competitors: [], ignored: [] })
    const classify = calls.filter((c) => c.includes('¿Cuáles venden'))
    expect(classify).toHaveLength(1) // una sola consulta para todos los dudosos
    expect(classify[0]).toMatch(/1\. regalos\.com[\s\S]*2\. flores\.com/)
    expect(classify[0]).not.toMatch(/claro1|claro2|deportes/) // los claros no van a la IA
    expect(r.found.sort()).toEqual(['Claro1', 'Claro2', 'Regalos']) // el nombre sale del dominio cuando el título no lo contiene
  })
})
