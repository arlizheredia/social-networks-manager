/**
 * Informe de competencia: une las fichas de competidores (lo que se sabe de cada uno) con lo que la gente dice en los
 * comentarios de los seguimientos del periodo. La IA de la app (local, sin Internet) busca por significado en esos
 * comentarios (pagos, cobertura, precios) y redacta el resumen y la lectura de opinión; sin IA se usa texto fijo.
 */
import { brandIn, brandKeys, finalize } from '@/features/comments/normalize'
import { computeTeam, detectRivals, semanticScores } from '@/features/comments/analysis'
import { buildReport, gather } from '@/features/comments/report'
import { getPrefs } from '@/features/comments/prefs'
import { inHistory, useTR, activeIn, trackTs } from '@/features/comments/tracking'
import { normL } from '@/features/comments/text'
import type { Comment } from '@/features/comments/types'
import { generate, useAI } from '@/features/ai/engine'
import { deliveryHoursIn, isProductName, MUNICIPALITIES, PAYMENTS, paymentsIn, placesIn, pricesIn, PROVINCES, type Province } from './data'
import type { BrandProfile, Competitor } from './store'
import { autoFillCompetitors } from './discover'
import { demandedProducts, extractCombos, topBrands, topProducts, validCombo, type Combo } from './combos'

export interface Quote { author: string; text: string; reactions?: number }
export interface Threat {
  name: string; tier: 'alta' | 'media' | 'referencia'; score: number; headline: string; bullets: string[]
  provinces: Province[]; payments: string[]; mentions: number; favor: number
}
export interface CombosInfo {
  /** Combo más barato de cada uno (marca y competidores). */
  cheapest: { who: string; kind: 'marca' | 'competidor' | 'por confirmar'; combos: number; combo: Combo }[]
  floor: { who: string; combo: Combo } | null
  bestPerLb: { who: string; combo: Combo } | null
  perLbRange: [number, number] | null
  medianMin: number | null
  avgWeight: number | null
  top: { product: string; count: number }[]
  brands: { brand: string; products: string[]; count: number }[]
  bestSellers: { who: string; combo: Combo }[]
  demanded: { product: string; count: number }[]
  total: number
  reading: string[]
  /** Todos los combos en USD de cada uno (para la escalera de precios del panel). */
  ladder?: { who: string; kind: 'marca' | 'competidor' | 'por confirmar'; combos: { name: string; price: number; weightLb: number; perLb: number | null }[] }[]
}
export interface CompRow {
  name: string; kind: 'marca' | 'competidor' | 'por confirmar'
  threat: number | null; provinces: number; payments: string[]; zelle: boolean; hours: number
  minPrice: { value: number; currency: string; product: string } | null; rating: number | null; publicPrices: boolean
  /** Provincias con presencia (para la matriz del panel). */
  provList?: Province[]
}
export interface ProvinceRow { name: Province; present: string[]; strongPay: string[]; advantage: string; weakness: string; opportunity: string }
export interface CompModel {
  brand: string; author: string; from: string; to: string; period: string; provinces: Province[]; generatedAt: string; network: string
  sources: { tracks: { name: string; date: string }[]; comments: number }
  /** Publicidad activa (Biblioteca de anuncios de Meta) y canales de Telegram de la competencia. */
  adsTg?: { ads: { name: string; active: number; since: string; sample: string; prices: string }[]; telegram: { name: string; channel: string; url: string; combos: number; prices: string; sample: string }[] }
  summary: string[]; mainRec: string
  threats: Threat[]
  payEco: { zelle: string[]; byCompetitor: { name: string; payments: string[] }[]; brandHasZelle: boolean }
  prices: { competitor: string; product: string; price: string; note: string }[]
  provinceRows: ProvinceRow[]
  social: {
    total: number; pos: number; neg: number; neu: number; posPct: number; negPct: number
    authors: { name: string; role: string; quotes: string[] }[]
    themes: string[]; strong: string[]; improve: string[]; reading: string[]
  }
  coverageQs: { place: string; province: Province; author: string; text: string; answered: boolean }[]
  evidence: { topic: string; items: Quote[] }[]
  proposals: { title: string; text: string; goal: string }[]
  recommendations: string[]; pending: string[]; conclusions: string[]; annexes: string[]
  detected: { name: string; n: number }[]
  /** Fichas que la IA creó o actualizó al generar este informe. */
  fichas?: { created: string[]; updated: string[] }
  /** Ficha de la marca: de qué sitio salió y su propuesta. */
  brandSite?: { urls: string[]; analyzedAt: number | null; summary: string }
  /** Encontrados en Internet, pendientes de confirmar por el usuario. */
  webPending?: { name: string; url: string; provinces: string[]; payments: string[]; why: string }[]
  webInfo?: { found: string[]; refreshed: string[]; blocked: boolean; error: string }
  /** Comparativa de la marca con cada competidor (para la tabla y los gráficos). */
  comparison?: CompRow[]
  /** Combos de comida: precios, pesos, contenido, marcas, más vendidos y lo que piden los clientes. */
  combos?: CombosInfo
  aiUsed: boolean
}

const q = (c: Comment): Quote => ({ author: c.authorName || 'Anónimo', text: c.text.length > 260 ? c.text.slice(0, 257).replace(/\s+\S*$/, '') + '…' : c.text, reactions: c.reactions || 0 })
const longDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
const list = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1])
const model0Period = (a: string, b: string) => periodTxt(a, b)
/** «del 14 al 20 de noviembre de 2026» (abrevia mes y año repetidos). */
export function periodTxt(from: string, to: string) {
  if (from === to) return longDay(from)
  const [y1, m1] = from.split('-'), [y2, m2] = to.split('-'), d = (x: string, o: Intl.DateTimeFormatOptions) => new Date(x + 'T12:00').toLocaleDateString('es', o)
  if (y1 === y2 && m1 === m2) return `del ${+from.slice(8)} al ${longDay(to)}`
  if (y1 === y2) return `del ${d(from, { day: 'numeric', month: 'long' })} al ${longDay(to)}`
  return `del ${longDay(from)} al ${longDay(to)}`
}
const hoursTxt = (h: number) => (!h ? '' : h <= 48 ? `${h} h` : `${Math.round(h / 24)} días`)
const keyOf = (s: string) => normL(s).replace(/^(la|el|los|las)\s+/, '').replace(/[^a-z0-9ñ ]/g, '').trim()

