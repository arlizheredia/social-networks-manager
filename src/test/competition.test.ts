import { describe, expect, it, vi } from 'vitest'
import type { PComments } from '@/features/comments/db'
import { deliveryHoursIn, paymentsIn, placesIn, pricesIn } from '@/features/competition/data'

const mk = (id: string, author: string, text: string, extra: object = {}) => ({ id, authorName: author, text, platform: 'facebook' as const, extractedAt: '2026-11-18T12:00:00.000Z', ...extra })
// publicación de la marca (Kanasta24)
const own = [
  mk('1', 'Julio Aguilera', '5 Estrellas. Kanasta24. Esta sonandooooo, los mejores de Cuba'),
  mk('2', 'Lilianni Lias', 'Kanasta 24 recomendado 100 %, los mejores en oriente'),
  mk('3', 'Dinna Ramirez Cuevas', 'Pues a mí me envían todo con La Bodega del Chago, menos de 12 horas. Productos de calidad'),
  mk('4', 'Pedro Gómez', '¿Llegan a Baracoa? Necesito mandar un combo a mi mamá'),
  mk('5', 'Ana Matos', 'Son los mejores, rapidísimos en la entrega'),
]
// publicación de la página de un competidor que también se sigue
const rival = [
  mk('f1', 'Rosa Díaz', '¿Hacen entregas en Guantánamo? ¿Aceptan Zelle?'),
  mk('f2', 'Fagales Market', 'Sí, aceptamos Zelle y PayPal. Entregamos en 24 horas en Santiago de Cuba y Guantánamo. El combo cárnico sale a $117.65', { parentId: 'f1' }),
  mk('f3', 'Mario León', 'Excelente servicio, muy rápidos y serios'),
  mk('f4', 'Luisa Peña', 'Me llegó el combo incompleto, faltaba el aceite'),
]
// caché de comentarios por publicación (común a los seguimientos que la incluyen)
const pcOf = (postId: string, comments: unknown[]): PComments => ({ postId, comments: comments as PComments['comments'], updatedAt: '', postAuthor: postId === 'p2' ? 'Fagales Market' : 'Kanasta24' })
const cache: Record<string, unknown[]> = { p1: own, p2: rival }
vi.mock('@/features/comments/db', async (orig) => {
  const a = await orig<typeof import('@/features/comments/db')>()
  return { ...a, DB: { ...a.DB, pc: async (pid: string) => pcOf(pid, cache[pid] || []) } }
})
const { useTR } = await import('@/features/comments/tracking')
const { getPrefs, setPrefs } = await import('@/features/comments/prefs')
const { buildCompetitionModel, tracksInRange } = await import('@/features/competition/analyze')
const { compHtml, consolidatedHtml } = await import('@/features/competition/html')

describe('Precios y reseñas en el texto', async () => {
  const { pricedItems, ratingIn } = await import('@/features/competition/data')
  it('solo precios de productos, con palabras completas (no tarifas ni frases cortadas)', () => {
    const text = [
      'Para las misceláneas, el valor asignado a un televisor podría ser, por ejemplo, 300 USD.',
      'A los productos restantes se les aplica un 30% de arancel, equivalente al 30% de 170 USD.',
      'Por ejemplo, los envíos a La Habana tienen un costo de 5 USD.',
      'En caso de la entrega express para La Habana, el costo es de 10 USD.',
      'Los precios de nuestros productos el precio de entrega que, a modo general, va de 10€.',
      'Combo Familiar de alimentos 89.99 USD',
    ].join(' ')
    expect(pricedItems(text)).toEqual([{ product: 'Combo Familiar de alimentos', price: 89.99, currency: 'USD' }])
  })
  it('saca el producto de cada precio y la calificación', () => {
    expect(pricedItems('El combo cárnico sale a $117.65')[0].product).toBe('Combo cárnico')
    expect(pricedItems('Combo Básico (18 lb + aceite) $74.25\nSúper Combo 5 a $108.90')).toEqual([{ product: 'Combo Básico (18 lb + aceite)', price: 74.25, currency: 'USD' }, { product: 'Súper Combo 5', price: 108.9, currency: 'USD' }])
    expect(ratingIn('Calificación de 4.3/5 en Trustpilot')).toBe(4.3)
    expect(ratingIn('TrustScore 1,9')).toBe(1.9)
    expect(ratingIn('Entregas en 24 horas')).toBeNull()
  })
})

