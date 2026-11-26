/**
 * Evaluación por aspectos del servicio: calidad, entregas, precio, variedad y fricciones de búsqueda o pago.
 * Cada aspecto se detecta en la frase donde se menciona y se valora con el sentimiento de esa frase
 * («buen precio, pero la entrega tardó» suma a favor en precio y en contra en entregas).
 * Los comentarios que comparan con la competencia se cuentan aparte: muestran en qué aspecto gana el competidor.
 */
import { norm, sentiment } from './text'
import type { Comment, Sentiment } from './types'

export type AspectKey = 'servicio' | 'entrega' | 'precio' | 'variedad' | 'friccion'

export const ASPECTS: { key: AspectKey; name: string; short: string; advice: string }[] = [
  { key: 'servicio', name: 'Calidad del servicio', short: 'calidad del servicio', advice: 'Reforzar la atención al cliente y el control de calidad de los productos antes del envío.' },
  { key: 'entrega', name: 'Tiempos de entrega', short: 'tiempos de entrega', advice: 'Reducir los tiempos de entrega e informar con claridad el plazo y el estado de cada pedido.' },
  { key: 'precio', name: 'Precio', short: 'precio', advice: 'Revisar la percepción de los precios y de las tasas de cambio frente a la competencia, y comunicar ofertas y combos.' },
  { key: 'variedad', name: 'Variedad de productos', short: 'variedad de productos', advice: 'Ampliar el surtido o comunicar mejor los productos disponibles y avisar cuando se reponen.' },
  { key: 'friccion', name: 'Búsqueda y pago', short: 'búsqueda y pago', advice: 'Simplificar la búsqueda de productos y el proceso de pago, y atender rápido los problemas con la tienda o la pasarela.' },
]

