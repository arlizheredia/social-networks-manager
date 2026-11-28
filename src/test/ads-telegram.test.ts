import { describe, expect, it, vi } from 'vitest'
vi.mock('idb-keyval', () => ({ createStore: () => 's', get: async () => undefined, set: async () => {}, del: async () => {}, entries: async () => [], clear: async () => {}, keys: async () => [], getMany: async () => [], setMany: async () => {} }))

const ADS_TEXT = `Biblioteca de anuncios
~3 resultados
Activo
ID de la biblioteca: 123456789
Comenzó a circular el 12 nov 2026
Plataformas
Ver detalles del anuncio
Fagales Market
Publicidad
Combo Familiar de alimentos 89.99 USD con entrega en 24 horas en Santiago de Cuba
Enviar mensaje
Activo
ID de la biblioteca: 223456789
Comenzó a circular el 20 nov 2026
Ver detalles del anuncio
Fagales Market
Publicidad
Súper Combo cárnico a $117.65, pago con Zelle
Activo
ID de la biblioteca: 323456789
Comenzó a circular el 25 nov 2026
Ver detalles del anuncio
Combos Oriente Express
Publicidad
Combos a domicilio en Holguín desde 49 USD`

const TG_TEXT = `Combos Holguín Express
Combo Básico (18 lb + aceite) $74.25 entrega en Holguín
Súper Combo 5 a $108.90 pago con Zelle
Gracias a todos por su confianza`

vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  a.useExtension.setState({ publisher: '2.3.6' })
  return {
    ...a,
    publisherCommand: async (cmd: string, job: { sites?: { key: string; urls: string[] }[] }) => {
      if (cmd === 'search') return { ok: true, results: [{ query: 'q', pos: 0, url: 'https://t.me/combosholguin', title: 'Combos Holguín Express – Telegram', snippet: 'combos a domicilio' }] }
      if (cmd === 'sites') return { ok: true, sites: (job.sites || []).map((s) => ({ key: s.key, pages: [s.key.startsWith('ads:') ? { url: s.urls[0], title: 'Biblioteca de anuncios', text: ADS_TEXT } : { url: s.urls[0], title: 'Combos Holguín Express – Telegram', text: TG_TEXT }] })) }
      return { ok: false }
    },
  }
})

describe('Biblioteca de anuncios y Telegram', async () => {
  const { parseAdLibrary, adsOf, tgChannel, telegramInfo, researchMoreSources } = await import('@/features/competition/adsTelegram')
  const { newCompetitor } = await import('@/features/competition/store')

  it('interpreta los anuncios: anunciante, fecha y texto', async () => {
    const { ads, total } = parseAdLibrary(ADS_TEXT)
    expect(total).toBe(3)
    expect(ads.map((a) => a.page)).toEqual(['Fagales Market', 'Fagales Market', 'Combos Oriente Express'])
    expect(ads[0].start).toBe('12 nov 2026')
    expect(ads[0].text).toContain('Combo Familiar de alimentos 89.99 USD')
    expect(adsOf(ads, { name: 'Fagales Market', aliases: [] })).toHaveLength(2)
    const { adDate } = await import('@/features/competition/adsTelegram')
    expect(adDate('Nov 12, 2026')).toBe(adDate('12 de noviembre de 2026'))
  })
  it('reconoce los canales de Telegram y lee su catálogo', () => {
    expect(tgChannel('https://t.me/combosholguin')).toBe('combosholguin')
    expect(tgChannel('https://t.me/s/combosholguin?before=10')).toBe('combosholguin')
    expect(tgChannel('https://t.me/joinchat/abc')).toBeNull()
    const info = telegramInfo('combosholguin', { title: 'Combos Holguín Express – Telegram', text: TG_TEXT })
    expect(info.title).toBe('Combos Holguín Express')
    expect(info.prices.map((p) => p.price)).toEqual([74.25, 108.9])
  })
  it('completa las fichas y propone anunciantes y canales nuevos (por confirmar)', async () => {
    const fag = newCompetitor('Fagales Market', { status: 'confirmado', source: 'web' })
    const r = await researchMoreSources({ provinces: ['Holguín'], brandKeys: ['kanasta24'], competitors: [fag], ignored: [], adLibrary: true, telegram: true })
    const f = r.competitors.find((c) => c.name === 'Fagales Market')!
    expect(f.ads).toMatchObject({ active: 2, since: '12 nov 2026' }) // el más antiguo
    expect(f.ads!.prices.map((p) => p.price)).toContain(89.99)
    expect(r.found).toEqual(expect.arrayContaining(['Combos Oriente Express', 'Combos Holguín Express']))
    const tg = r.competitors.find((c) => c.name === 'Combos Holguín Express')!
    expect(tg).toMatchObject({ status: 'pendiente', telegram: { url: 'https://t.me/s/combosholguin' } })
  })
})
