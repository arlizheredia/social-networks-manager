/**
 * Investigación en Internet: la extensión busca en Google (en una pestaña de tu Chrome, como una búsqueda
 * normal) por cada provincia y tipo de negocio, lee los sitios encontrados y la IA de la app (local) decide cuáles son
 * competidores y rellena su ficha. Los nuevos quedan «por confirmar»: el usuario los confirma o los descarta.
 */
import { onPublisherProgress, publisherCommand, useExtension } from '@/features/extension/bridge'
import { generate, parseJsonLoose, useAI } from '@/features/ai/engine'
import { normL } from '@/features/comments/text'
import { pricedItems, PROVINCES, ratingIn, type Province } from './data'
import { mergeBrand, profileFromSite, summarizeBrand, type SitePage } from './brandsite'
import { extractCombos, type Combo } from './combos'
import { keyOf } from './discover'
import { newCompetitor, type BrandProfile, type Competitor } from './store'

export interface SearchHit { query: string; pos: number; title: string; url: string; snippet: string }
export interface WebCandidate { domain: string; url: string; name: string; hits: SearchHit[]; provinces: Province[] }

/** Consultas por provincia: combos a domicilio y envíos de alimentos (con Zelle, el pago de la diáspora). */
export function buildQueries(provinces: readonly Province[]) {
  const ps = provinces.length ? provinces : PROVINCES
  // provincias agrupadas con OR (2 consultas como mucho): mucho más rápido que una por provincia
  const groups = ps.length <= 2 ? [ps] : [ps.slice(0, Math.ceil(ps.length / 2)), ps.slice(Math.ceil(ps.length / 2))]
  return groups.map((g) => `tienda online combos a domicilio ${g.join(' OR ')} Cuba`)
}

/** Sitios que no son negocios de la competencia: redes, buscadores, noticias, directorios, marketplaces, gobierno. */
const NOT_BUSINESS = /(^|\.)(facebook|fb|instagram|tiktok|youtube|twitter|x|linkedin|pinterest|reddit|quora|whatsapp|telegram|t|wikipedia|wikiwand|ecured|google|bing|duckduckgo|yahoo|amazon|ebay|mercadolibre|aliexpress|temu|revolico|tripadvisor|booking|trustpilot|scamadviser|yelp|cibercuba|14ymedio|diariodecuba|cubadebate|granma|juventudrebelde|cubanet|martinoticias|eltoque|adncuba|periodicocubano|cubaencuentro|cubahora|radiorebelde|elnuevoherald|cnn|bbc|elpais|infobae|scribd|medium|blogspot|wordpress|gob|gov|onei|minrex|mincin)\./i
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const rootDomain = (h: string) => h.split('.').slice(-3).join('.').replace(/^(m|shop|tienda|store)\./, '')

/** Agrupa los resultados por sitio y descarta lo que no es un negocio, tu marca y lo ya descartado. */
export function candidatesFrom(hits: SearchHit[], opts: { brandDomains: string[]; brandKeys: string[]; ignored: string[] }): WebCandidate[] {
  const ign = new Set(opts.ignored.map(keyOf))
  const by = new Map<string, WebCandidate>()
  hits.forEach((h) => {
    const d = rootDomain(host(h.url))
    if (!d || NOT_BUSINESS.test(d + '.') || NOT_BUSINESS.test(host(h.url) + '.')) return
    if (opts.brandDomains.some((b) => d === b || d.endsWith('.' + b)) || opts.brandKeys.some((k) => d.replace(/[^a-z0-9]/g, '').includes(k.replace(/[^a-z0-9]/g, '')))) return
    const name = businessName(d, [h.title])
    if (ign.has(keyOf(name)) || ign.has(keyOf(d))) return
    const c = by.get(d) || { domain: d, url: (() => { try { return new URL(h.url).origin } catch { return h.url } })(), name, hits: [], provinces: [] }
    c.hits.push(h)
    // la provincia sale del resultado; de la consulta solo si buscaba una sola provincia
    const qp = PROVINCES.filter((p) => normL(h.query).includes(normL(p)))
    PROVINCES.forEach((p) => { if ((normL(h.snippet + ' ' + h.title).includes(normL(p)) || (qp.length === 1 && qp[0] === p)) && !c.provinces.includes(p)) c.provinces.push(p) })
    by.set(d, c)
  })
  // más relevantes: aparecen en más búsquedas y más arriba
  return [...by.values()].sort((a, b) => b.hits.length - a.hits.length || Math.min(...a.hits.map((x) => x.pos)) - Math.min(...b.hits.map((x) => x.pos)))
}

