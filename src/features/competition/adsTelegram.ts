/**
 * Más fuentes para el análisis de la competencia, además de Google:
 * - Biblioteca de anuncios de Meta: anuncios activos de cada competidor en Facebook e Instagram (ofertas, precios,
 *   desde cuándo) y anunciantes nuevos de combos a Cuba.
 * - Canales públicos de Telegram (vista web t.me/s/…): catálogos, precios y combos que publican.
 * Todo se lee con la extensión (sin iniciar sesión en esos sitios).
 */
import { publisherCommand, onPublisherProgress, useExtension } from '@/features/extension/bridge'
import { normL } from '@/features/comments/text'
import { extractCombos } from './combos'
import { pricedItems, type Province } from './data'
import { isBusinessName, keyOf } from './discover'
import { newCompetitor, type AdsInfo, type Competitor, type PriceRef, type TelegramInfo } from './store'
import type { SearchHit } from './websearch'

/* ---------- Biblioteca de anuncios ---------- */
export const adLibraryUrl = (q: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&q=${encodeURIComponent(q)}&search_type=keyword_unordered`

export interface Ad { page: string; start: string; text: string }
const ID_RE = /(?:ID de la biblioteca|Identificador de la biblioteca|Library ID)\s*:?\s*\d+/i
const START_RE = /(?:Comenz[oó] a circular el|Empez[oó] a circular el|Started running on)\s+([^\n·]+)/i
const DETAILS_RE = /^(Ver detalles del anuncio|Ver los detalles del anuncio|See ad details|Ver detalles del resumen|See summary details)$/i
const SPONSORED_RE = /^(Publicidad|Patrocinado|Sponsored)$/i

/** Interpreta el texto de una página de resultados de la Biblioteca de anuncios. */
export function parseAdLibrary(text: string): { ads: Ad[]; total: number | null } {
  const t = String(text || '').replace(/\r/g, '')
  const totalM = t.match(/~?\s*([\d.,]+)\s+(resultados|results)\b/i)
  const total = totalM ? +totalM[1].replace(/[.,]/g, '') : null
  const parts = t.split(ID_RE).slice(1)
  const ads: Ad[] = parts.map((chunk) => {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
    const start = (chunk.match(START_RE)?.[1] || '').trim()
    const di = lines.findIndex((l) => DETAILS_RE.test(l))
    const si = lines.findIndex((l) => SPONSORED_RE.test(l))
    const page = (si > 0 ? lines[si - 1] : di >= 0 ? lines[di + 1] : '') || ''
    const body = si >= 0 ? lines.slice(si + 1).filter((l) => !/^(Activo|Active|Inactivo|Inactive|Plataformas|Platforms|Más información|Learn more|Enviar mensaje|Send message|Comprar|Shop now)$/i.test(l)) : []
    return { page: page.slice(0, 80), start, text: body.join(' ').replace(/\s+/g, ' ').slice(0, 400) }
  }).filter((a) => a.page || a.text)
  return { ads, total: total ?? (ads.length || null) }
}

/** Los anuncios de un competidor (por el nombre de la página anunciante). */
export function adsOf(ads: Ad[], c: Pick<Competitor, 'name' | 'aliases'>) {
  const keys = [c.name, ...c.aliases].map(keyOf).filter((k) => k.length >= 4)
  return ads.filter((a) => { const p = keyOf(a.page); return keys.some((k) => p.includes(k) || k.includes(p) && p.length >= 4) })
}

const MONTHS: Record<string, number> = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 }
/** «12 nov 2026», «12 de noviembre de 2026» o «Nov 12, 2026» → marca de tiempo (null si no se reconoce). */
export function adDate(s: string): number | null {
  const t = normL(s).replace(/ de /g, ' ').replace(/[.,]/g, ' ')
  let m = t.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})/)
  if (m && m[2] in MONTHS) return new Date(+m[3], MONTHS[m[2]], +m[1]).getTime()
  m = t.match(/([a-z]{3})[a-z]*\s+(\d{1,2})\s+(\d{4})/)
  if (m && m[1] in MONTHS) return new Date(+m[3], MONTHS[m[1]], +m[2]).getTime()
  return null
}

/** Resumen de los anuncios de un competidor: cuántos, desde cuándo, ejemplos y precios que anuncian. */
export function adsInfo(ads: Ad[], url: string): AdsInfo {
  const prices: PriceRef[] = pricedItems(ads.map((a) => a.text).join('\n')).slice(0, 8).map((x) => ({ product: x.product, price: x.price, currency: x.currency, note: 'En un anuncio activo' }))
  // desde: el anuncio activo más antiguo
  const starts = ads.map((a) => ({ s: a.start, t: adDate(a.start) })).filter((x) => x.s).sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity))
  return { at: Date.now(), url, active: ads.length, since: starts[0]?.s || '', samples: [...new Set(ads.map((a) => a.text).filter((x) => x.length > 20))].slice(0, 3), prices }
}

/* ---------- Telegram ---------- */
/** Canal de Telegram a partir de un enlace (t.me/canal, t.me/s/canal, telegram.me/canal); null si no es un canal. */
export function tgChannel(url: string): string | null {
  const m = String(url).match(/^https?:\/\/(?:www\.)?(?:t|telegram)\.me\/(?:s\/)?([A-Za-z][\w]{3,31})(?:[/?#]|$)/)
  if (!m || /^(joinchat|share|addstickers|proxy|iv|login|c)$/i.test(m[1])) return null
  return m[1]
}
export const tgUrl = (ch: string) => `https://t.me/s/${ch}`

/** Lo que publica un canal: título, ejemplos con precio, precios y combos. */
export function telegramInfo(ch: string, page: { title: string; text: string }): TelegramInfo & { combosList: ReturnType<typeof extractCombos> } {
  const text = String(page.text || '')
  const title = String(page.title || '').replace(/\s*[–-]\s*Telegram.*$/i, '').replace(/^Telegram:\s*(Contact|View)\s*@?/i, '').trim() || '@' + ch
  const prices: PriceRef[] = pricedItems(text).slice(0, 10).map((x) => ({ product: x.product, price: x.price, currency: x.currency, note: 'Publicado en su canal de Telegram' }))
  const combosList = extractCombos(text, tgUrl(ch))
  const samples = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 30 && /(\$|usd|cup|mlc|€|combo|precio)/i.test(l)).slice(0, 3).map((l) => l.slice(0, 220))
  return { at: Date.now(), url: tgUrl(ch), title, samples, prices, combos: combosList.length, combosList }
}

