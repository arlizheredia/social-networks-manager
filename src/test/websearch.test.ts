import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/* ---------- Lector de resultados de Google (código de la extensión) ---------- */
describe('Resultados de Google en la extensión', () => {
  const src = readFileSync('extension/publisher.js', 'utf8')
  const fn = src.slice(src.indexOf('function readResults()'), src.indexOf('async function webSearch'))
  const readResults = new Function(fn + '; return readResults')() as () => { challenge: boolean; results: { title: string; url: string; snippet: string }[] }
  it('lee título, dirección real y fragmento; omite anuncios y enlaces de Google', () => {
    document.body.innerHTML = `
      <div id="tads"><div class="g"><a href="https://anuncio.com"><h3>Anuncio</h3></a></div></div>
      <div id="search"><div id="rso">
        <div class="MjjYud"><div class="g"><a href="/url?q=https://fagalesmarket.com/combos&sa=U"><h3>Fagales Market · Combos a Cuba</h3></a><div class="VwiC3b">Entregas en Santiago de Cuba y Guantánamo. Aceptamos Zelle.</div></div></div>
        <div class="MjjYud"><div class="g"><a href="https://www.facebook.com/kanasta24"><h3>Kanasta24 | Facebook</h3></a><div class="VwiC3b">Combos a domicilio.</div></div></div>
        <div class="MjjYud"><div class="g"><a href="https://www.google.com/maps"><h3>Mapas</h3></a></div></div>
      </div></div>`
    const r = readResults()
    expect(r.challenge).toBe(false)
    expect(r.results.map((x) => x.url)).toEqual(['https://fagalesmarket.com/combos', 'https://www.facebook.com/kanasta24'])
    expect(r.results[0]).toMatchObject({ title: 'Fagales Market · Combos a Cuba', snippet: 'Entregas en Santiago de Cuba y Guantánamo. Aceptamos Zelle.' })
  })
  it('detecta la verificación de Google', () => {
    document.body.innerHTML = '<form id="captcha-form"></form><p>Nuestros sistemas han detectado tráfico inusual</p>'
    expect(readResults().challenge).toBe(true)
  })
})

/* ---------- Investigación con la extensión simulada ---------- */
const hit = (query: string, url: string, title: string, snippet: string, pos = 0) => ({ query, pos, url, title, snippet })
vi.mock('@/features/extension/bridge', async (orig) => {
  const a = await orig<typeof import('@/features/extension/bridge')>()
  const store = a.useExtension
  store.setState({ publisher: '2.3.0' })
  return {
    ...a,
    publisherCommand: async (cmd: string, job: { queries?: string[]; sites?: { key: string }[] }) => {
      if (cmd === 'search' && (job.queries || [])[0]?.startsWith('"')) {
        // búsqueda en profundidad de cada competidor
        const q = job.queries || [], fq = q.find((x) => x.includes('Fagales'))!
        return { ok: true, results: [
          hit(fq, 'https://fagalesmarket.com/combos', 'Combos | Fagales Market', 'Combo Cárnico $117.65. Combo Básico $74.25. Pagos con Zelle y PayPal.'),
          hit(fq, 'https://www.trustpilot.com/review/fagalesmarket.com', 'Fagales Market Reviews | Read Customer Service Reviews', 'TrustScore 4.3 de 5 · 120 opiniones: rápidos y serios.'),
        ] }
      }
      if (cmd === 'search') {
        const q = job.queries || []
        const b = q[0], c = q.find((x) => x.includes('combos a domicilio Santiago'))!
        expect(c).toBe('tienda online combos a domicilio Santiago de Cuba OR Guantánamo Cuba')
        return { ok: true, results: [
          hit(b, 'https://kanasta24.com/', 'Kanasta24 · Combos a domicilio en el oriente', 'Entregamos en Santiago y Guantánamo en 24-72 horas.'),
          hit(q[0], 'https://kanasta24.com/pagos', 'Formas de pago · Kanasta24', 'Paga con PayPal o tarjeta.'),
          hit(q[1], 'https://www.trustpilot.com/review/kanasta24.com', 'Kanasta24 Reviews | Trustpilot', 'Kanasta24 tiene 4,5 estrellas: rápidos y serios.'),
          hit(c, 'https://fagalesmarket.com/', 'Fagales Market - Combos a Cuba', 'Combos de alimentos con entrega a domicilio en Santiago de Cuba. Zelle.', 0),
          hit(c, 'https://www.cibercuba.com/noticias/combos', 'Noticias de combos', 'Noticia sobre combos en Cuba.', 1),
          hit(c, 'https://lajabalina.com/', 'La Jabalina | Tienda online', 'Combos y mercado con envío a domicilio a toda Cuba.', 2),
        ] }
      }
      if (cmd === 'sites') return { ok: true, sites: (job.sites || []).map((s) => ({ key: s.key, pages: s.key === 'brand'
        ? [{ url: 'https://kanasta24.com/', title: 'Kanasta24', text: 'Combos a domicilio. Entregamos en Palma Soriano, San Luis y Contramaestre en 24-72 horas. Pagos con PayPal y Zelle. Combo Básico $45, Combo Cárnico $89, Combo Familiar $120.' }]
        : !s.key.includes('.') ? [{ url: 'https://fagalesmarket.com/combos', title: 'Combos | Fagales Market', text: 'Combo Cárnico (carne de res 5 lb, pollo 5 lb) $117.65\nCombo Básico (18 lb + aceite) $74.25\nEntrega en 24 horas.' }]
        : s.key === 'fagalesmarket.com' ? [{ url: 'https://fagalesmarket.com/', title: 'Fagales Market', text: 'Combos de alimentos, carne y aseo con envío a domicilio en Santiago de Cuba y Guantánamo en 24 horas. Aceptamos Zelle y Bizum.' }]
          : [{ url: 'https://lajabalina.com/', title: 'La Jabalina', text: 'Mercado online con envío a domicilio de combos a toda Cuba: Guantánamo, Holguín. Entrega en 5 días.' }] })) }
      return { ok: false }
    },
  }
})

