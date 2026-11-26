/** Datos de referencia para los informes de competencia: provincias del oriente de Cuba, municipios y métodos de pago. */
import { normL } from '@/features/comments/text'

export const PROVINCES = ['Las Tunas', 'Granma', 'Holguín', 'Santiago de Cuba', 'Guantánamo'] as const
export type Province = (typeof PROVINCES)[number]

/** Municipios de cada provincia (para detectar consultas de cobertura como «¿llegan a Baracoa?»). */
export const MUNICIPALITIES: Record<Province, string[]> = {
  'Las Tunas': ['Manatí', 'Puerto Padre', 'Jesús Menéndez', 'Majibacoa', 'Las Tunas', 'Jobabo', 'Colombia', 'Amancio'],
  Granma: ['Río Cauto', 'Cauto Cristo', 'Jiguaní', 'Bayamo', 'Yara', 'Manzanillo', 'Campechuela', 'Media Luna', 'Niquero', 'Pilón', 'Bartolomé Masó', 'Buey Arriba', 'Guisa'],
  Holguín: ['Gibara', 'Rafael Freyre', 'Banes', 'Antilla', 'Báguanos', 'Holguín', 'Calixto García', 'Cacocum', 'Urbano Noris', 'Cueto', 'Mayarí', 'Frank País', 'Sagua de Tánamo', 'Moa'],
  'Santiago de Cuba': ['Contramaestre', 'Mella', 'San Luis', 'Segundo Frente', 'Songo-La Maya', 'Santiago de Cuba', 'Palma Soriano', 'Tercer Frente', 'Guamá'],
  Guantánamo: ['El Salvador', 'Manuel Tames', 'Yateras', 'Baracoa', 'Maisí', 'Imías', 'San Antonio del Sur', 'Caimanera', 'Guantánamo', 'Niceto Pérez'],
}

/** Métodos de pago que se reconocen en fichas y comentarios. `strong`: estándar del mercado para la diáspora. */
export const PAYMENTS: { name: string; re: RegExp; strong?: boolean }[] = [
  { name: 'Zelle', re: /\bzelle\b/, strong: true },
  { name: 'PayPal', re: /\bpay ?pal\b/, strong: true },
  { name: 'Bizum', re: /\bbizum\b/ },
  { name: 'Western Union', re: /\bwestern( union)?\b/ },
  { name: 'MoneyGram', re: /\bmoney ?gram\b/ },
  { name: 'Wise', re: /\bwise\b/ },
  { name: 'CashApp', re: /\bcash ?app\b/ },
  { name: 'Tropipay', re: /\btropi ?pay\b/ },
  { name: 'Qvapay', re: /\bqva ?pay\b/ },
  { name: 'Visa', re: /\bvisa\b/ },
  { name: 'Mastercard', re: /\bmaster ?card\b/ },
  { name: 'American Express', re: /\b(american express|amex)\b/ },
  { name: 'Tarjeta', re: /\b(tarjetas?|stripe|tarjeta de credito|tarjeta de debito)\b/ },
  { name: 'Transferencia', re: /\b(transferencias?|transfermovil|enzona|bancaria)\b/ },
  { name: 'MLC', re: /\bmlc\b/ },
  { name: 'Efectivo', re: /\b(efectivo|cash)\b/ },
  { name: 'Criptomonedas', re: /\b(bitcoin|usdt|cripto|criptomonedas?|binance)\b/ },
  { name: 'Pago contra entrega', re: /(contra ?entrega|pag(o|as|an) (al|cuando) (recibir|llegue)|primero se entrega|luego se paga|pagas despues)/ },
]

/** Otras formas de nombrar las provincias en textos y sitios cubanos. */
export const PROVINCE_ALIASES: Record<Province, string[]> = {
  'Las Tunas': ['las tunas', 'tunas'],
  Granma: ['granma'],
  Holguín: ['holguin'],
  'Santiago de Cuba': ['santiago de cuba', 'santiago', 'stgo', 'stgo de cuba'],
  Guantánamo: ['guantanamo', 'gtmo'],
}

export const paymentsIn = (text: string) => { const t = normL(text); return PAYMENTS.filter((p) => p.re.test(t)).map((p) => p.name) }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Municipio o provincia del oriente nombrado en el texto, con su provincia. Evita «Colombia» o «Mella» sueltos sin contexto de entrega. */
export function placesIn(text: string): { place: string; province: Province }[] {
  const t = normL(text), out: { place: string; province: Province }[] = []
  const ctx = /(llega|llegan|entrega|entregan|envio|envian|envias|mandan|cubren|cobertura|hay servicio|trabajan|domicilio|reparten|hasta)/.test(t)
  PROVINCES.forEach((p) => MUNICIPALITIES[p].forEach((m) => {
    const k = normL(m)
    if (!new RegExp('(^|[^a-z])' + esc(k) + '($|[^a-z])').test(t)) return
    if (['colombia', 'mella', 'yara', 'guisa', 'moa', 'cueto', 'banes', 'antilla', 'guama'].includes(k) && !ctx) return
    if (!out.some((x) => x.place === m)) out.push({ place: m, province: p })
  }))
  return out
}