/** Seguimientos con actividad en el periodo (los comentarios se filtran después por su fecha). */
export const tracksInRange = (from: string, to: string) => useTR.getState().tracks.filter((t) => inHistory(t) && activeIn(t, from, to))

export async function buildCompetitionModel(opts: {
  from: string; to: string; provinces: Province[]; tids: string[]; competitors: Competitor[]; brandProfile: BrandProfile
  ignored?: string[]
  webInfo?: CompModel['webInfo']
  /** Progreso: texto del paso y porcentaje (0–100) del informe. */
  onStep?: (s: string, pct?: number) => void
  /** Recibe las fichas creadas o actualizadas por la detección automática (para guardarlas). */
  onCompetitors?: (list: Competitor[]) => void
}): Promise<CompModel> {
  const prefs = getPrefs().report
  const brand = prefs.client || prefs.terms.split(',')[0]?.trim() || 'la marca'
  const aiOn = useAI.getState().installed
  const step = opts.onStep || (() => {})
  const provs = opts.provinces.length ? opts.provinces : [...PROVINCES]

  /* ---------- 1. Comentarios del periodo ---------- */
  step('Reuniendo los comentarios de los seguimientos…', 2)
  let all: Comment[] = []
  const tracks = useTR.getState().tracks.filter((t) => opts.tids.includes(t.id)).sort((a, b) => trackTs(a) - trackTs(b))
  if (tracks.length) {
    // solo los comentarios del periodo del informe (por su fecha), de las publicaciones actuales de cada seguimiento
    const g = await gather(tracks.map((t) => t.id), { from: opts.from, to: opts.to, basis: 'comment' })
    all = finalize(g.comments.map((c, i) => ({ ...c, id: c.id || 'k' + i })), { platform: g.platform })
    computeTeam(all, '')
  }
  // comentarios en publicaciones de la marca (análisis de redes) y en páginas de la competencia (solo para sus fichas)
  const bk = brandKeys()
  const onRivalPage = (c: Comment) => { const pa = String((c as Comment & { _postAuthor?: string })._postAuthor || '').trim(); return !!pa && !brandIn(normL(pa), bk) }
  const own = all.filter((c) => !onRivalPage(c))
  const people = own.filter((c) => !c.isTeam && c.text)
  const everyone = all.filter((c) => !c.isTeam && c.text)
  const cm = own.length ? await buildReport({ comments: own, focus: '', terms: prefs.terms.split(',').map((t) => t.trim()).filter(Boolean), author: prefs.author, client: brand }) : null

  /* ---------- 2. Competidores: la IA los detecta en los comentarios y crea o actualiza sus fichas ---------- */
  step('Buscando a la competencia en los comentarios…', 5)
  const auto = all.length ? await autoFillCompetitors(all, opts.competitors, { ignored: opts.ignored, provinces: provs, onStep: (x, f) => step(x, 5 + 30 * (f ?? 0)) }) : { competitors: opts.competitors, created: [], updated: [] }
  if (auto.created.length || auto.updated.length) opts.onCompetitors?.(auto.competitors)
  // los encontrados en Internet sin confirmar no entran en el ranking: se listan aparte
  const pendingWeb = auto.competitors.filter((c) => c.status === 'pendiente')
  const comps = auto.competitors.filter((c) => c.status !== 'pendiente')
  const names = (c: Competitor) => [c.name, ...c.aliases].map(keyOf).filter((k) => k.length >= 3)
  const mentionsOf = (c: Competitor) => everyone.filter((x) => { const t = keyOf(x.text); return names(c).some((k) => t.includes(k)) || names(c).includes(keyOf(String((x as Comment & { _postAuthor?: string })._postAuthor || ''))) })
  const rivals = own.length ? detectRivals(own) : []
  const known = new Set(comps.flatMap(names))
  const detected = rivals.filter((r) => !known.has(keyOf(r.name)) && !(opts.ignored || []).some((x) => keyOf(x) === keyOf(r.name))).map((r) => ({ name: r.name, n: r.n }))

  /* ---------- 3. Lo que dicen sobre pagos, cobertura y precios ----------
   Cada tema exige sus palabras clave (sin ellas, el comentario no habla del tema). La búsqueda por significado
   solo ordena esos comentarios por pertinencia: no añade otros (sus puntuaciones son parecidas para cualquier texto). */
  const evidence: CompModel['evidence'] = []
  const DELIV = /(llega|llegan|llego|llegaron|llegue|entrega|entregan|entregaron|envio|envios|envian|enviar|enviaron|mandan|mandar|domicilio|cobertura|reparten|hacen entregas|trabajan en|hay servicio|servicio a)/
  const TOPICS = [
    { topic: 'Formas de pago', q: 'formas de pago: Zelle, PayPal, transferencia, tarjeta, pagar desde el exterior',
      re: (t: string) => { const n = normL(t); return paymentsIn(t).length > 0 || /\b(pago|pagos|pagar|pague|pagan|pagamos|cobran|cobraron|cobrar|dinero|remesa|remesas)\b/.test(n) } },
    { topic: 'Cobertura y envíos', q: '¿llegan o hacen entregas a mi municipio? envíos a domicilio y cobertura',
      re: (t: string) => { const n = normL(t); return (placesIn(t).length > 0 && DELIV.test(n)) || /(llegan a|entregan en|envian a|hacen envios|hacen entregas|a domicilio|cobertura)/.test(n) } },
    { topic: 'Precios y combos', q: 'precio de los combos, caro o barato, cuánto cuesta',
      re: (t: string) => pricesIn(t).length > 0 || /\b(precio|precios|caro|cara|caros|caras|barato|barata|baratos|baratas|cuesta|cuestan|costo|costos|vale|valen|carisimo|economico|economicos)\b/.test(normL(t)) },
  ]
  for (const [ti, T] of TOPICS.entries()) {
    step(`Analizando ${T.topic.toLowerCase()}…`, 35 + ti * 8)
    const items = everyone.filter((c) => T.re(c.text))
    let rank = new Map<string, number>()
    if (aiOn && items.length > 1) {
      try {
        const lbl = `Buscando comentarios sobre ${T.topic.toLowerCase()}…`
        rank = await semanticScores(items, T.q, (a, b) => step(lbl, 35 + ti * 8 + (8 * a) / Math.max(1, b)))
      } catch { /* sin IA: orden por reacciones */ }
    }
    if (items.length) evidence.push({ topic: T.topic, items: items.sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0) || (b.reactions || 0) - (a.reactions || 0)).slice(0, 5).map(q) })
  }

  /* ---------- 4. Ranking de amenaza ---------- */
  step('Calculando el nivel de amenaza…', 60)
  const scoreOf = (c: Competitor): Threat => {
    const ms = mentionsOf(c)
    const favor = ms.filter((x) => x.brandStance).length
    const pays = [...new Set([...c.payments, ...ms.flatMap((x) => paymentsIn(x.text))])]
    const hrs = c.deliveryHours || Math.min(...ms.flatMap((x) => deliveryHoursIn(x.text)), Infinity)
    const h = isFinite(hrs) ? hrs : 0
    const inProv = c.provinces.filter((p) => provs.includes(p))
    const mentionProv = [...new Set(ms.flatMap((x) => placesIn(x.text).map((p) => p.province)))].filter((p) => provs.includes(p))
    const presence = [...new Set([...inProv, ...mentionProv])] as Province[]
    const trust = /(primero se entrega|contra entrega|luego se paga|factura|evidencia|foto)/.test(normL(c.model + ' ' + c.coverage)) || pays.includes('Pago contra entrega')
    let score = presence.length * 3 + Math.min(pays.length, 6) + (pays.includes('Zelle') ? 2 : 0) + (h && h <= 24 ? 3 : h && h <= 72 ? 2 : 0) + (trust ? 2 : 0)
      + (c.rating != null ? Math.max(-2, Math.min(2, Math.round((c.rating - 3.5) * 2))) : 0) + Math.min(3, ms.length) + favor * 2
    const B: string[] = []
    if (presence.length) B.push(`Presencia en ${list(presence)}${c.coverage ? ` (${c.coverage})` : ''}.`)
    else B.push(`Sin presencia confirmada en ${list(provs)}${c.coverage ? `; cobertura: ${c.coverage}` : ''}.`)
    if (pays.length) B.push(`Pago: ${pays.join(', ')}.${pays.includes('Zelle') ? ' Elimina la barrera de pago para la diáspora.' : ''}`)
    if (h) B.push(`Plazo de entrega: ${hoursTxt(h)}.`)
    if (c.model) B.push(`Propuesta: ${c.model}.`)
    if (c.rating != null || c.reputation) B.push(`Reputación: ${c.rating != null ? `${c.rating}/5` : ''}${c.rating != null && c.reputation ? ' · ' : ''}${c.reputation.replace(/\.$/, '')}.`)
    if (ms.length) B.push(`En los comentarios: ${ms.length} ${ms.length === 1 ? 'mención' : 'menciones'}${favor ? `, ${favor} a su favor frente a ${brand}` : ''}.`)
    if (c.prices.length) B.push(`Precios publicados: ${c.prices.slice(0, 3).map((p) => `${p.product} ${p.price} ${p.currency}`).join('; ')}.`)
    // publicidad activa: invierte en captar clientes ahora mismo
    if (c.ads?.active) { score += Math.min(3, Math.ceil(c.ads.active / 3)); B.push(`Publicidad activa: ${c.ads.active} ${c.ads.active === 1 ? 'anuncio' : 'anuncios'} en Facebook e Instagram${c.ads.since ? ` (desde el ${c.ads.since})` : ''}.`) }
    if (c.telegram) B.push(`Canal de Telegram: ${c.telegram.title}${c.telegram.combos ? ` (${c.telegram.combos} combos publicados)` : ''}.`)
    if (!presence.length) score = Math.min(score, 4)
    const headline = !presence.length ? 'referencia de modelo, sin presencia confirmada en las provincias elegidas'
      : pays.includes('Zelle') && h && h <= 48 ? 'pago sin fricción y entrega rápida' : trust ? 'modelo de confianza' : favor ? 'lo mencionan como alternativa a ' + brand : c.rating != null && c.rating >= 4 ? 'reputación consolidada' : 'competidor con presencia local'
    return { name: c.name, tier: 'media' as const, score, headline, bullets: B, provinces: presence, payments: pays, mentions: ms.length, favor }
  }
  const threats: Threat[] = comps.map(scoreOf).sort((a, b) => b.score - a.score || b.mentions - a.mentions)
  threats.forEach((t, i) => { t.tier = !t.provinces.length ? 'referencia' : i < 3 && t.score >= 6 ? 'alta' : 'media' })

  /* ---------- 5. Pagos y precios ---------- */
  const bp = opts.brandProfile
  const zelle = threats.filter((t) => t.payments.includes('Zelle') && t.tier !== 'referencia').map((t) => t.name)
  const prices: CompModel['prices'] = []
  // solo precios de productos (los guardados antes del filtro con tarifas o textos cortados se descartan)
  comps.forEach((c) => c.prices.filter((p) => isProductName(p.product)).forEach((p) => prices.push({ competitor: c.name, product: p.product, price: `${p.price} ${p.currency}`, note: p.note })))
  comps.forEach((c) => mentionsOf(c).forEach((x) => pricesIn(x.text).slice(0, 1).filter((p) => !c.prices.some((r) => Math.abs(r.price - p.value) < 0.01)).forEach((p) => prices.push({ competitor: c.name, product: 'Mencionado en comentarios', price: `${p.value} ${p.currency}`, note: `«${q(x).text.slice(0, 90)}» — ${x.authorName}` }))))

  /* ---------- 6. Consolidación por provincia ---------- */
  const hardest = threats.filter((t) => t.tier !== 'referencia')
  const compFastest = Math.min(...comps.filter((c) => c.deliveryHours).map((c) => c.deliveryHours), Infinity)
  const provinceRows: ProvinceRow[] = provs.map((p) => {
    const present = hardest.filter((t) => t.provinces.includes(p))
    const strong = present.filter((t) => t.payments.some((x) => PAYMENTS.find((y) => y.name === x)?.strong)).map((t) => t.name)
    const cov = bp.coverage[p]
    const adv: string[] = [], weak: string[] = [], opp: string[] = []
    if (cov) adv.push(`Cobertura: ${cov}`)
    if (bp.deliveryHours && isFinite(compFastest) && bp.deliveryHours <= compFastest) adv.push(`entrega en ${hoursTxt(bp.deliveryHours)}, más rápida que la competencia (${hoursTxt(compFastest)})`)
    else if (bp.deliveryHours) adv.push(`entrega en ${hoursTxt(bp.deliveryHours)}`)
    if (!cov) weak.push('sin cobertura registrada')
    if (strong.length && !bp.payments.some((x) => PAYMENTS.find((y) => y.name === x)?.strong)) weak.push(`no comunica ${strong.length > 1 ? 'Zelle/PayPal' : 'el pago que ya ofrecen ' + strong[0]}`)
    if (!bp.publicPrices) weak.push('sin combos públicos con precio')
    if (!bp.reviews) weak.push('sin reseñas verificables')
    if (!bp.publicPrices) opp.push('publicar combos con peso, contenido y precio visibles')
    if (weak.some((w) => w.startsWith('no comunica'))) opp.push('comunicar métodos de pago para la diáspora')
    const qs = people.filter((c) => placesIn(c.text).some((x) => x.province === p) && /\?|llegan|entregan|envian|mandan/.test(normL(c.text)))
    if (qs.length) opp.push(`responder ${qs.length} consulta${qs.length === 1 ? '' : 's'} de cobertura`)
    if (present.length && !opp.length) opp.push(`diferenciarse de ${present[0].name}`)
    return { name: p, present: present.map((t) => t.name), strongPay: strong, advantage: adv.join('; ') || '—', weakness: weak.join('; ') || '—', opportunity: opp.join('; ') || '—' }
  })

  /* ---------- 7. Redes sociales ---------- */
  const s = cm?.cur.s || { pos: 0, neg: 0, neu: 0, total: 0 }
  const pct = (a: number) => (s.total ? Math.round((a / s.total) * 100) : 0)
  const fans = new Set((cm?.fans || []).map(([a]) => a)), critics = new Set((cm?.critics || []).map(([a]) => a))
  const authors = (cm?.topAuthors || []).slice(0, 6).map((a) => {
    const mine = people.filter((c) => c.authorName === a.name).sort((x, y) => (y.reactions || 0) - (x.reactions || 0))
    const cmp = mine.some((c) => c.brandStance)
    return { name: a.name, role: cmp ? 'compara con la competencia' : critics.has(a.name) ? 'voz crítica' : fans.has(a.name) ? 'promueve la marca' : 'participa con frecuencia', quotes: mine.slice(0, 2).map((c) => q(c).text) }
  })
  const coverageQs: CompModel['coverageQs'] = []
  people.forEach((c) => placesIn(c.text).filter((x) => provs.includes(x.province)).forEach((x) => {
    if (/\?|llegan|entregan|envian|mandan|cubren|hay servicio/.test(normL(c.text))) coverageQs.push({ place: x.place, province: x.province, author: c.authorName, text: q(c).text, answered: !!c.teamAnswered })
  }))
  const themes = [
    ...(cm?.aspects.brand || []).map((a) => `${a.name}: ${a.n} mención${a.n === 1 ? '' : 'es'}${a.pos || a.neg ? ` (${a.pos} a favor, ${a.neg} en contra)` : ''}${a.verdict === 'debil' ? ', punto débil' : a.verdict === 'fortaleza' ? ', fortaleza' : ''}`),
    ...(coverageQs.length ? [`Consultas de cobertura: ${list([...new Set(coverageQs.map((x) => x.place))].slice(0, 5))}`] : []),
    ...(rivals.length ? [`Menciones a la competencia: ${list(rivals.slice(0, 4).map((r) => r.name))}`] : []),
  ]
  const strongM: string[] = [], improve: string[] = []
  if (cm?.answered) strongM.push(`El equipo respondió ${cm.answered} comentario${cm.answered === 1 ? '' : 's'} en el periodo.`)
  if (cm?.pending) improve.push(`${cm.pending} comentario${cm.pending === 1 ? '' : 's'} sin respuesta del equipo.`)
  const unanswered = coverageQs.filter((x) => !x.answered)
  if (unanswered.length) improve.push(`Consultas de cobertura sin respuesta: ${list([...new Set(unanswered.map((x) => x.place))])}. Dejarlas sin respuesta empuja a buscar alternativas.`)
  const favorAll = people.filter((c) => c.brandStance)
  const reading: string[] = []
  reading.push(s.total ? (pct(s.pos) >= pct(s.neg) * 2 ? `El estado general es positivo: ${pct(s.pos)} % de comentarios a favor frente a ${pct(s.neg)} % en contra.` : pct(s.neg) > pct(s.pos) ? `Predominan las críticas: ${pct(s.neg)} % en contra frente a ${pct(s.pos)} % a favor.` : `La opinión está dividida: ${pct(s.pos)} % a favor y ${pct(s.neg)} % en contra.`) : 'No hay comentarios de seguimientos en el periodo elegido.')
  if (favorAll.length) reading.push(`${favorAll.length === 1 ? 'Un cliente menciona' : `${favorAll.length} clientes mencionan`} a la competencia como alternativa (${list([...new Set(favorAll.flatMap((c) => rivals.filter((r) => r.ids.includes(c.id)).map((r) => r.name)))].slice(0, 3)) || 'otra tienda'}): un cliente insatisfecho ya tiene otra marca en la cabeza.`)
  const weakA = (cm?.aspects.brand || []).filter((a) => a.verdict === 'debil')
  if (weakA.length) reading.push(`Requiere atención: ${list(weakA.map((a) => a.short))}.`)

  /* ---------- 8. Propuestas, recomendaciones, pendientes ---------- */
  const P: CompModel['proposals'] = []
  const provTxt = list(provs)
  if (!bp.publicPrices) P.push({ title: 'Publicación de la arquitectura de combos', text: `«Estos son nuestros combos ${brand} para ${provTxt}. Combo Básico: [productos, peso]. Precio: [$]. Combo Cárnico: [productos, peso]. Precio: [$]. Envío visible antes de pagar.${bp.deliveryHours ? ` Entrega en ${hoursTxt(bp.deliveryHours)}.` : ''}»`, goal: 'Construir una oferta pública clara: la competencia ya publica precios.' })
  if (zelle.length || !bp.payments.length) P.push({ title: 'Publicación fija de métodos de pago y cobertura', text: `«En ${brand} puedes pedir tu combo desde donde estés. Aceptamos [métodos disponibles${zelle.length ? ', incluido Zelle si se confirma' : ''}]. Entregamos en ${Object.entries(bp.coverage).filter(([, v]) => v).map(([k, v]) => `${k} (${v})`).join(', ') || '[cobertura]'}. Escríbenos por WhatsApp.»`, goal: zelle.length ? `Responder a lo que ${list(zelle.slice(0, 3))} ya resuelve con Zelle.` : 'Aclarar cómo pagar y dónde se entrega.' })
  if (!bp.reviews) P.push({ title: 'Evidencia de entrega y testimonio real', text: '«Así recibió [nombre] su combo en [municipio]. Si ya compraste con nosotros, déjanos tu reseña aquí.»', goal: 'Empezar un historial de reseñas verificables.' })
  const amb = authors.filter((a) => a.role === 'promueve la marca').map((a) => a.name.split(' ')[0])
  if (amb.length) P.push({ title: 'Reconocimiento a clientes embajadores', text: `«${list(amb.slice(0, 2))} ya lo dijeron: ${brand} está sonando en el oriente. Gracias por recomendarnos.»`, goal: 'Aprovechar la prueba social que ya existe, con permiso previo.' })
  if (unanswered.length) P.push({ title: 'Respuesta pública de cobertura', text: `«¿Llegamos a ${list([...new Set(unanswered.map((x) => x.place))].slice(0, 3))}? [Respuesta y alternativa]. Consulta tu municipio por WhatsApp.»`, goal: 'No dejar consultas de cobertura sin respuesta.' })

  const R: string[] = []
  if (!bp.publicPrices) R.push(`Publicar combos con peso, contenido y precio visibles: sin eso ${brand} compite en desventaja frente a quienes ya tienen oferta pública${prices.length ? ` (${list([...new Set(prices.map((p) => p.competitor))].slice(0, 3))})` : ''}.`)
  if (zelle.length && !bp.payments.includes('Zelle')) R.push(`Confirmar si ${brand} puede aceptar y comunicar Zelle: ${list(zelle.slice(0, 3))} ya lo ofrece${zelle.length === 1 ? '' : 'n'}.`)
  if (amb.length) R.push(`Aprovechar a los embajadores (${list(amb.slice(0, 3))}) con permiso previo para testimonios y reseñas.`)
  const top = threats.filter((t) => t.tier === 'alta')
  if (top.length) R.push(`Monitorear de cerca a ${list(top.map((t) => `${t.name} (${t.headline})`))}.`)
  threats.filter((t) => t.tier === 'referencia' && t.mentions).forEach((t) => R.push(`Verificar la cobertura real de ${t.name} en ${provTxt} antes de tratarlo como amenaza directa.`))
  if (unanswered.length) R.push('Responder las consultas de cobertura pendientes con una respuesta institucional rápida.')
  weakA.forEach((a) => R.push(`${a.name}: ${a.advice}`))
  const pending: string[] = []
  const old = Date.now() - 7 * 864e5
  comps.filter((c) => !c.verifiedAt || c.verifiedAt < old).forEach((c) => pending.push(`Verificar los datos de ${c.name} (${c.verifiedAt ? 'última verificación hace más de una semana' : 'sin verificar'}).`))
  if (!Object.values(bp.coverage).some(Boolean)) pending.push(`Registrar la cobertura de ${brand} por provincia (Competencia › Competidores › Tu marca).`)
  if (pendingWeb.length) pending.push(`Confirmar o descartar ${pendingWeb.length} competidor${pendingWeb.length === 1 ? '' : 'es'} encontrado${pendingWeb.length === 1 ? '' : 's'} en Internet (Competencia › Competidores): ${list(pendingWeb.slice(0, 4).map((c) => c.name))}.`)
  if (opts.webInfo?.blocked) pending.push('La búsqueda en Internet se interrumpió por una verificación de DuckDuckGo: repítela.')
  if (!comps.length) pending.push('No se detectó competencia en los comentarios del periodo: añade a un seguimiento publicaciones de la competencia para que la IA cree sus fichas.')

  /* ---------- 9. Comparativa, resumen y conclusiones ---------- */
  const minP = (ps: { price: number; currency: string; product: string }[]) => { const u = ps.filter((p) => p.currency === 'USD' && p.price >= 10); return u.length ? u.reduce((a, b) => (b.price < a.price ? b : a)) : null }
  const asP = (l?: Combo[]) => (l || []).map((x) => ({ price: x.price, currency: x.currency, product: x.name }))
  const rowOf = (c: Competitor, kind: CompRow['kind']): CompRow => { const t = scoreOf(c), mp = minP([...c.prices.filter((x) => isProductName(x.product)), ...asP(c.combos)]); return { name: c.name, kind, threat: t.score, provinces: t.provinces.length || c.provinces.filter((x) => provs.includes(x)).length, payments: t.payments, zelle: t.payments.includes('Zelle'), hours: c.deliveryHours || 0, minPrice: mp ? { value: mp.price, currency: mp.currency, product: mp.product } : null, rating: c.rating, publicPrices: c.prices.length + (c.combos?.length || 0) >= 2, provList: (t.provinces.length ? t.provinces : c.provinces.filter((x) => provs.includes(x))) } }
  const bMin = minP([...(bp.prices || []).filter((x) => isProductName(x.product)), ...asP(bp.combos)])
  const comparison: CompRow[] = [
    { name: brand, kind: 'marca' as const, threat: null, provinces: provs.filter((x) => bp.coverage[x]).length, payments: bp.payments, zelle: bp.payments.includes('Zelle'), hours: bp.deliveryHours || 0, minPrice: bMin ? { value: bMin.price, currency: bMin.currency, product: bMin.product } : null, rating: null, publicPrices: bp.publicPrices, provList: provs.filter((x) => bp.coverage[x]) },
    ...comps.map((c) => rowOf(c, 'competidor')).sort((a, b) => (b.threat || 0) - (a.threat || 0)),
    ...pendingWeb.map((c) => rowOf(c, 'por confirmar')).sort((a, b) => (b.threat || 0) - (a.threat || 0)),
  ].slice(0, 12)
  /* ---- combos de comida ---- */
  const fromPrices = (ps: { product: string; price: number; currency: string; note?: string }[], have: Combo[] = []) =>
    ps.filter((p) => /\b(combos?|paquetes?|kit|jabas?|canastas?|modulos?)\b/i.test(p.product) && !have.some((c) => Math.abs(c.price - p.price) < 0.01))
      .flatMap((p) => extractCombos(`${p.product} ${p.price} ${p.currency}`))
  // los combos guardados antes del filtro (textos de envío, no comida…) se descartan aquí también
  const withPrices = (l: Combo[] | undefined, ps: { product: string; price: number; currency: string }[]) => [...(l || []), ...fromPrices(ps, l)].filter(validCombo)
  const owners: { who: string; kind: CombosInfo['cheapest'][number]['kind']; list: Combo[] }[] = [
    { who: brand, kind: 'marca' as const, list: withPrices(bp.combos, bp.prices || []) },
    ...comps.map((c) => ({ who: c.name, kind: 'competidor' as const, list: withPrices(c.combos, c.prices) })),
    ...pendingWeb.map((c) => ({ who: c.name, kind: 'por confirmar' as const, list: withPrices(c.combos, c.prices) })),
  ].filter((o) => o.list.length)
  const usd = (l: Combo[]) => l.filter((c) => c.currency === 'USD' && c.price >= 10)
  const cheapest = owners.map((o) => ({ o, l: usd(o.list) })).filter((x) => x.l.length).map(({ o, l }) => ({ who: o.who, kind: o.kind, combos: o.list.length, combo: l.reduce((a, b) => (b.price < a.price ? b : a)) })).sort((a, b) => a.combo.price - b.combo.price)
  const rivalCombos = owners.filter((o) => o.kind !== 'marca').flatMap((o) => o.list.map((c) => ({ who: o.who, combo: c })))
  const allCombos = owners.flatMap((o) => o.list)
  const floorC = cheapest.find((x) => x.kind !== 'marca') || null
  const perLb = rivalCombos.filter((x) => x.combo.perLb != null).sort((a, b) => a.combo.perLb! - b.combo.perLb!)
  const mins = cheapest.filter((x) => x.kind !== 'marca').map((x) => x.combo.price).sort((a, b) => a - b)
  const medianMin = mins.length ? mins[Math.floor(mins.length / 2)] : null
  const weights = allCombos.map((c) => c.weightLb).filter((w) => w >= 3)
  const demanded = demandedProducts(people.map((c) => c.text))
  const bMinC = cheapest.find((x) => x.kind === 'marca')
  const CR: string[] = []
  if (floorC) CR.push(`El combo más barato de la competencia es «${floorC.combo.name}» de ${floorC.who}, a ${floorC.combo.price} ${floorC.combo.currency}${floorC.combo.weightLb ? ` (${floorC.combo.weightLb} lb${floorC.combo.perLb ? `, ${floorC.combo.perLb} USD/lb` : ''})` : ''}.`)
  if (medianMin != null && mins.length > 1) CR.push(`El combo de entrada de la competencia está entre ${mins[0]} y ${mins[mins.length - 1]} USD (mediana ${medianMin} USD).`)
  if (perLb.length > 1) CR.push(`El precio por libra va de ${perLb[0].combo.perLb} USD (${perLb[0].who}) a ${perLb[perLb.length - 1].combo.perLb} USD (${perLb[perLb.length - 1].who}).`)
  if (bMinC && medianMin != null) CR.push(bMinC.combo.price <= medianMin ? `El combo de entrada de ${brand} («${bMinC.combo.name}», ${bMinC.combo.price} USD) está por debajo o en la mediana de la competencia: es un argumento a comunicar.` : `El combo de entrada de ${brand} («${bMinC.combo.name}», ${bMinC.combo.price} USD) está por encima de la mediana de la competencia (${medianMin} USD): conviene un combo de entrada más económico o explicar su valor (peso, contenido, rapidez).`)
  else if (!bMinC && rivalCombos.length) CR.push(`${brand} no muestra combos con precio en su sitio: el cliente que compara no encuentra una referencia frente a ${list([...new Set(rivalCombos.map((x) => x.who))].slice(0, 3))}.`)
  const topP = topProducts(allCombos)
  if (topP.length) CR.push(`Los combos se construyen sobre todo con ${list(topP.slice(0, 5).map((t) => t.product.toLowerCase()))}.`)
  if (demanded.length) CR.push(`Lo que más piden los clientes en los comentarios: ${list(demanded.slice(0, 4).map((d) => d.product.toLowerCase()))}.`)
  // recomendaciones sobre combos (precio de entrada y contenido)
  if (bMinC && medianMin != null && bMinC.combo.price > medianMin) R.push(`Revisar el combo de entrada: «${bMinC.combo.name}» cuesta ${bMinC.combo.price} USD frente a una mediana de ${medianMin} USD en la competencia${floorC ? ` (el más barato: ${floorC.combo.price} USD en ${floorC.who})` : ''}.`)
  if (!bMinC && floorC) R.push(`Publicar un combo de entrada con precio, peso y contenido para competir con «${floorC.combo.name}» de ${floorC.who} (${floorC.combo.price} USD).`)
  if (demanded.length && topP.length) { const miss = demanded.filter((d) => !(bp.combos || []).some((c) => c.items.some((i) => i.product === d.product))).slice(0, 3); if (miss.length && (bp.combos || []).length) R.push(`Incluir en los combos de ${brand} lo que más piden los clientes: ${list(miss.map((d) => d.product.toLowerCase()))}.`) }
  // la sección se muestra siempre: sin combos, explica por qué
  const combosInfo: CombosInfo = {
    cheapest, floor: floorC ? { who: floorC.who, combo: floorC.combo } : null, bestPerLb: perLb[0] || null,
    perLbRange: perLb.length ? [perLb[0].combo.perLb!, perLb[perLb.length - 1].combo.perLb!] : null, medianMin,
    avgWeight: weights.length ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10 : null,
    top: topP, brands: topBrands(allCombos), bestSellers: rivalCombos.filter((x) => x.combo.bestSeller).slice(0, 8).concat(owners.filter((o) => o.kind === 'marca').flatMap((o) => o.list.filter((c) => c.bestSeller).map((c) => ({ who: o.who, combo: c })))),
    demanded, total: allCombos.length, reading: CR,
    ladder: owners.map((o) => ({ who: o.who, kind: o.kind, combos: usd(o.list).map((c) => ({ name: c.name, price: c.price, weightLb: c.weightLb, perLb: c.perLb })) })).filter((x) => x.combos.length),
  }
  const rivalsC = comparison.filter((r) => r.kind !== 'marca')
  const hrsR = rivalsC.map((r) => r.hours).filter(Boolean).sort((a, b) => a - b), medH = hrsR.length ? hrsR[Math.floor(hrsR.length / 2)] : 0
  const pricesR = rivalsC.map((r) => r.minPrice?.value).filter((v): v is number => v != null).sort((a, b) => a - b)
  const trait = (r: CompRow) => [r.zelle ? 'acepta Zelle' : '', r.hours ? `entrega en ${hoursTxt(r.hours)}` : '', r.minPrice ? `combos desde ${r.minPrice.value} ${r.minPrice.currency}` : '', r.rating != null ? `${r.rating}/5 en reseñas` : ''].filter(Boolean).join(', ')
  const S: string[] = []
  // 1) redes
  if (s.total) S.push(`En el periodo analizado (${model0Period(opts.from, opts.to)}), la conversación sobre ${brand} en Facebook ${pct(s.pos) >= pct(s.neg) * 2 ? 'fue mayoritariamente favorable' : pct(s.neg) > pct(s.pos) ? 'estuvo dominada por las críticas' : 'estuvo dividida'}: ${pct(s.pos)} % de comentarios a favor y ${pct(s.neg)} % en contra, sobre ${s.total} comentario${s.total === 1 ? '' : 's'}.${weakA.length ? ` Las quejas se concentran en ${list(weakA.map((a) => a.short))}.` : ''}${favorAll.length ? ` ${favorAll.length === 1 ? 'Un cliente menciona' : `${favorAll.length} clientes mencionan`} a la competencia como alternativa.` : ''}`)
  else S.push(`No hubo seguimientos de comentarios en el periodo: el análisis se centra en la competencia en ${provTxt}.`)
  // 2) competencia
  const lead = (top.length ? top.map((t) => comparison.find((r) => r.name === t.name)!).filter(Boolean) : rivalsC.slice(0, 3))
  if (lead.length) S.push(`En competencia, ${top.length ? 'la presión en ' + provTxt + ' la concentran' : 'los competidores con más presencia en ' + provTxt + ' son'} ${list(lead.map((r) => `${r.name}${trait(r) ? ` (${trait(r)})` : ''}${r.kind === 'por confirmar' ? ' [por confirmar]' : ''}`))}.${zelle.length > 1 ? ' Operar con Zelle ya es el estándar del mercado, no una ventaja.' : ''}${floorC ? ` El combo más barato del mercado está en ${floorC.combo.price} ${floorC.combo.currency} («${floorC.combo.name}», ${floorC.who})${medianMin != null && mins.length > 1 ? ` y la mediana de los combos de entrada, en ${medianMin} USD` : ''}.` : ''}`)
  // 3) posición de la marca
  const adv: string[] = [], weak: string[] = []
  if (bp.deliveryHours && medH && bp.deliveryHours < medH) adv.push(`entrega más rápida que la media de la competencia (${hoursTxt(bp.deliveryHours)} frente a ${hoursTxt(medH)})`)
  const covN = provs.filter((x) => bp.coverage[x]).length
  if (covN) adv.push(`presencia en ${covN} de ${provs.length} provincia${provs.length === 1 ? '' : 's'}`)
  if (bMin && pricesR.length && bMin.price <= pricesR[Math.floor(pricesR.length / 2)]) adv.push(`precio de entrada competitivo (desde ${bMin.price} USD)`)
  if (zelle.length && !bp.payments.includes('Zelle')) weak.push('no comunica Zelle')
  if (!bp.publicPrices) weak.push('no publica combos con precio y contenido')
  if (!bp.reviews) weak.push('no tiene reseñas verificables')
  if (bMin && pricesR.length && bMin.price > pricesR[Math.floor(pricesR.length / 2)]) weak.push(`su combo de entrada (${bMin.price} USD) está por encima de la mediana de la competencia (${pricesR[Math.floor(pricesR.length / 2)]} USD)`)
  if (adv.length || weak.length) S.push(`${brand}${adv.length ? ` tiene ${list(adv)}` : ''}${adv.length && weak.length ? ', pero' : ''}${weak.length ? ` ${list(weak)}` : ''}.${weak.length ? ' Esa es la debilidad que este informe debe ayudar a resolver.' : ''}`)
  const mainRec = R[0] || `Mantener el seguimiento de la competencia en ${provTxt}.`
  const C: string[] = []
  if (!bp.publicPrices) C.push(`${brand} no tiene un problema de reputación en redes sino de oferta visible: cuando alguien compara, no encuentra un combo con precio y contenido públicos.`)
  if (favorAll.length) C.push('Las quejas fuertes vienen acompañadas de comparaciones con la competencia: el cliente insatisfecho ya tiene alternativa.')
  if (top.length) C.push(`La competencia que más presiona combina pago, confianza y producto: ${list(top.map((t) => t.name))}.`)
  C.push('El criterio de fondo: competir con información útil (combos con precio, entregas reales, respuestas de cobertura) además de con publicaciones bonitas.')

  const model: CompModel = {
    brand, author: prefs.author, from: opts.from, to: opts.to, period: periodTxt(opts.from, opts.to),
    provinces: provs, generatedAt: new Date().toISOString(), network: 'Facebook',
    sources: { tracks: tracks.map((t) => ({ name: t.name, date: new Date(trackTs(t)).toISOString().slice(0, 10) })), comments: all.length },
    adsTg: {
      ads: comps.filter((c) => c.ads?.active).sort((a, b) => (b.ads!.active - a.ads!.active)).map((c) => ({ name: c.name, active: c.ads!.active, since: c.ads!.since, sample: c.ads!.samples[0] || '', prices: c.ads!.prices.slice(0, 3).map((p) => `${p.product} ${p.price} ${p.currency}`).join('; ') })),
      telegram: comps.filter((c) => c.telegram).map((c) => ({ name: c.name, channel: c.telegram!.title, url: c.telegram!.url, combos: c.telegram!.combos, prices: c.telegram!.prices.slice(0, 3).map((p) => `${p.product} ${p.price} ${p.currency}`).join('; '), sample: c.telegram!.samples[0] || '' })),
    },
    summary: S, mainRec, threats,
    payEco: { zelle, byCompetitor: threats.filter((t) => t.payments.length).map((t) => ({ name: t.name, payments: t.payments })), brandHasZelle: bp.payments.includes('Zelle') },
    prices, provinceRows,
    social: { total: s.total, pos: s.pos, neg: s.neg, neu: s.neu, posPct: pct(s.pos), negPct: pct(s.neg), authors, themes, strong: strongM, improve, reading },
    coverageQs, evidence, proposals: P, recommendations: R, pending, conclusions: C,
    annexes: [...(bp.urls?.length ? [`Ficha de ${brand} detectada de su sitio online (${bp.urls.join(', ')})${bp.analyzedAt ? `, leído el ${new Date(bp.analyzedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`] : []),
      ...tracks.map((t) => `Seguimiento «${t.name}» (actualizado el ${longDay(new Date(trackTs(t)).toISOString().slice(0, 10))}).`),
      ...(auto.created.length ? [`Fichas creadas por la IA en este informe: ${list(auto.created)}.`] : []),
      ...(auto.updated.length ? [`Fichas actualizadas con los comentarios del periodo: ${list(auto.updated)}.`] : []),
      ...(comps.length ? [`Fichas de ${comps.length} competidor${comps.length === 1 ? '' : 'es'} usadas en el análisis.`] : [])],
    detected, fichas: { created: auto.created, updated: auto.updated },
    comparison,
    combos: combosInfo,
    webPending: pendingWeb.map((c) => ({ name: c.name, url: c.url, provinces: c.provinces, payments: c.payments, why: c.model })),
    webInfo: opts.webInfo,
    brandSite: bp.urls?.length ? { urls: bp.urls, analyzedAt: bp.analyzedAt || null, summary: bp.summary || '' } : undefined,
    aiUsed: false,
  }

  /* ---------- 10. Redacción con la IA de la app ---------- */
  if (aiOn && (s.total || threats.length)) {
    try {
      step('Redactando el resumen…', 65)
      const facts = { marca: brand, provincias: provs, periodo: model.period, comentarios: s.total, positivos_pct: model.social.posPct, negativos_pct: model.social.negPct,
        amenazas: top.map((t) => `${t.name}: ${t.headline}`), con_zelle: zelle, puntos_debiles: weakA.map((a) => a.short), comparaciones: favorAll.length,
        consultas_cobertura_sin_respuesta: [...new Set(unanswered.map((x) => x.place))], oferta_publica: bp.publicPrices }
      const txt = await generate(
        'Eres analista de marketing en Cuba. Escribe en español neutro, claro y profesional, sin inventar datos: usa solo los datos que te dan. Sin listas ni títulos.',
        `Con estos datos, redacta en 3 o 4 frases el resumen ejecutivo de un informe semanal de competencia y redes sociales para ${brand}, y termina con la recomendación principal.\nDatos: ${JSON.stringify(facts)}`,
        { maxTokens: 260, onProgress: (x) => step('Redactando el resumen…', 65 + 34 * x) })
      const clean = String(txt || '').replace(/\s+/g, ' ').trim()
      // control de calidad: el modelo pequeño a veces se sale del tema; solo se usa si habla de la marca y de los datos
      const bad = /(ensayo|art[ií]culo|blog|como (modelo|ia|asistente)|lo siento|no tengo|t[eé]cnicas clave|aqu[ií] tienes|\b\d\.\s+[A-ZÁÉÍÓÚ])/i
      const ok = clean.length >= 150 && clean.length <= 900 && normL(clean).includes(normL(brand)) && !bad.test(clean) && (!top.length || top.some((t) => normL(clean).includes(normL(t.name))))
      if (ok) { model.summary = [clean, ...model.summary.slice(2)]; model.aiUsed = true }
    } catch { /* se queda el resumen fijo */ }
  }
  step('')
  return model
}

/** Titular breve para el historial. */
export const headlineOf = (m: CompModel) => {
  const top = m.threats.filter((t) => t.tier === 'alta').map((t) => t.name)
  return `${m.provinces.join(', ')} · ${m.social.total} comentarios${top.length ? ` · amenaza: ${top.slice(0, 2).join(', ')}` : ''}`
}

export { MUNICIPALITIES }