/**
 * Nombre comercial a partir del sitio: el trozo del título que contiene el nombre del dominio
 * («Combos a Cuba | Dímelo Cubano» → «Dímelo Cubano»); si no hay, el propio dominio («cubakilos.com» → «Cubakilos»).
 */
export function businessName(domain: string, titles: string[]) {
  const label = domain.split('.')[0], k = label.replace(/[^a-z0-9]/g, '')
  const flat = (x: string) => normL(x).replace(/[^a-z0-9]/g, '')
  for (const t of titles) for (const seg of t.split(/\s[|\-–—·:]\s|,\s/)) { const f = flat(seg); if (f && f.length <= k.length + 6 && (f.includes(k) || (k.includes(f) && f.length >= k.length * 0.75))) return seg.trim().slice(0, 60) }
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const SELLS = /(combo|combos|alimentos|comida|mercado|supermercado|tienda|envio|envios|domicilio|entrega|delivery|carne|pollo|aseo|canasta)/g
const CUBA = /(cuba|habana|santiago|holguin|guantanamo|granma|bayamo|tunas|camaguey|matanzas|cubanos?)/
/** Sin IA: parece competidor si habla de vender o enviar alimentos/combos y menciona Cuba. */
export const looksCompetitor = (text: string) => { const t = normL(text); return (t.match(SELLS) || []).length >= 3 && CUBA.test(t) }

/** Señales de un sitio: cuántas palabras de venta/envío tiene y si habla de Cuba. */
export function signals(text: string) { const t = normL(text); return { sells: new Set(t.match(SELLS) || []).size, cuba: CUBA.test(t) } }
/** Reglas: «sí» claro, «no» claro o dudoso (solo los dudosos van a la IA). */
export function ruleVerdict(text: string): 'si' | 'no' | 'duda' {
  const { sells, cuba } = signals(text)
  if (cuba && sells >= 4) return 'si'
  if (sells < 2 || (!cuba && sells < 3)) return 'no'
  return 'duda'
}
const textOf = (c: WebCandidate, pages: SitePage[]) => [...c.hits.map((h) => `${h.title}. ${h.snippet}`), ...pages.map((p) => `${p.title}. ${p.text}`)].join('\n').replace(/\s+/g, ' ')

/**
 * Decide qué sitios son competidores. Rápido: las reglas resuelven los casos claros y la IA de la app revisa
 * solo los dudosos, todos en una única consulta.
 */
async function classifyAll(list: { c: WebCandidate; pages: SitePage[] }[], brand: string, step: (s: string, pct?: number) => void) {
  const out = new Map<string, { ok: boolean; name: string; why: string }>()
  const doubt: typeof list = []
  list.forEach(({ c, pages }) => {
    const text = textOf(c, pages), v = ruleVerdict(text), name = businessName(c.domain, [...pages.map((p) => p.title), ...c.hits.map((h) => h.title)])
    if (v === 'duda') doubt.push({ c, pages })
    out.set(c.domain, { ok: v === 'si', name, why: v === 'si' ? 'Vende o envía combos/alimentos con entrega en Cuba.' : '' })
  })
  if (doubt.length && useAI.getState().installed) {
    const lbl = `Revisando ${doubt.length} sitio${doubt.length === 1 ? '' : 's'} dudoso${doubt.length === 1 ? '' : 's'}…`
    step(lbl, 80)
    try {
      const txt = await generate('Clasificas negocios. Respondes solo JSON.',
        `Marca de referencia: ${brand} (combos de alimentos con entrega a domicilio en Cuba).\n${doubt.map((d, k) => `${k + 1}. ${d.c.domain}: ${textOf(d.c, d.pages).slice(0, 260)}`).join('\n')}\n\n¿Cuáles venden combos, alimentos o productos con entrega en Cuba? Responde {"competidores":[números]}`,
        { maxTokens: 40, onProgress: (x) => step(lbl, 80 + 10 * x) })
      const j = parseJsonLoose<{ competidores?: number[] }>(txt)
      ;(j?.competidores || []).forEach((n) => { const d = doubt[n - 1]; if (d && signals(textOf(d.c, d.pages)).cuba) out.set(d.c.domain, { ...out.get(d.c.domain)!, ok: true, why: 'La IA lo identifica como tienda con entregas en Cuba.' }) })
    } catch { /* sin IA: los dudosos quedan fuera */ }
  }
  return out
}

/** Combos de varias páginas, sin repetir (mismo nombre y precio). */
export function combosOf(pages: SitePage[], prev: Combo[] = []) {
  const out = [...prev]
  pages.forEach((p) => extractCombos(p.title + '\n' + p.text, p.url).forEach((c) => { if (!out.some((x) => normL(x.name) === normL(c.name) && Math.abs(x.price - c.price) < 0.01)) out.push(c) }))
  return out.slice(0, 30)
}

/** Mezcla en la ficha lo encontrado en Google (resultados) y en su sitio (páginas), sin tocar lo corregido a mano. */
export function mergeFound(c: Competitor, hs: SearchHit[], ps: SitePage[]): Competitor {
  const docs: SitePage[] = [...ps, ...hs.map((h) => ({ url: h.url, title: h.title, text: h.snippet }))]
  const all = docs.map((d) => d.title + '\n' + d.text).join('\n')
  const prof = profileFromSite(docs), man = new Set(c.manual || [])
  const items = pricedItems(ps.map((p) => p.text).join('\n') + '\n' + hs.filter((h) => !/trustpilot|review/i.test(h.url)).map((h) => h.snippet).join('\n'))
  const revHit = hs.find((h) => /trustpilot|google\.|reviews?|opiniones/i.test(h.url + ' ' + h.title) && ratingIn(h.title + ' ' + h.snippet) != null)
  const rating = revHit ? ratingIn(revHit.title + ' ' + revHit.snippet) : ratingIn(all)
  return {
    ...c,
    provinces: man.has('provinces') ? c.provinces : PROVINCES.filter((x) => c.provinces.includes(x) || prof.coverage[x]),
    payments: man.has('payments') ? c.payments : [...new Set([...c.payments, ...prof.payments])],
    deliveryHours: man.has('deliveryHours') || c.deliveryHours ? c.deliveryHours : prof.deliveryHours,
    prices: man.has('prices') ? c.prices : [...c.prices, ...items.filter((x) => !c.prices.some((y) => Math.abs(y.price - x.price) < 0.01)).map((x) => ({ product: x.product, price: x.price, currency: x.currency, note: 'Publicado en su sitio' }))].slice(0, 8),
    rating: man.has('rating') || c.rating != null ? c.rating : rating,
    reputation: man.has('reputation') ? c.reputation : [...new Set([c.reputation, revHit ? `Reseñas: ${host(revHit.url)}${rating != null ? ` (${rating}/5)` : ''}` : ''].filter(Boolean))].join(' · ').slice(0, 300),
    url: c.url || (hs[0] ? (() => { try { return new URL(hs[0].url).origin } catch { return '' } })() : ''),
    combos: man.has('combos') ? c.combos : combosOf(docs, c.combos || []),
    lastSeen: Date.now(),
  }
}

/**
 * Busca de nuevo un competidor concreto con los datos de su ficha (nombre, otros nombres y enlace): una búsqueda
 * por nombre (como mucho 3), su sitio si no se conocía, y la lectura de sus páginas de combos y precios.
 */
export async function researchCompetitor(c: Competitor, onStep?: (s: string, pct?: number) => void): Promise<{ competitor: Competitor; hits: number; pages: number; error: string }> {
  const step = onStep || (() => {})
  if (!useExtension.getState().publisher) return { competitor: c, hits: 0, pages: 0, error: 'La búsqueda en Internet necesita la extensión de Chrome.' }
  const names = [...new Set([c.name, ...c.aliases].map((x) => x.trim()).filter((x) => x.length >= 3))].slice(0, 3)
  const queries = names.map((n, i) => (i === 0 ? `"${n}" combos precios contenido libras Zelle opiniones` : `"${n}" combos Cuba`))
  step(`Buscando «${c.name}» en Google…`, 5)
  const offP = onPublisherProgress((t) => { const m = t.match(/\((\d+) de (\d+)\)/); if (t) step(t, m ? 5 + (45 * (+m[1] - 1)) / +m[2] : undefined) })
  let r: Awaited<ReturnType<typeof publisherCommand>>
  try { r = await publisherCommand('search', { queries, parallel: 2 }, 5 * 60_000) } finally { offP() }
  const all = (r.results as SearchHit[]) || []
  const keys = names.map((n) => normL(n)), flat = (x: string) => normL(x).replace(/[^a-z0-9]/g, '')
  const refs = (c.refUrls || []).filter((u) => /^https?:\/\//.test(u))
  const doms = [...new Set([c.url, ...refs].filter(Boolean).map((u) => rootDomain(host(u))).filter((d) => d && !/^(facebook|fb|instagram|tiktok)\./.test(d)))]
  // resultados que hablan de él: sus dominios (enlace y referencias), o su nombre en el título o el fragmento
  const hs = all.filter((h) => doms.includes(rootDomain(host(h.url))) || keys.some((k) => normL(h.title + ' ' + h.snippet).includes(k)) || names.some((n) => flat(host(h.url)).includes(flat(n)) && flat(n).length >= 5))
  // su sitio: el enlace de la ficha o un dominio con su nombre que no sea una red ni un directorio
  let url = c.url
  // sin enlace: la primera referencia que no sea una red social
  if (!url) { const ref = refs.find((u) => !NOT_BUSINESS.test(rootDomain(host(u)) + '.')); if (ref) { try { url = new URL(ref).origin } catch { /* */ } } }
  if (!url) { const own = hs.find((h) => !NOT_BUSINESS.test(rootDomain(host(h.url)) + '.') && names.some((n) => flat(host(h.url)).includes(flat(n).slice(0, 8)))); if (own) { try { url = new URL(own.url).origin } catch { /* */ } } }
  let ps: SitePage[] = []
  // primero las referencias (tal cual, incluidas páginas de Facebook o dinámicas: se abren en una pestaña), luego su sitio
  const sites = [
    ...(refs.length ? [{ key: 'ref', urls: refs.slice(0, 6), per: Math.min(8, refs.length + 2), render: true }] : []),
    ...(url ? [{ key: 'site', urls: [...new Set([...hs.filter((h) => rootDomain(host(h.url)) === rootDomain(host(url))).map((h) => h.url), url])].slice(0, 3), per: 5 }] : []),
  ]
  if (sites.length) {
    step(refs.length ? `Leyendo las direcciones de referencia de ${c.name}…` : `Leyendo el sitio de ${c.name}…`, 60)
    const rs = await publisherCommand('sites', { sites, perSite: 5 }, 6 * 60_000)
    if (rs.ok) ps = ((rs.sites as { key: string; pages: SitePage[] }[]) || []).flatMap((x) => x.pages || [])
  }
  step('Actualizando la ficha…', 95)
  const competitor = hs.length || ps.length ? mergeFound({ ...c, url }, hs, ps) : c
  return { competitor, hits: hs.length, pages: ps.length, error: r.ok ? (hs.length || ps.length ? '' : 'Google no devolvió resultados sobre este competidor.') : String(r.error || 'No se pudo buscar en Google.') }
}

/**
 * Investigación en profundidad de los competidores principales (hasta 5): una búsqueda en Google por cada uno
 * («"Fagales Market" combos precios Zelle opiniones») y la lectura de sus páginas de combos y precios. Rellena
 * precios con su producto, pagos, plazos, provincias y la calificación de sus reseñas (sin tocar lo corregido).
 */
async function deepen(list: Competitor[], step: (s: string, pct?: number) => void): Promise<{ list: Competitor[]; deepened: string[] }> {
  const targets = [...list].filter((c) => c.status !== 'pendiente' || c.source === 'web')
    .sort((a, b) => Number(!!a.prices.length) - Number(!!b.prices.length) || (b.mentions || 0) - (a.mentions || 0)).slice(0, 5)
  if (!targets.length) return { list, deepened: [] }
  const qOf = (c: Competitor) => `"${c.name}" combos precios contenido libras Zelle opiniones`
  step(`Buscando en Google datos de ${targets.length} competidor${targets.length === 1 ? '' : 'es'}…`, 92)
  const r = await publisherCommand('search', { queries: targets.map(qOf), parallel: 2 }, 8 * 60_000)
  const hits = ((r.results as SearchHit[]) || [])
  const domOf = (c: Competitor) => (c.url ? rootDomain(host(c.url)) : '')
  const mine = (c: Competitor) => hits.filter((h) => h.query === qOf(c) && ((domOf(c) && rootDomain(host(h.url)) === domOf(c)) || normL(h.title + ' ' + h.snippet).includes(normL(c.name))))
  // páginas de combos/precios de su sitio (de los resultados o la portada)
  const sites = targets.filter((c) => c.url || c.refUrls?.length).map((c) => ({ key: c.id, urls: [...new Set([...(c.refUrls || []), ...mine(c).filter((h) => domOf(c) && rootDomain(host(h.url)) === domOf(c)).map((h) => h.url), c.url].filter(Boolean))].slice(0, 6), per: 6, render: !!c.refUrls?.length }))
  let pages = new Map<string, SitePage[]>()
  if (sites.length) {
    step('Leyendo las páginas de combos y precios de la competencia…', 95)
    const rs = await publisherCommand('sites', { sites, perSite: 5 }, 8 * 60_000)
    if (rs.ok) pages = new Map(((rs.sites as { key: string; pages: SitePage[] }[]) || []).map((x) => [x.key, x.pages]))
  }
  const deepened: string[] = []
  const out = list.map((c) => {
    if (!targets.includes(c)) return c
    const hs = mine(c), ps = pages.get(c.id) || []
    if (!hs.length && !ps.length) return c
    deepened.push(c.name)
    return mergeFound(c, hs, ps)
  })
  return { list: out, deepened }
}

/** Consultas sobre la propia marca: su sitio, pagos, envíos y opiniones. */
export const buildBrandQueries = (brand: string, _provinces: readonly Province[]) => [`${brand} combos a domicilio`, `${brand} opiniones`]

/**
 * Investigación en Internet con Google (por medio de la extensión), sin que el usuario indique direcciones:
 *  1. busca la marca y la competencia por provincia;
 *  2. reconoce los sitios de la marca (dominios con su nombre) y lo que otros sitios dicen de ella (reseñas);
 *  3. lee esos sitios y los de los competidores encontrados, con un solo permiso;
 *  4. rellena la ficha de la marca y las de la competencia (las nuevas quedan por confirmar).
 */
export async function researchOnWeb(opts: {
  provinces: readonly Province[]; brand: string; brandKeys: string[]; brandProfile: BrandProfile
  competitors: Competitor[]; ignored: string[]; onStep?: (s: string, pct?: number) => void; maxNew?: number
}): Promise<{ brandProfile: BrandProfile; brandFound: string[]; competitors: Competitor[]; found: string[]; refreshed: string[]; blocked: boolean; error: string }> {
  const step = opts.onStep || (() => {})
  const none = { brandProfile: opts.brandProfile, brandFound: [], competitors: opts.competitors, found: [], refreshed: [], blocked: false }
  if (!useExtension.getState().publisher) return { ...none, error: 'La búsqueda en Internet necesita la extensión de Chrome.' }
  const bq = buildBrandQueries(opts.brand, opts.provinces), cq = buildQueries(opts.provinces)
  step('Buscando en Google tu marca y la competencia…', 2)
  // la extensión avisa «Buscando en Google (2 de 4)…»: de ahí sale el porcentaje de la búsqueda
  const offP = onPublisherProgress((t) => { const m = t.match(/\((\d+) de (\d+)\)/); if (t) step(t, m ? 2 + (50 * (+m[1] - 1)) / +m[2] : undefined) })
  let r: Awaited<ReturnType<typeof publisherCommand>>
  try { r = await publisherCommand('search', { queries: [...bq, ...cq], parallel: 2 }, 12 * 60_000) } finally { offP() }
  const hits = (r.results as SearchHit[]) || []
  if (!hits.length) return { ...none, blocked: !!r.blocked, error: String(r.error || 'Google no devolvió resultados.') }
  const bk = opts.brandKeys.map((k) => k.replace(/[^a-z0-9]/g, '')).filter((k) => k.length >= 4)
  const isBrandDomain = (d: string) => bk.some((k) => d.replace(/[^a-z0-9]/g, '').includes(k))
  // sitios de la marca: dominios con su nombre que no son redes, noticias ni directorios
  const brandDomains = [...new Set(hits.map((h) => rootDomain(host(h.url))).filter((d) => d && isBrandDomain(d) && !NOT_BUSINESS.test(d + '.')))]
  const brandOrigins = brandDomains.map((d) => hits.find((h) => rootDomain(host(h.url)) === d)!).map((h) => { try { return new URL(h.url).origin } catch { return '' } }).filter(Boolean)
  // lo que otros sitios dicen de la marca (reseñas, directorios, noticias)
  const mentions = hits.filter((h) => bq.includes(h.query) && !brandDomains.includes(rootDomain(host(h.url))) && bk.some((k) => normL(h.title + ' ' + h.snippet).replace(/[^a-z0-9 ]/g, '').replace(/ /g, '').includes(k)))
  const known = new Map(opts.competitors.map((c) => [host(c.url) && rootDomain(host(c.url)), c]))
  const cands = candidatesFrom(hits.filter((h) => cq.includes(h.query)), { brandDomains, brandKeys: opts.brandKeys, ignored: opts.ignored })
  const fresh = cands.filter((c) => !known.has(c.domain) && !opts.competitors.some((x) => keyOf(x.name) === keyOf(c.name))).slice(0, opts.maxNew ?? 6)
  const withSite = opts.competitors.filter((c) => c.url && /^https?:/.test(c.url) && c.status !== 'pendiente').slice(0, 4)
  const sites = [
    ...(brandOrigins.length ? [{ key: 'brand', urls: brandOrigins.slice(0, 2), per: 3 }] : []),
    ...fresh.map((c) => ({ key: c.domain, urls: [c.url], per: 1 })),
    ...withSite.map((c) => ({ key: 'id:' + c.id, urls: [c.url], per: 1 })),
  ]
  let pages = new Map<string, SitePage[]>()
  if (sites.length) {
    step(`Leyendo ${sites.length} sitio${sites.length === 1 ? '' : 's'} encontrado${sites.length === 1 ? '' : 's'}…`, 55)
    // cada sitio leído suma su parte (55 % → 78 %)
    let readN = 0
    const offS = onPublisherProgress((t) => { if (/^Leyendo /.test(t)) { readN++; step(t, 55 + Math.min(23, (23 * readN) / Math.max(1, sites.length * 1.5))) } })
    let rs: Awaited<ReturnType<typeof publisherCommand>>
    try { rs = await publisherCommand('sites', { sites, perSite: 2 }, 8 * 60_000) } finally { offS() }
    if (rs.ok) pages = new Map(((rs.sites as { key: string; pages: SitePage[] }[]) || []).map((x) => [x.key, x.pages]))
  }
  /* ---- ficha de la marca ---- */
  let brandProfile = opts.brandProfile, brandFound: string[] = []
  const bPages = pages.get('brand') || []
  const bSnips: SitePage[] = hits.filter((h) => bq.includes(h.query) && (brandDomains.includes(rootDomain(host(h.url))) || mentions.includes(h))).map((h) => ({ url: h.url, title: h.title, text: h.snippet }))
  if (bPages.length || bSnips.length) {
    step('Completando la ficha de tu marca…', 92)
    const det = profileFromSite([...bPages, ...bSnips])
    // reseñas: sitios de opiniones que mencionan la marca
    const rev = [...new Set(mentions.map((h) => host(h.url)).filter((x) => /(trustpilot|google|yelp|tripadvisor|scamadviser|sitejabber|reviews?)/.test(x)))]
    if (rev.length) { det.reviews = [det.reviews, ...rev].filter(Boolean).join(', '); det.evidence.reviews = mentions.find((h) => rev.includes(host(h.url)))?.snippet || det.evidence.reviews || '' }
    // el resumen de la IA solo se rehace si cambió lo leído (ahorra una consulta lenta)
    const sig = [...bPages, ...bSnips].map((p) => p.url + ':' + p.text.length).sort().join('|')
    const summary = opts.brandProfile.summary && opts.brandProfile.sig === sig ? opts.brandProfile.summary : await summarizeBrand([...bPages, ...bSnips], opts.brand, step)
    const { found, evidence, ...profile } = det
    brandFound = found
    const bItems = pricedItems(bPages.map((p) => p.text).join('\n')).map((x) => ({ product: x.product, price: x.price, currency: x.currency, note: 'Publicado en su sitio' }))
    brandProfile = { ...mergeBrand(opts.brandProfile, { ...profile, ...(summary ? { summary } : {}) }), ...(bItems.length && !(opts.brandProfile.manual || []).includes('prices') ? { prices: bItems } : {}), combos: combosOf(bPages), sig, urls: brandOrigins.length ? brandOrigins : opts.brandProfile.urls, evidence, analyzedAt: Date.now(),
      pages: [...bPages.map((p) => ({ url: p.url, title: p.title, chars: p.text.length })), ...mentions.slice(0, 6).map((h) => ({ url: h.url, title: `${h.title} (mención)`, chars: h.snippet.length }))] }
  }
  /* ---- competidores ---- */
  const next = [...opts.competitors], found: string[] = [], refreshed: string[] = []
  const verdicts = await classifyAll(fresh.map((c) => ({ c, pages: pages.get(c.domain) || [] })), opts.brand, step)
  for (const c of fresh) {
    const ps = pages.get(c.domain) || []
    const v = verdicts.get(c.domain)!
    if (!v.ok) continue
    const p = profileFromSite(ps.length ? ps : c.hits.map((h) => ({ url: h.url, title: h.title, text: h.snippet })))
    next.push(newCompetitor(v.name, {
      url: c.url, aliases: [c.domain], provinces: PROVINCES.filter((x) => p.coverage[x] || c.provinces.includes(x)), payments: p.payments, deliveryHours: p.deliveryHours,
      prices: [], coverage: Object.entries(p.coverage).map(([k, x]) => `${k}: ${x}`).join('; '), reputation: p.reviews ? `Reseñas: ${p.reviews}` : '',
      model: v.why, source: 'web', status: 'pendiente', detectedAt: Date.now(), lastSeen: Date.now(), mentions: 0,
      combos: combosOf(ps.length ? ps : c.hits.map((h) => ({ url: h.url, title: h.title, text: h.snippet }))),
      web: { query: c.hits[0]?.query || '', snippet: c.hits[0]?.snippet || '', evidence: p.evidence },
    }))
    found.push(v.name)
  }
  withSite.forEach((c) => {
    const ps = pages.get('id:' + c.id)
    if (!ps?.length) return
    const p = profileFromSite(ps), man = new Set(c.manual || []), i = next.findIndex((x) => x.id === c.id)
    next[i] = { ...c, provinces: man.has('provinces') ? c.provinces : PROVINCES.filter((x) => c.provinces.includes(x) || p.coverage[x]),
      payments: man.has('payments') ? c.payments : [...new Set([...c.payments, ...p.payments])],
      deliveryHours: man.has('deliveryHours') || !p.deliveryHours ? c.deliveryHours : p.deliveryHours, lastSeen: Date.now() }
    refreshed.push(c.name)
  })
  /* ---- en profundidad: precios, pagos, plazos y reseñas de los principales ---- */
  let deep: { list: Competitor[]; deepened: string[] } = { list: next, deepened: [] }
  if (!r.blocked) { try { deep = await deepen(next, step) } catch { /* se queda lo que hay */ } }
  return { brandProfile, brandFound, competitors: deep.list, found, refreshed: [...new Set([...refreshed, ...deep.deepened])], blocked: !!r.blocked, error: r.ok ? '' : String(r.error || '') }
}