describe('Datos de competencia en el texto', () => {
  it('detecta pagos, lugares, precios y plazos', () => {
    expect(paymentsIn('Aceptan Zelle, PayPal y pago contra entrega')).toEqual(['Zelle', 'PayPal', 'Pago contra entrega'])
    expect(placesIn('¿Llegan a Baracoa?')).toEqual([{ place: 'Baracoa', province: 'Guantánamo' }])
    expect(placesIn('Me gusta Colombia')).toEqual([]) // sin contexto de entrega no es un municipio
    expect(pricesIn('Combo a $74.25 y otro de 80 USD').map((p) => p.value)).toEqual([74.25, 80])
    expect(deliveryHoursIn('entregas en 24-72 horas o 5 días')).toEqual([72, 120])
  })
})

describe('Informe de competencia', () => {
  const base = { status: 'done' as const, postIds: ['p1'], items: {}, fbOrder: 'all' as const, fbLimit: 0 }
  useTR.setState({
    tracks: [{ ...base, id: 'A', name: 'Seguimiento lunes', date: '2026-11-17', createdAt: '2026-11-17T10:00:00Z' }, { ...base, postIds: ['p1', 'p2'], id: 'B', name: 'Seguimiento jueves', date: '2026-11-20', createdAt: '2026-11-20T10:00:00Z' }, { ...base, id: 'C', name: 'Otro mes', date: '2026-10-01', createdAt: '2026-10-01T10:00:00Z' }],
    posts: [{ id: 'p1', url: 'https://www.facebook.com/x/posts/1', platform: 'facebook', name: 'Post', title: '', author: '', addedAt: '', method: 'extension', notes: '' }, { id: 'p2', url: 'https://www.facebook.com/fagales/posts/2', platform: 'facebook', name: 'Fagales', title: '', author: '', addedAt: '', method: 'extension', notes: '' }],
  })
  setPrefs({ report: { ...getPrefs().report, client: 'Kanasta24', terms: 'Kanasta24', author: 'Lic. Yaimara Salinas Goite' } })
  const brandProfile = { coverage: { 'Santiago de Cuba': '8 municipios' }, payments: [], deliveryHours: 48, publicPrices: false, reviews: '' }
  const run = (competitors: import('@/features/competition/store').Competitor[] = [], ignored: string[] = []) => {
    let saved = competitors
    return buildCompetitionModel({ from: '2026-11-14', to: '2026-11-20', provinces: ['Santiago de Cuba', 'Guantánamo'], tids: ['A', 'B'], competitors, brandProfile, ignored, onCompetitors: (l) => { saved = l } }).then((m) => ({ m, saved: () => saved }))
  }

  it('la IA crea las fichas de los competidores a partir de los comentarios', async () => {
    const { m, saved } = await run()
    const fag = saved().find((c) => c.name === 'Fagales Market')!
    // datos oficiales de la propia página: pagos, plazo, provincias y precio
    expect(fag).toMatchObject({ source: 'detectado', page: true, payments: ['Zelle', 'PayPal'], deliveryHours: 24 })
    expect(fag.provinces).toEqual(['Santiago de Cuba', 'Guantánamo'])
    expect(fag.prices.map((p) => p.price)).toContain(117.65)
    expect(fag.reputation).toMatch(/a favor/)
    // mencionado por una clienta de la marca
    expect(saved().some((c) => /Bodega del Chago/.test(c.name))).toBe(true)
    expect(m.fichas?.created).toContain('Fagales Market')
    expect(m.threats[0]).toMatchObject({ name: 'Fagales Market', tier: 'alta' })
  })

  it('no crea fichas de personas (autores de publicaciones o nombres en comentarios)', async () => {
    const { findCandidates } = await import('@/features/competition/discover')
    const people = [
      { ...mk('p1', 'Ana', 'Qué lindas fotos'), _postAuthor: 'Holguín en fotos' },
      { ...mk('p2', 'Luis', 'Harry siempre tan bueno'), _postAuthor: 'Harry Landy Smith' },
      { ...mk('p3', 'Rosa', 'Yo le compro a Pedro Gómez, me lo trae en dos horas') },
    ] as unknown as Parameters<typeof findCandidates>[0]
    const { finalize } = await import('@/features/comments/normalize')
    const cs = await findCandidates(finalize(people as never, { platform: 'facebook' }) as never)
    expect(cs.map((c) => c.name)).toEqual([])
  })

  it('informa el porcentaje de avance, siempre hacia delante', async () => {
    const pcts: number[] = []
    await buildCompetitionModel({ from: '2026-11-14', to: '2026-11-20', provinces: ['Santiago de Cuba'], tids: ['A', 'B'], competitors: [], brandProfile, onStep: (_s, p) => { if (p != null) pcts.push(p) } })
    expect(pcts.length).toBeGreaterThan(3)
    expect(pcts.every((p, i) => i === 0 || p >= pcts[i - 1])).toBe(true)
    expect(Math.max(...pcts)).toBeGreaterThanOrEqual(60)
  })

  it('«Lo que dicen» solo incluye comentarios del tema (los de la captura no cuentan)', async () => {
    const { buildCompetitionModel: build } = await import('@/features/competition/analyze')
    const screenshot = [
      mk('s1', 'Chavela Torres', 'Kanasta24, lo máximo, la mejor plataforma, la recomiendo 💯'),
      mk('s2', 'Elizabeth Ayala', 'Excelente Gracias muchas gracias por la calidad y rapidez Bendiciones miles 🙌'),
      mk('s3', 'Ileana Perez', 'Saludos Kanasta 24 amigos Chabeli, Dariel, Marisela ❤️'),
      mk('s4', 'Sarita Rojas', 'Los holguineros somos culturosos por naturaleza!!! Holguín, mi bella ciudad. Cómo te extraño.'),
      mk('s5', 'Roxangela San Martín', 'Que bonito, me gusta esa dinámica. Holguín es una ciudad con gente muy culta.'),
      mk('s6', 'Yenne Guibert', 'Es verdad, ya yo lo hice para guantanamo y las cosas llegaron en tres dias, bien cuidado y fresco.'),
      mk('s7', 'Luis Mora', '¿Aceptan Zelle o solo tarjeta?'),
      mk('s8', 'Ana Ruiz', 'Están muy caros los combos este mes'),
    ]
    const orig = cache.p1
    cache.p1 = screenshot
    try {
      const m = await build({ from: '2026-11-14', to: '2026-11-20', provinces: ['Holguín', 'Guantánamo'], tids: ['A'], competitors: [], brandProfile })
      const ev = Object.fromEntries(m.evidence.map((e) => [e.topic, e.items.map((x) => x.author)]))
      expect(ev['Formas de pago']).toEqual(['Luis Mora'])
      expect(ev['Cobertura y envíos']).toEqual(['Yenne Guibert'])
      expect(ev['Precios y combos']).toEqual(['Ana Ruiz'])
    } finally { cache.p1 = orig }
  })

  it('respeta lo corregido a mano y no recrea lo descartado', async () => {
    const first = (await run()).saved()
    const fag = first.find((c) => c.name === 'Fagales Market')!
    const fixed = first.map((c) => (c.id === fag.id ? { ...c, deliveryHours: 48, manual: ['deliveryHours'] } : c)).filter((c) => !/Bodega del Chago/.test(c.name))
    const { saved } = await run(fixed, ['La Bodega del Chago'])
    expect(saved().find((c) => c.id === fag.id)!.deliveryHours).toBe(48)
    expect(saved().some((c) => /Bodega del Chago/.test(c.name))).toBe(false)
    expect(saved().filter((c) => c.name === 'Fagales Market')).toHaveLength(1) // no se duplica
  })

  it('usa los seguimientos del periodo y arma todas las secciones', async () => {
    const tracks = tracksInRange('2026-11-14', '2026-11-20')
    expect(tracks.map((t) => t.id).sort()).toEqual(['A', 'B'])
    const { m } = await run()
    expect(m.brand).toBe('Kanasta24')
    expect(m.sources.comments).toBe(9)
    expect(m.payEco.zelle).toContain('Fagales Market')
    expect(m.annexes.join(' ')).toMatch(/Fichas creadas por la IA en este informe: .*Fagales Market/)
    // consultas de cobertura y provincia
    expect(m.coverageQs[0]).toMatchObject({ place: 'Baracoa', province: 'Guantánamo', answered: false })
    const gtmo = m.provinceRows.find((r) => r.name === 'Guantánamo')!
    expect(gtmo.weakness).toMatch(/sin cobertura registrada/)
    expect(gtmo.opportunity).toMatch(/responder 1 consulta de cobertura/) // la de la página de Fagales no cuenta para la marca
    // recomendaciones del documento modelo
    expect(m.recommendations.join(' ')).toMatch(/Publicar combos con peso, contenido y precio visibles/)
    expect(m.recommendations.join(' ')).toMatch(/Zelle/)
    expect(m.social.authors.find((a) => a.name === 'Dinna Ramirez Cuevas')?.role).toBe('compara con la competencia')
    const html = compHtml(m)
    const { compFileName } = await import('@/features/competition/components')
    expect(compFileName('Kanasta24', new Date(2026, 10, 26, 14, 5).getTime())).toBe('Informe de la competencia y redes sociales - Kanasta24-26-11-2026 14-05')
    // comparativa: la marca primero, luego los competidores; con tabla y gráficos
    expect(m.comparison?.[0]).toMatchObject({ name: 'Kanasta24', kind: 'marca', provinces: 1, hours: 48 })
    expect(m.comparison?.some((r) => r.name === 'Fagales Market' && r.zelle && r.hours === 24)).toBe(true)
    expect(html).toContain('<h3>2.3 Comparativa</h3>')
    expect(html).not.toMatch(/class="chart|bgcolor=/) // sin gráficos: solo la tabla comparativa
    // combos: el de la página de Fagales («El combo cárnico sale a $117.65»)
    expect(m.combos?.floor).toMatchObject({ who: 'Fagales Market', combo: { name: 'Combo cárnico', price: 117.65 } })
    expect(html).toContain('<h3>2.4 Combos de comida</h3>')
    expect(html).not.toContain('Gestión de la marca')
    expect(html).not.toContain('Pendientes para el próximo informe')
    expect(m.summary.join(' ')).toMatch(/El combo más barato del mercado está en 117.65 USD/)
    expect(html).toMatch(/<th>Combo desde<\/th>/)
    // resumen profesional con los datos
    expect(m.summary.join(' ')).toMatch(/la conversación sobre Kanasta24 en Facebook/)
    expect(m.summary.join(' ')).toMatch(/Fagales Market \(acepta Zelle, entrega en 24 h/)
    expect(m.summary.join(' ')).toMatch(/Kanasta24 tiene .*pero .*no publica combos con precio y contenido/)
    for (const h of ['1. Resumen del periodo', '2. Análisis de la competencia', '3. Consolidación por provincia', '4. Análisis de redes sociales', '5. Propuestas de contenido', '6. Recomendaciones', '7. Conclusiones', '8. Anexos']) expect(html).toContain(h)
    expect(html).toContain('<h1>Informe de la competencia y redes sociales - Kanasta24</h1>')
    // consolidado: el más reciente es la referencia y se compara con el anterior
    const older = structuredClone(m), newer = structuredClone(m)
    older.generatedAt = '2026-11-13T10:00:00Z'; newer.generatedAt = '2026-11-20T10:00:00Z'
    newer.social = { ...newer.social, posPct: older.social.posPct + 10, negPct: Math.max(0, older.social.negPct - 5) }
    newer.comparison = [...(newer.comparison || []), { name: 'Sibucán', kind: 'competidor', threat: 9, provinces: 1, payments: ['Zelle'], zelle: true, hours: 72, minPrice: { value: 69.9, currency: 'USD', product: 'Combo Ahorro' }, rating: null, publicPrices: true }]
    if (newer.combos) newer.combos.floor = { who: 'Sibucán', combo: { name: 'Combo Ahorro', price: 69.9, currency: 'USD', weightLb: 20, items: [], perLb: 3.5, bestSeller: false, url: '' } }
    newer.recommendations = newer.recommendations.slice(1)
    const rep = (id: string, from: string, to: string, model: object) => ({ id, createdAt: Date.now(), from, to, provinces: m.provinces, brand: 'Kanasta24', author: '', headline: '', model })
    const ch = consolidatedHtml([rep('b', '2026-11-16', '2026-11-22', newer), rep('a', '2026-11-09', '2026-11-15', older)])
    expect(ch).toContain('Informe consolidado de la competencia y redes sociales - Kanasta24')
    expect(ch).toMatch(/Informe de referencia \(el más reciente\):<\/b> del 14 al 20 de noviembre de 2026/)
    expect(ch).toMatch(/La opinión sobre Kanasta24 mejora: .*\(\+10 pp\)/)
    expect(ch).toMatch(/Aparece un competidor nuevo: Sibucán/)
    expect(ch).toMatch(/El combo más barato del mercado pasa de 117.65 USD \(Fagales Market\) a 69.9 USD \(Sibucán\)/)
    expect(ch).toMatch(/<td>Opinión a favor<\/td><td>\d+ % <span class="pos">\(▲ \+10 pp\)<\/span><\/td>/)
    expect(ch).toMatch(/<td>Sibucán<\/td><td>Nuevo<\/td>/)
    expect(ch).toMatch(/<td>Fagales Market<\/td><td>Sigue<\/td><td>\d+ <span class="muted">\(=\)<\/span><\/td>/)
    expect(ch).toContain('Ya no aparecen (posiblemente atendidas)')
    expect(ch).toContain('referencia')
  })
})

describe('Ficha de la marca desde su sitio online', async () => {
  const { profileFromSite, mergeBrand } = await import('@/features/competition/brandsite')
  const pages = [
    { url: 'https://kanasta24.com', title: 'Kanasta24 · Combos a domicilio en el oriente', text: 'Combos de alimentos a domicilio. Entregamos en 24-72 horas en Santiago de Cuba, Palma Soriano, San Luis, Contramaestre y Songo-La Maya, y en Guantánamo (cabecera provincial).' },
    { url: 'https://kanasta24.com/pagos', title: 'Formas de pago', text: 'Puedes pagar con Zelle, PayPal o tarjeta Visa/Mastercard. Combo Básico $45. Combo Cárnico $89.99. Combo Familiar 120 USD.' },
    { url: 'https://kanasta24.com/opiniones', title: 'Opiniones', text: 'Lo que dicen nuestros clientes en Trustpilot.' },
  ]
  it('detecta cobertura, pagos, plazo, combos con precio y reseñas', () => {
    const p = profileFromSite(pages)
    expect(p.coverage['Santiago de Cuba']).toMatch(/^4 municipios \(Contramaestre, San Luis, Songo-La Maya, Palma Soriano\)/)
    expect(p.coverage['Guantánamo']).toBeTruthy()
    expect(p.coverage['Holguín']).toBeUndefined()
    expect(p.payments).toEqual(['Zelle', 'PayPal', 'Visa', 'Mastercard', 'Tarjeta']) // «tarjeta Visa/Mastercard»
    expect(p.deliveryHours).toBe(72)
    expect(p.publicPrices).toBe(true)
    expect(p.reviews).toMatch(/Trustpilot/)
  })
  it('no sobrescribe lo corregido a mano', () => {
    const cur = { coverage: {}, payments: ['Transferencia'], deliveryHours: 48, publicPrices: false, reviews: '', manual: ['payments'] }
    const next = mergeBrand(cur, profileFromSite(pages))
    expect(next.payments).toEqual(['Transferencia'])
    expect(next.deliveryHours).toBe(72)
    expect(next.publicPrices).toBe(true)
  })
})

describe('Sitio de la marca: nombres abreviados y evidencia', async () => {
  const { profileFromSite } = await import('@/features/competition/brandsite')
  it('reconoce «Stgo», «Gtmo» y nuevos pagos, y guarda la frase de cada dato', () => {
    const p = profileFromSite([{ url: 'https://x.cu', title: 'Inicio', text: 'Hacemos entregas a domicilio en Stgo y Gtmo en 48 horas.\nAceptamos pagos en MLC, efectivo o Transfermóvil.' }])
    expect(p.coverage).toEqual({ 'Santiago de Cuba': 'Entregas en la provincia', Guantánamo: 'Entregas en la provincia' })
    expect(p.payments).toEqual(['Transferencia', 'MLC', 'Efectivo'])
    expect(p.deliveryHours).toBe(48)
    expect(p.evidence.coverage).toMatch(/Stgo y Gtmo/)
    expect(p.evidence.payments).toMatch(/MLC/)
    expect(p.evidence.deliveryHours).toMatch(/48 horas/)
  })
  it('sin datos no inventa ni marca como detectado', () => {
    const p = profileFromSite([{ url: 'https://x.cu', title: 'Tienda', text: 'Bienvenidos a nuestra tienda online.' }])
    expect(p.coverage).toEqual({})
    expect(p.payments).toEqual([])
    expect(p.evidence).toEqual({})
  })
})