describe('Solo empresas, sitios y páginas de venta', async () => {
  const { isBusinessName, pruneNonBusiness } = await import('@/features/competition/discover')
  const { newCompetitor } = await import('@/features/competition/store')
  it('distingue negocios de personas', () => {
    for (const n of ['Fagales Market', 'La Bodega del Chago', 'DimeCuba', 'Kanasta24', 'iTENCEL', 'Supermarket23', 'Combos Express Holguín', 'tiendaonline.cu', 'Mipyme El Ahorro']) expect(isBusinessName(n), n).toBe(true)
    for (const n of ['Harry Landy Smith', 'Dinna Ramirez Cuevas', 'Pedro Gómez', 'Holguín en fotos', 'Yoiker Fashion Club Led']) expect(isBusinessName(n), n).toBe(false)
  })
  it('el nombre sale del sitio, no del título de la página', async () => {
    const { businessName } = await import('@/features/competition/websearch')
    expect(businessName('cubakilos.com', ['Envío de comida y combos a Las Tunas, Cuba'])).toBe('Cubakilos')
    expect(businessName('dimelocubano.com', ['Combos a Cuba | Dímelo Cubano'])).toBe('Dímelo Cubano')
    expect(businessName('fagalesmarket.com', ['Fagales Market - Combos a Cuba'])).toBe('Fagales Market')
  })
  it('quita las fichas de personas creadas antes, salvo las confirmadas o corregidas', () => {
    const l = [newCompetitor('Harry Landy Smith', { source: 'detectado' }), newCompetitor('Ana Pérez', { source: 'detectado', manual: ['payments'] }), newCompetitor('Fagales Market', { source: 'detectado' })]
    expect(pruneNonBusiness(l).map((c) => c.name)).toEqual(['Ana Pérez', 'Fagales Market'])
  })
})