/** Palabras exactas, raíces (prefijos) y frases de cada aspecto, ya sin acentos. */
const LEX: Record<AspectKey, { words: string[]; stems: string[]; phrases: RegExp }> = {
  servicio: {
    words: ['atencion', 'atienden', 'atendieron', 'atendio', 'servicio', 'servicios', 'trato', 'amable', 'amables', 'grosero', 'grosera', 'groseros', 'soporte', 'calidad', 'fresco', 'fresca', 'frescos', 'frescas', 'podrido', 'podrida', 'vencido', 'vencida', 'caducado', 'roto', 'rota', 'danado', 'danada', 'estado', 'responden', 'contestan', 'respuesta', 'reclamo', 'reclamacion', 'devolucion', 'reembolso', 'garantia', 'confiable', 'confianza', 'seriedad', 'serios', 'profesional', 'profesionales', 'empaque', 'embalaje'],
    stems: ['descongel', 'malolient', 'defectuos', 'atencion', 'atent'],
    phrases: /(nadie (me )?(responde|contesta|atiende)|buen(a)? atencion|mal(a)? atencion|en mal estado|en buen estado|muy atentos|no responden|no contestan)/,
  },
  entrega: {
    words: ['entrega', 'entregas', 'entregar', 'entregaron', 'entrego', 'envio', 'envios', 'enviar', 'enviaron', 'mensajero', 'mensajeros', 'mensajeria', 'domicilio', 'delivery', 'llego', 'llega', 'llegan', 'llegaron', 'llegue', 'demora', 'demoras', 'demoran', 'demoraron', 'demorado', 'tarde', 'tardanza', 'tardaron', 'tarda', 'tardan', 'rapido', 'rapida', 'rapidos', 'rapidez', 'puntual', 'puntuales', 'puntualidad', 'retraso', 'retrasos', 'retrasado', 'esperando', 'espera', 'horas', 'dias', 'lento', 'lentos'],
    stems: ['demor', 'retras', 'tardanz'],
    phrases: /(a tiempo|en el dia|mismo dia|en \d+ (horas|dias|h)|menos de \d+ (horas|dias)|todavia no (me )?llega|aun no (me )?llega|no ha llegado|nunca llego)/,
  },
  precio: {
    words: ['precio', 'precios', 'caro', 'cara', 'caros', 'caras', 'barato', 'barata', 'baratos', 'baratas', 'costo', 'costos', 'cuesta', 'cuestan', 'cobran', 'cobraron', 'cobro', 'tasa', 'tasas', 'cambio', 'cambios', 'oferta', 'ofertas', 'descuento', 'descuentos', 'rebaja', 'rebajas', 'economico', 'economica', 'economicos', 'accesible', 'accesibles', 'usd', 'mlc', 'dolares', 'euros', 'pesos', 'cup', 'combo', 'combos', 'abusivo', 'abusivos'],
    stems: ['carisim', 'baratisim', 'abusiv'],
    phrases: /(\$\s?\d|\d+\s?(usd|mlc|cup|pesos|dolares)|mas barat|mas car|buen precio|buenos precios|muy car|precio justo)/,
  },
  variedad: {
    words: ['variedad', 'variedades', 'surtido', 'catalogo', 'agotado', 'agotados', 'agotada', 'disponible', 'disponibles', 'disponibilidad', 'opciones', 'stock', 'existencia', 'existencias', 'reponer', 'repongan', 'surtir', 'marcas'],
    stems: ['variad', 'surtid', 'agotad'],
    phrases: /(no (hay|tienen|tenian|venden|trae[n]?) [\p{L}]+|ya no (hay|tienen)|cuando (vuelve|vuelven|llega|llegan|habra)|tienen [\p{L}]+\?|hay [\p{L}]+\?|venden [\p{L}]+|traigan [\p{L}]+|deberian (traer|tener|vender)|poca variedad|mucha variedad|de todo)/u,
  },
  friccion: {
    words: ['pago', 'pagos', 'pagar', 'pague', 'pagado', 'tarjeta', 'tarjetas', 'transferencia', 'transferencias', 'zelle', 'paypal', 'pasarela', 'tropipay', 'enzona', 'transfermovil', 'qvapay', 'app', 'aplicacion', 'pagina', 'web', 'sitio', 'tienda', 'buscar', 'busco', 'busqueda', 'buscador', 'encontrar', 'encuentro', 'cuenta', 'registro', 'registrarme', 'contrasena', 'carrito', 'checkout', 'cobrado', 'rechazada', 'rechazo', 'error', 'errores', 'falla', 'cargando', 'carga'],
    stems: ['transfer', 'aplicaci', 'registr'],
    phrases: /(no (puedo|pude|me deja|deja) (pagar|comprar|entrar|registrar|encontrar|buscar|ver)|no (encuentro|encontre)|no carga|se cae|se traba|me cobraron (dos|2) veces|no acepta|no aceptan|metodos? de pago|forma de pago)/,
  },
}

const sentences = (t: string) => String(t || '').split(/(?<=[.!?…])\s+|\n+|\s+(?=pero\s)/i).map((s) => s.trim()).filter(Boolean)
const toks = (s: string) => norm(s.toLowerCase()).match(/[\p{L}\p{N}$]+/gu) || []

/** Aspectos de una frase. */
export function aspectsIn(text: string): AspectKey[] {
  const t = norm(String(text || '').toLowerCase()), w = toks(text)
  return (Object.keys(LEX) as AspectKey[]).filter((k) => {
    const L = LEX[k]
    return L.phrases.test(t) || w.some((x) => L.words.includes(x) || L.stems.some((s) => x.length >= s.length + 1 && x.startsWith(s)))
  })
}

/** Aspectos de un comentario con su valoración: la de la frase que los menciona o, si es neutra, la del comentario. */
export function commentAspects(c: Comment): { key: AspectKey; s: Sentiment; text: string }[] {
  const out = new Map<AspectKey, { key: AspectKey; s: Sentiment; text: string }>()
  sentences(c.text).forEach((f) => {
    const ks = aspectsIn(f)
    if (!ks.length) return
    const fs = sentiment(f).label
    const s: Sentiment = c.sentimentManual || c.brandStance ? c.sentiment : fs !== 'neutral' ? fs : c.sentiment
    ks.forEach((k) => { const prev = out.get(k); if (!prev || (prev.s === 'neutral' && s !== 'neutral') || (s === 'negativo' && prev.s === 'positivo')) out.set(k, { key: k, s, text: f }) })
  })
  return [...out.values()]
}