/* ---------- Búsqueda ---------- */
export interface MoreSourcesResult { competitors: Competitor[]; found: string[]; ads: number; channels: number; error: string; needsUpdate: boolean }

/**
 * Busca en la Biblioteca de anuncios y en Telegram a los competidores conocidos y a anunciantes o canales nuevos de
 * combos en las provincias elegidas. Los nuevos quedan por confirmar, como los encontrados en Google.
 */
export async function researchMoreSources(opts: {
  provinces: readonly Province[]; brandKeys: string[]; competitors: Competitor[]; ignored: string[]
  adLibrary: boolean; telegram: boolean; onStep?: (s: string, pct?: number) => void
}): Promise<MoreSourcesResult> {
  const step = opts.onStep || (() => {})
  const out: MoreSourcesResult = { competitors: opts.competitors, found: [], ads: 0, channels: 0, error: '', needsUpdate: false }
  if (!useExtension.getState().publisher || (!opts.adLibrary && !opts.telegram)) return out
  const isBrand = (n: string) => { const k = keyOf(n).replace(/ /g, ''); return opts.brandKeys.some((b) => k.includes(b.replace(/[^a-z0-9]/g, ''))) }
  const ignored = new Set(opts.ignored.map(keyOf))
  const known = opts.competitors.filter((c) => c.status !== 'pendiente')
  const top = [...known].sort((a, b) => (b.mentions || 0) - (a.mentions || 0)).slice(0, 6)
  let comps = opts.competitors.map((c) => ({ ...c }))
  const byKey = (n: string) => comps.find((c) => [c.name, ...c.aliases].some((x) => keyOf(x) === keyOf(n)))
  const addNew = (name: string, extra: Partial<Competitor>) => {
    if (!isBusinessName(name) || isBrand(name) || ignored.has(keyOf(name)) || byKey(name)) return null
    const c = newCompetitor(name, { source: 'web', status: 'pendiente', detectedAt: Date.now(), ...extra })
    comps = [...comps, c]; out.found.push(c.name)
    return c
  }

  /* 1) canales de Telegram: los que ya figuran en las fichas y los que encuentre Google */
  const channels = new Map<string, string | null>() // canal → id del competidor (null = sin asignar)
  if (opts.telegram) {
    comps.forEach((c) => [c.url, ...(c.refUrls || [])].forEach((u) => { const ch = u && tgChannel(u); if (ch) channels.set(ch.toLowerCase(), c.id) }))
    const provs = opts.provinces.slice(0, 3).join(' OR ')
    const queries = [`site:t.me combos a domicilio ${provs}`, ...top.slice(0, 3).map((c) => `"${c.name}" telegram`)]
    step('Buscando canales de Telegram…', 3)
    try {
      const r = await publisherCommand('search', { queries, parallel: 2 }, 6 * 60_000)
      ;((r.results as SearchHit[]) || []).forEach((h) => {
        const ch = tgChannel(h.url)
        if (!ch || channels.has(ch.toLowerCase())) return
        const forComp = top.find((c) => h.query.includes(`"${c.name}"`) && normL(h.title + ' ' + h.snippet).includes(normL(c.name).split(' ')[0]))
        channels.set(ch.toLowerCase(), forComp?.id ?? null)
      })
    } catch { /* sin Google: solo los canales de las fichas */ }
  }

  /* 2) lectura: anuncios de cada competidor conocido + búsqueda de anunciantes de combos; canales de Telegram */
  const sites: { key: string; urls: string[]; per: number; render?: 'force' | boolean; wait?: number }[] = []
  if (opts.adLibrary) {
    top.forEach((c) => sites.push({ key: 'ads:' + c.id, urls: [adLibraryUrl(c.name)], per: 1, render: 'force', wait: 5000 }))
    sites.push({ key: 'ads:*', urls: [adLibraryUrl(`combos ${opts.provinces[0] || 'Cuba'} domicilio`)], per: 1, render: 'force', wait: 5000 })
  }
  ;[...channels.keys()].slice(0, 10).forEach((ch) => sites.push({ key: 'tg:' + ch, urls: [tgUrl(ch)], per: 1 }))
  if (!sites.length) return out
  step(`Leyendo ${sites.length} página${sites.length === 1 ? '' : 's'} (anuncios y Telegram)…`, 10)
  let readN = 0
  const off = onPublisherProgress((t) => { if (/^Leyendo /.test(t)) { readN++; step(t.replace(/^Leyendo ads:.*/, 'Leyendo la Biblioteca de anuncios…').replace(/^Leyendo tg:/, 'Leyendo el canal de Telegram '), 10 + Math.min(80, (80 * readN) / sites.length)) } })
  let rs: Awaited<ReturnType<typeof publisherCommand>>
  try { rs = await publisherCommand('sites', { sites, perSite: 1 }, 10 * 60_000) } finally { off() }
  if (!rs.ok) { out.error = String(rs.error || 'No se pudieron leer los anuncios ni Telegram.'); return out }
  const pages = new Map(((rs.sites as { key: string; pages: { title: string; text: string; url: string }[] }[]) || []).map((x) => [x.key, x.pages[0]]))

  // anuncios
  let adPagesRead = 0
  for (const [key, page] of pages) {
    if (!key.startsWith('ads:') || !page) continue
    const { ads } = parseAdLibrary(page.text)
    if (ads.length) adPagesRead++
    if (key === 'ads:*') {
      // anunciantes nuevos de combos en la provincia
      const names = [...new Set(ads.map((a) => a.page).filter(Boolean))]
      names.forEach((n) => { const mine = ads.filter((a) => a.page === n); const c = byKey(n) || addNew(n, {}); if (c) Object.assign(c, { ads: adsInfo(mine, adLibraryUrl(n)) }) })
      continue
    }
    const c = comps.find((x) => 'ads:' + x.id === key)
    if (!c) continue
    const mine = adsOf(ads, c)
    c.ads = adsInfo(mine, adLibraryUrl(c.name))
    out.ads += mine.length
  }
  if (opts.adLibrary && pages.size && !adPagesRead && [...pages.keys()].some((k) => k.startsWith('ads:'))) out.needsUpdate = !/^2\.3\.[6-9]|^2\.[4-9]|^[3-9]/.test(String(useExtension.getState().publisher || ''))

  // Telegram
  for (const [key, page] of pages) {
    if (!key.startsWith('tg:') || !page || page.text.length < 80) continue
    const ch = key.slice(3), info = telegramInfo(ch, page)
    const { combosList, ...tg } = info
    const owner = channels.get(ch)
    const c = (owner ? comps.find((x) => x.id === owner) : byKey(tg.title)) || (tg.prices.length || tg.combos ? addNew(tg.title, { url: tg.url }) : null)
    if (!c) continue
    c.telegram = tg
    if (!(c.manual || []).includes('prices') && tg.prices.length && !c.prices.length) c.prices = tg.prices
    if (combosList.length) c.combos = [...(c.combos || []).filter((x) => !String(x.url || '').includes('t.me/')), ...combosList].slice(0, 30)
    out.channels++
  }
  out.competitors = comps
  step('', 100)
  return out
}