/** Precios en el texto: «$74.25», «80 USD», «35 EUR», «150 dólares». */
export function pricesIn(text: string): { value: number; currency: string; raw: string }[] {
  const out: { value: number; currency: string; raw: string }[] = []
  const re = /(\$\s?(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s?(usd|dolares|dólares|eur|euros|€|mlc))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const num = parseFloat((m[2] || m[3]).replace(',', '.')), cur = m[4] ? (/eur|€/i.test(m[4]) ? 'EUR' : /mlc/i.test(m[4]) ? 'MLC' : 'USD') : 'USD'
    if (num >= 5 && num <= 2000) out.push({ value: num, currency: cur, raw: m[0].trim() })
  }
  return out
}

/** Plazos de entrega mencionados, en horas: «24–72 horas», «5 días», «menos de 12 horas». */
export function deliveryHoursIn(text: string): number[] {
  const t = normL(text), out: number[] = []
  const re = /(\d{1,3})\s?(?:[-–a]\s?(\d{1,3})\s?)?(horas|hrs|h|dias|dia)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) { const n = +(m[2] || m[1]); if (n > 0 && n < 400) out.push(/^d/.test(m[3]) ? n * 24 : n) }
  return out
}

/** Precios con el producto que los acompaña: «Combo Básico (18 lb + aceite) $74.25» → { product: 'Combo Básico (18 lb + aceite)', price: 74.25 }. */
export function pricedItems(text: string): { product: string; price: number; currency: string }[] {
  const out: { product: string; price: number; currency: string }[] = []
  String(text || '').split(/\n+|(?<=[.!?])\s+/).forEach((line) => {
    pricesIn(line).forEach((p) => {
      const i = line.indexOf(p.raw)
      // empezar siempre en una palabra completa (antes se cortaba: «roductos el precio…»)
      const from = Math.max(0, i - 70)
      let before = line.slice(from, i)
      if (from > 0 && /[\p{L}\d]/u.test(line[from - 1] || '')) before = before.replace(/^[\p{L}\d]+/u, '')
      before = before.replace(/.*[|•·:;]/s, '').trim()
      if (!before || before.length < 3) before = line.slice(i + p.raw.length, i + p.raw.length + 50).replace(/^[\s\-–—:,)]+/, '').replace(/[.;|].*$/, '').replace(/\s+\S*$/, (m) => (line.length > i + p.raw.length + 50 ? '' : m)).trim()
      // quitar palabras de enlace al final («sale a», «cuesta») y artículos al principio («El combo…» → «Combo…»)
      let prev = ''
      while (prev !== before) { prev = before; before = before.replace(/\s*\b(precio|desde|solo|a|en|por|de|sale|salen|cuesta|cuestan|vale|valen|el|la|los|las|un|una|y|es|son|con)\s*$/i, '').replace(/[\s\-–—,(:]+$/, '').trim() }
      before = before.replace(/^(el|la|los|las|un|una|nuestro|nuestra)\s+/i, '')
      const product = (before.charAt(0).toUpperCase() + before.slice(1)).slice(-60).trim()
      if (product && isProductName(product) && !out.some((x) => Math.abs(x.price - p.value) < 0.01 && x.product === product)) out.push({ product, price: p.value, currency: p.currency })
    })
  })
  return out.slice(0, 12)
}

/**
 * ¿El texto junto al precio es un producto? Debe nombrar un combo o un alimento y no ser una tarifa, un impuesto,
 * un recargo o una explicación de envío («se aplica un 30 % de arancel», «el costo extra por la entrega»).
 */
const PRODUCT_WORD = /\b(combos?|paquetes?|kit|jabas?|canastas?|modulos?|cajas?|despensa|pollo|cerdo|res|carne|picadillo|jamon|salchichas?|pescado|huevos?|arroz|frijol(es)?|azucar|aceite|cafe|leche|pasta|espaguetis?|harina|galletas?|queso|viandas?|refrescos?|cerveza|detergente|jabon|aseo)\b/
const NOT_PRODUCT = /\b(arancel|impuestos?|tarifa|costo|costos|envio|envios|entrega|aduana|descuento|valor|equivalente|aplica|provincias|estimado|domicilio|express|recargo|cargo|miscelaneas|televisor|abonar|destinatario|remision|oscila|varia|asignado)\b/
export const isProductName = (t: string) => { const n = normL(t); return PRODUCT_WORD.test(n) && !NOT_PRODUCT.test(n) && n.split(' ').length <= 12 }

/** Calificación de reseñas en el texto: «4.3/5», «4,3 de 5 estrellas», «TrustScore 4.3», «★ 4.5». */
export function ratingIn(text: string): number | null {
  const t = String(text || '')
  const m = t.match(/(?:trustscore|calificaci[oó]n|rating|valoraci[oó]n|★|estrellas?:?)\s*(\d(?:[.,]\d)?)\b/i) || t.match(/\b(\d(?:[.,]\d)?)\s*(?:\/\s*5|de 5|out of 5|estrellas|stars)\b/i)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return v >= 1 && v <= 5 ? v : null
}
