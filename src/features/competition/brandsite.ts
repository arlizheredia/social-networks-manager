/**
 * Ficha de la marca a partir de su sitio online: la extensión lee las páginas públicas (con permiso solo para ese
 * dominio) y aquí se deduce la cobertura por provincia, los métodos de pago, el plazo de entrega, si publica combos
 * con precio y dónde tiene reseñas. La IA de la app resume la propuesta de valor. Lo corregido a mano se respeta.
 */
import { generate, useAI } from '@/features/ai/engine'
import { normL } from '@/features/comments/text'
import { deliveryHoursIn, MUNICIPALITIES, paymentsIn, pricesIn, PROVINCE_ALIASES, PROVINCES, type Province } from './data'
import type { BrandProfile } from './store'

export interface SitePage { url: string; title: string; text: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const has = (t: string, w: string) => new RegExp('(^|[^a-z])' + esc(normL(w)) + '($|[^a-z])').test(t)
/** Nombres que también son palabras comunes o de otros países: solo cuentan con contexto de entrega cerca. */
const AMBIGUOUS = new Set(['colombia', 'mella', 'yara', 'guisa', 'moa', 'cueto', 'banes', 'antilla', 'guama', 'jobabo', 'amancio'])

/** Frase del sitio donde aparece algo (para que el usuario vea de dónde salió cada dato). */
const snippet = (sentences: string[], test: (n: string) => boolean) => { const f = sentences.find((x) => test(normL(x))); return f ? f.replace(/\s+/g, ' ').trim().slice(0, 180) : '' }

/** Lo que se deduce del texto del sitio, con la frase de evidencia de cada dato. */
export function profileFromSite(pages: SitePage[]): Omit<BrandProfile, 'urls' | 'manual' | 'analyzedAt' | 'pages'> & { found: string[]; evidence: Record<string, string> } {
  const all = pages.map((p) => p.title + '\n' + p.text).join('\n')
  const t = normL(all)
  const sentences = all.split(/(?<=[.!?…])\s+|\n+/).filter((x) => x.trim().length > 3)
  // frases que hablan de entregas: para plazos y para municipios ambiguos
  const DELIV = /(entrega|entregamos|envio|enviamos|domicilio|llegamos|cobertura|reparto|delivery|despacho|recibe|recibir)/
  const deliv = sentences.filter((s) => DELIV.test(normL(s)))
  const dt = normL(deliv.join(' '))
  const evidence: Record<string, string> = {}
  const coverage: Partial<Record<Province, string>> = {}
  PROVINCES.forEach((p) => {
    const muns = MUNICIPALITIES[p].filter((m) => normL(m) !== normL(p) && (AMBIGUOUS.has(normL(m)) ? has(dt, m) : has(t, m)))
    const named = PROVINCE_ALIASES[p].some((a) => has(t, a))
    if (muns.length) coverage[p] = `${muns.length} municipio${muns.length === 1 ? '' : 's'} (${muns.slice(0, 6).join(', ')}${muns.length > 6 ? '…' : ''})`
    else if (named) coverage[p] = PROVINCE_ALIASES[p].some((a) => has(dt, a)) ? 'Entregas en la provincia' : 'Mencionada en el sitio'
  })
  if (Object.keys(coverage).length) evidence.coverage = snippet(sentences, (n) => PROVINCES.some((p) => PROVINCE_ALIASES[p].some((a) => has(n, a)) || MUNICIPALITIES[p].some((m) => has(n, m))))
  const payments = paymentsIn(all)
  if (payments.length) evidence.payments = snippet(sentences, (n) => paymentsIn(n).length > 0)
  const hs = deliv.map((x) => ({ x, h: deliveryHoursIn(x).filter((h) => h >= 2 && h <= 24 * 30) })).filter((y) => y.h.length)
  const hours = hs.flatMap((y) => y.h)
  const deliveryHours = hours.length ? Math.max(...hours.filter((h) => h <= Math.min(...hours) * 4)) : 0
  if (deliveryHours) evidence.deliveryHours = (hs.find((y) => y.h.includes(deliveryHours))?.x || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  const prices = pricesIn(all)
  if (prices.length) evidence.publicPrices = `${prices.length} precio${prices.length === 1 ? '' : 's'} en el sitio, p. ej. ${prices.slice(0, 3).map((p) => p.raw).join(', ')}`
  const reviews = [
    /trustpilot/.test(t) && 'Trustpilot', /google/.test(t) && /(resena|opinion|review|estrellas)/.test(t) && 'Google', /(testimonio|lo que dicen nuestros clientes|opiniones de clientes)/.test(t) && 'testimonios en el sitio',
  ].filter(Boolean) as string[]
  if (reviews.length) evidence.reviews = snippet(sentences, (n) => /(trustpilot|resena|opinion|testimonio|review)/.test(n))
  const found = [
    Object.keys(coverage).length ? `cobertura en ${Object.keys(coverage).length} provincia${Object.keys(coverage).length === 1 ? '' : 's'}` : '',
    payments.length ? `${payments.length} método${payments.length === 1 ? '' : 's'} de pago` : '',
    deliveryHours ? `plazo de ${deliveryHours <= 48 ? deliveryHours + ' h' : Math.round(deliveryHours / 24) + ' días'}` : '',
    prices.length ? `${prices.length} precio${prices.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return { coverage, payments, deliveryHours, publicPrices: prices.length >= 3, reviews: reviews.join(', '), summary: '', found, evidence }
}

/** Mezcla lo detectado con la ficha actual sin tocar lo corregido a mano. */
export function mergeBrand(cur: BrandProfile, det: Partial<BrandProfile>): BrandProfile {
  const man = new Set(cur.manual || [])
  const next = { ...cur }
  ;(['coverage', 'payments', 'deliveryHours', 'publicPrices', 'reviews', 'summary'] as const).forEach((k) => {
    if (man.has(k) || det[k] === undefined) return
    if (k === 'deliveryHours' && !det.deliveryHours) return
    ;(next as Record<string, unknown>)[k] = det[k]
  })
  return next
}

/** La IA de la app resume la propuesta de la marca a partir de lo leído. */
export async function summarizeBrand(pages: SitePage[], brand: string, onStep?: (s: string, pct?: number) => void) {
  if (!useAI.getState().installed || !pages.length) return ''
  try {
    onStep?.('Resumiendo la propuesta de tu marca…', 94)
    const txt = await generate('Eres analista de marketing. Resumes en una o dos frases, en español, solo con lo que dice el texto.',
      `Marca: ${brand}\nTexto sobre la marca (su sitio y lo que dicen de ella):\n${pages.map((p) => p.title + '. ' + p.text).join('\n').replace(/\s+/g, ' ').slice(0, 3500)}\n\n¿Qué ofrece y por qué la elegirían (cobertura, rapidez, pago, combos)?`, { maxTokens: 90, onProgress: (x) => onStep?.('Resumiendo la propuesta de tu marca…', 94 + 5 * x) })
    const s = String(txt || '').replace(/\s+/g, ' ').trim()
    return s.length > 20 ? s.slice(0, 300) : ''
  } catch { return '' }
}