export interface AspectRow {
  key: AspectKey; name: string; short: string; advice: string
  n: number; pos: number; neg: number; neu: number
  /** Valoración: fortaleza, a mejorar (mixto) o punto débil. */
  verdict: 'fortaleza' | 'mixto' | 'debil'
  posEx: Comment[]; negEx: Comment[]
}
export interface RivalAspect { key: AspectKey; name: string; short: string; favor: number; against: number; rivals: string[]; ex: Comment[] }
export interface AspectEval { brand: AspectRow[]; rivals: RivalAspect[] }

const byImpact = (a: Comment, b: Comment) => (b.reactions || 0) - (a.reactions || 0) || (b.text || '').length - (a.text || '').length

/**
 * Evalúa la marca por aspecto (comentarios sobre la marca, sin el equipo ni las comparaciones)
 * y, aparte, lo que se dice de la competencia en esos mismos aspectos.
 */
export function evaluateAspects(brandList: Comment[], rivalList: Comment[] = [], rivalNameOf: (c: Comment) => string[] = () => []): AspectEval {
  const rivalIds = new Set(rivalList.map((c) => c.id))
  const acc = new Map<AspectKey, { pos: Comment[]; neg: Comment[]; neu: Comment[] }>()
  brandList.forEach((c) => {
    if (c.isTeam || !c.text || rivalIds.has(c.id)) return
    commentAspects(c).forEach(({ key, s }) => {
      const a = acc.get(key) || { pos: [], neg: [], neu: [] }
      ;(s === 'positivo' ? a.pos : s === 'negativo' ? a.neg : a.neu).push(c)
      acc.set(key, a)
    })
  })
  const brand: AspectRow[] = ASPECTS.filter((d) => acc.has(d.key)).map((d) => {
    const a = acc.get(d.key)!, n = a.pos.length + a.neg.length + a.neu.length
    const net = (a.pos.length - a.neg.length) / Math.max(1, a.pos.length + a.neg.length)
    const verdict: AspectRow['verdict'] = a.neg.length && (net <= -0.2 || a.neg.length >= 3 && a.neg.length >= a.pos.length) ? 'debil' : net >= 0.3 && a.pos.length ? 'fortaleza' : 'mixto'
    return { ...d, n, pos: a.pos.length, neg: a.neg.length, neu: a.neu.length, verdict, posEx: [...a.pos].sort(byImpact).slice(0, 2), negEx: [...a.neg].sort(byImpact).slice(0, 2) }
  }).sort((x, y) => y.n - x.n)
  // competencia: a favor = el comentario elogia o prefiere al competidor en ese aspecto
  const racc = new Map<AspectKey, { favor: Comment[]; against: Comment[]; names: Set<string> }>()
  rivalList.forEach((c) => {
    if (c.isTeam || !c.text) return
    commentAspects(c).forEach(({ key, text }) => {
      const r = racc.get(key) || { favor: [], against: [], names: new Set<string>() }
      const fs = sentiment(text).label
      ;(c.brandStance || fs === 'positivo' ? r.favor : fs === 'negativo' ? r.against : r.favor).push(c)
      rivalNameOf(c).forEach((n) => r.names.add(n))
      racc.set(key, r)
    })
  })
  const rivals: RivalAspect[] = ASPECTS.filter((d) => racc.has(d.key)).map((d) => {
    const r = racc.get(d.key)!
    return { key: d.key, name: d.name, short: d.short, favor: r.favor.length, against: r.against.length, rivals: [...r.names].slice(0, 3), ex: [...r.favor, ...r.against].sort(byImpact).slice(0, 2) }
  }).sort((x, y) => y.favor - x.favor || y.against - x.against)
  return { brand, rivals }
}