describe('Investigación en Internet de la marca y la competencia', () => {
  it('reconoce el sitio de la marca, sus reseñas y competidores nuevos por confirmar', async () => {
    const { researchOnWeb, candidatesFrom } = await import('@/features/competition/websearch')
    const r = await researchOnWeb({ provinces: ['Santiago de Cuba', 'Guantánamo'], brand: 'Kanasta24', brandKeys: ['kanasta24', 'kanasta', 'canasta24'],
      brandProfile: { coverage: {}, payments: [], deliveryHours: 0, publicPrices: false, reviews: '' }, competitors: [], ignored: ['La Jabalina'] })
    // la marca: su sitio sin que el usuario lo indique
    expect(r.brandProfile.urls).toEqual(['https://kanasta24.com'])
    expect(r.brandProfile.coverage['Santiago de Cuba']).toMatch(/3 municipios/)
    expect(r.brandProfile.payments).toEqual(expect.arrayContaining(['Zelle', 'PayPal']))
    expect(r.brandProfile.deliveryHours).toBe(72)
    expect(r.brandProfile.publicPrices).toBe(true)
    expect(r.brandProfile.reviews).toMatch(/trustpilot/)
    // competencia: Fagales nuevo y por confirmar; noticias fuera; La Jabalina descartada antes
    const fag = r.competitors.find((c) => /Fagales/.test(c.name))!
    expect(fag).toMatchObject({ status: 'pendiente', source: 'web', url: 'https://fagalesmarket.com' })
    expect(fag.payments).toEqual(expect.arrayContaining(['Zelle', 'Bizum']))
    expect(fag.provinces).toEqual(['Santiago de Cuba', 'Guantánamo'])
    // en profundidad: precios con su producto, calificación de reseñas y pagos
    expect(fag.prices.map((p) => [p.product, p.price])).toEqual(expect.arrayContaining([['Combo Cárnico (carne de res 5 lb, pollo 5 lb)', 117.65], ['Combo Básico (18 lb + aceite)', 74.25]]))
    expect(fag.rating).toBe(4.3)
    // combos de su página: nombre, precio, peso (sumado del contenido) y precio por libra
    const carn = fag.combos?.find((c) => /Cárnico/.test(c.name))
    expect(carn).toMatchObject({ price: 117.65, weightLb: 10, perLb: 11.77 })
    expect(carn?.items.map((i) => i.product)).toEqual(['Carne de res', 'Pollo'])
    expect(fag.reputation).toMatch(/trustpilot\.com \(4\.3\/5\)/)
    expect(fag.payments).toEqual(expect.arrayContaining(['Zelle', 'PayPal', 'Bizum']))
    expect(r.competitors.some((c) => /Jabalina/.test(c.name))).toBe(false)
    expect(r.competitors.some((c) => /cibercuba/i.test(c.url))).toBe(false)
    const { buildQueries, buildBrandQueries } = await import('@/features/competition/websearch')
    expect(buildQueries(['Las Tunas', 'Granma', 'Holguín', 'Santiago de Cuba', 'Guantánamo']).length + buildBrandQueries('Kanasta24', []).length).toBe(4) // búsqueda rápida: 2 de la marca + 2 con las provincias agrupadas
    expect(candidatesFrom([hit('x', 'https://www.facebook.com/x', 'x', '')], { brandDomains: [], brandKeys: [], ignored: [] })).toEqual([])
  })
})

describe('Análisis rápido de los resultados de Google', () => {
  it('las reglas resuelven los casos claros sin la IA', async () => {
    const { ruleVerdict } = await import('@/features/competition/websearch')
    expect(ruleVerdict('Tienda online: combos de alimentos, carne y aseo con envío a domicilio en Santiago de Cuba')).toBe('si')
    expect(ruleVerdict('Noticias de la semana en Cuba: economía y deportes')).toBe('no')
    expect(ruleVerdict('Tienda de regalos con envío a Cuba')).toBe('duda')
  })
})

describe('Buscar de nuevo un competidor desde su ficha', () => {
  it('con el nombre escrito encuentra su sitio, combos, pagos y reseñas; respeta lo corregido', async () => {
    const { researchCompetitor } = await import('@/features/competition/websearch')
    const { newCompetitor } = await import('@/features/competition/store')
    const c = newCompetitor('Fagales Market', { aliases: ['Fagales'], payments: ['Efectivo'], manual: ['payments'] })
    const r = await researchCompetitor(c)
    expect(r.error).toBe('')
    expect(r.competitor.url).toBe('https://fagalesmarket.com')
    expect(r.competitor.rating).toBe(4.3)
    expect(r.competitor.combos?.some((x) => /Cárnico/.test(x.name))).toBe(true)
    expect(r.competitor.payments).toEqual(['Efectivo']) // corregido a mano: no cambia
  })
})

describe('Direcciones de referencia del competidor', () => {
  it('se leen primero (con pestaña si hace falta) y dan su sitio aunque no tenga enlace', async () => {
    const bridge = await import('@/features/extension/bridge')
    const calls: unknown[] = []
    const orig = bridge.publisherCommand
    const spy = vi.spyOn(bridge, 'publisherCommand').mockImplementation(async (cmd, job) => { calls.push({ cmd, job }); return orig(cmd, job) })
    const { researchCompetitor } = await import('@/features/competition/websearch')
    const { newCompetitor } = await import('@/features/competition/store')
    const r = await researchCompetitor(newCompetitor('La Bodega del Chago', { refUrls: ['https://www.facebook.com/labodegadelchago', 'https://bodegachago.com/combos'] }))
    const sites = calls.find((x) => (x as { cmd: string }).cmd === 'sites') as { job: { sites: { key: string; urls: string[]; render?: boolean }[] } } | undefined
    expect(sites?.job.sites[0]).toMatchObject({ key: 'ref', urls: ['https://www.facebook.com/labodegadelchago', 'https://bodegachago.com/combos'], render: true })
    expect(r.competitor.url).toBe('https://bodegachago.com') // la referencia que no es una red social
    spy.mockRestore()
  })
})
