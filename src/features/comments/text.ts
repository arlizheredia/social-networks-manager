/** Análisis de texto: plataformas, fechas relativas, tokenización y sentimiento (portado de Social Comments Analyzer). */
import type { Platform, Sentiment } from './types'

export const PLATFORMS: Record<Platform, { name: string; reactLabel: string; color: string; icon: string }> = {
  facebook: { name: 'Facebook', reactLabel: 'Reacciones', color: 'fb', icon: 'thumb_up' },
  instagram: { name: 'Instagram', reactLabel: 'Me gusta', color: 'ig', icon: 'favorite' },
  tiktok: { name: 'TikTok', reactLabel: 'Me gusta', color: 'tt', icon: 'favorite' },
}
export const platName = (p?: string) => (PLATFORMS[p as Platform] ?? PLATFORMS.facebook).name

export function detectPlatform(text: string): Platform | null {
  const s = String(text || '')
  if (/(^|[/.])(instagram\.com|instagr\.am)\//i.test(s) || /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\b/i.test(s)) return 'instagram'
  if (/(^|[/.])tiktok\.com\//i.test(s) || /^(https?:\/\/)?([a-z]+\.)?tiktok\.com\b/i.test(s)) return 'tiktok'
  if (/(^|[/.])(facebook\.com|fb\.com|fb\.watch|fb\.me)\//i.test(s) || /^(https?:\/\/)?([a-z]+\.)?(facebook\.com|fb\.watch)\b/i.test(s)) return 'facebook'
  return null
}

/** Enlace canónico de una publicación (sin parámetros de seguimiento) para no duplicarla. */
export function canonUrl(u: string) {
  try {
    const x = new URL(/^https?:/i.test(u) ? u : 'https://' + u.trim())
    x.hash = ''
    x.hostname = x.hostname.replace(/^(m|mbasic|web|business)\./, 'www.')
    const keep = ['story_fbid', 'id', 'v', 'fbid', 'set']
    ;[...x.searchParams.keys()].forEach((k) => { if (!keep.includes(k)) x.searchParams.delete(k) })
    return x.toString().replace(/\/$/, '')
  } catch { return String(u).trim() }
}

/* ---------- Fechas relativas ---------- */
const MONTHS: Record<string, number> = { ene: 0, enero: 0, jan: 0, january: 0, feb: 1, febrero: 1, february: 1, mar: 2, marzo: 2, march: 2, abr: 3, abril: 3, apr: 3, april: 3, may: 4, mayo: 4, jun: 5, junio: 5, june: 5, jul: 6, julio: 6, july: 6, ago: 7, agosto: 7, aug: 7, august: 7, sep: 8, sept: 8, septiembre: 8, setiembre: 8, september: 8, oct: 9, octubre: 9, october: 9, nov: 10, noviembre: 10, november: 10, dic: 11, diciembre: 11, dec: 11, december: 11 }
export function parseFbDate(str: unknown, baseIso?: string): string | null {
  if (!str) return null
  const raw = String(str)
  const base = baseIso ? new Date(baseIso) : new Date()
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  let ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3], 12).toISOString()
  ymd = s.match(/^(\d{1,2})-(\d{1,2})$/) // TikTok: mes-día del año en curso
  if (ymd) { const d = new Date(base.getFullYear(), +ymd[1] - 1, +ymd[2], 12); if (d > base) d.setFullYear(d.getFullYear() - 1); return d.toISOString() }
  if (/^(ahora|justo ahora|just now|now|à l.instant|agora)/.test(s)) return base.toISOString()
  if (/(^|\s)(ayer|yesterday|hier|ontem)(\s|$)/.test(s)) { const d = new Date(base); d.setDate(d.getDate() - 1); return d.toISOString() }
  const m = s.match(/(\d+)\s*(segundos?|seg|sec(?:onds?)?|s|minutos?|mins?|minutes?|m|horas?|hrs?|hours?|h|d[ií]as?|days?|jours?|d|semanas?|sem|weeks?|wks?|w|meses?|months?|mois|mes|mo|años?|anos?|years?|yrs?|ans?|a|y)\b/)
  if (m) {
    const n = +m[1], u = m[2], d = new Date(base)
    if (/^(mes|mo|month|mois)/.test(u)) d.setMonth(d.getMonth() - n)
    else if (/^(seg|sec|s$)/.test(u)) d.setSeconds(d.getSeconds() - n)
    else if (/^(min|m$)/.test(u)) d.setMinutes(d.getMinutes() - n)
    else if (/^(h|hora|hr|hour)/.test(u)) d.setHours(d.getHours() - n)
    else if (/^(sem|w|week|wk)/.test(u)) d.setDate(d.getDate() - 7 * n)
    else if (/^(d|dí|di|day|jour)/.test(u)) d.setDate(d.getDate() - n)
    else if (/^(a|añ|an|y|yr|year)/.test(u)) d.setFullYear(d.getFullYear() - n)
    return d.toISOString()
  }
  let mm = s.match(/(\d{1,2}) de ([a-zé]+)(?: de (\d{4}))?(?:.*?(\d{1,2}):(\d{2}))?/)
  if (mm && MONTHS[mm[2]] != null) return new Date(mm[3] ? +mm[3] : base.getFullYear(), MONTHS[mm[2]], +mm[1], mm[4] ? +mm[4] : 12, mm[5] ? +mm[5] : 0).toISOString()
  mm = s.match(/([a-z]+) (\d{1,2})(?:, (\d{4}))?(?:.*?(\d{1,2}):(\d{2})\s*(am|pm)?)?/)
  if (mm && MONTHS[mm[1]] != null) {
    let h = mm[4] ? +mm[4] : 12
    if (mm[6] === 'pm' && h < 12) h += 12
    if (mm[6] === 'am' && h === 12) h = 0
    return new Date(mm[3] ? +mm[3] : base.getFullYear(), MONTHS[mm[1]], +mm[2], h, mm[5] ? +mm[5] : 0).toISOString()
  }
  const t = Date.parse(raw)
  return isNaN(t) ? null : new Date(t).toISOString()
}

/* ---------- Tokenización y sentimiento ---------- */
export const STOP = new Set(('sido estoy está están tengo tenía hemos he a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar estas este esto estos fue fueron ha hace hacia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que quien se sea ser si sin sobre son su sus tambien te tiene tienen todo todos tu tus un una uno unos usted ustedes y ya yo vos q k pq xq x d tb tmb jaja jajaja jajajaja jeje ok asi aqui ahi solo cada mismo misma hoy van va voy será sí también así aquí ahí más qué cómo cuál dónde él tú mí ' +
  'the a an and or but if of to in on at by for with about as is are was were be been being have has had do does did not no yes it its this that these those i you he she we they me my your our their them his her so just than then there here what which who whom will would can could should from up out into over all any some more most very too also').split(/\s+/))
const POS = ['bueno', 'buena', 'buenos', 'buenas', 'excelente', 'genial', 'gracias', 'increíble', 'increible', 'hermoso', 'hermosa', 'bonito', 'bonita', 'lindo', 'linda', 'perfecto', 'perfecta', 'encanta', 'encantó', 'amo', 'amor', 'felicidades', 'felicitaciones', 'bien', 'mejor', 'maravilloso', 'maravillosa', 'fantástico', 'fantastico', 'feliz', 'super', 'súper', 'recomendado', 'recomiendo', 'espectacular', 'bendiciones', 'éxito', 'exito', 'apoyo', 'top', 'crack', 'bravo', 'precioso', 'preciosa', 'divino', 'fascinante', 'orgullo', 'calidad', 'rápido', 'rapido', 'agradecido', 'agradecida', 'great', 'good', 'love', 'awesome', 'amazing', 'excellent', 'thanks', 'thank', 'nice', 'beautiful', 'perfect', 'best', 'happy', 'wonderful', 'cool', 'congrats', 'congratulations', 'recommend',
  'mejores', 'lo mejor', 'excelentes', 'buenisimo', 'buenísimo', 'buenisima', 'buenísima',
  'puntual', 'puntuales', 'eficiente', 'eficientes', 'amable', 'amables', 'atento', 'atenta', 'atentos', 'personalizada', 'personalizado', 'satisfecho', 'satisfecha', 'satisfechos', 'contento', 'contenta', 'contentos', 'fresco', 'fresca', 'frescos', 'frescas', 'confiable', 'confiables', 'seguro', 'segura', 'responsables', 'profesional', 'profesionales', 'impecable', 'encantado', 'encantada', 'agradezco', 'riquísimo', 'riquisimo', 'rico', 'rica', 'delicioso', 'deliciosa', 'ok', 'fast', 'friendly', 'fresh', 'reliable']
const NEG = ['malo', 'mala', 'malos', 'malas', 'pésimo', 'pesimo', 'pésima', 'pesima', 'horrible', 'terrible', 'odio', 'asco', 'fraude', 'estafa', 'estafadores', 'mentira', 'mentiras', 'mentirosos', 'peor', 'basura', 'triste', 'decepción', 'decepcion', 'decepcionado', 'decepcionada', 'problema', 'problemas', 'queja', 'nunca', 'lamentable', 'vergüenza', 'verguenza', 'robo', 'ladrones', 'caro', 'lento', 'error', 'falla', 'fallas', 'mal', 'tarde', 'molesto', 'molesta', 'indignante', 'abuso', 'denuncia', 'cancelar', 'bad', 'worst', 'hate', 'awful', 'scam', 'fraud', 'poor', 'sad', 'angry', 'disappointed', 'problem', 'slow', 'broken', 'fake', 'never',
  'falló', 'fallo', 'fallaron', 'fallan', 'fallando', 'desagradable', 'desagradables', 'tardanza', 'tardanzas', 'demora', 'demoras', 'demorado', 'retraso', 'retrasos', 'retrasado', 'maloliente', 'malolientes', 'podrido', 'podrida', 'podridos', 'podridas', 'vencido', 'vencida', 'vencidos', 'vencidas', 'roto', 'rota', 'rotos', 'rotas', 'dañado', 'dañada', 'dañados', 'dañadas', 'defectuoso', 'defectuosa', 'incompleto', 'incompleta', 'equivocado', 'equivocada', 'apestoso', 'apestosa', 'asqueroso', 'asquerosa', 'engaño', 'engañan', 'engañaron', 'engañado', 'engañada', 'estafaron', 'estafado', 'estafada', 'robaron', 'robado', 'irresponsable', 'irresponsables', 'incumplen', 'incumplieron', 'incumplimiento', 'pérdida', 'perdida', 'perdido', 'frustrante', 'frustrado', 'frustrada', 'insatisfecho', 'insatisfecha', 'descontento', 'descontenta', 'inaceptable', 'desastre', 'fatal', 'nefasto', 'nefasta', 'mediocre', 'ineficiente', 'ineficientes', 'grosero', 'grosera', 'groseros', 'maltrato', 'reclamo', 'reclamación', 'reclamacion', 'devolución', 'devolucion', 'reembolso', 'nadie', 'ignoran', 'espera', 'esperando', 'tardaron', 'tardan', 'tarda', 'demoran', 'demoraron', 'jamás', 'jamas', 'cobran', 'cobraron', 'abusivo', 'abusivos', 'olor', 'hediondo', 'feo', 'fea', 'feos', 'feas', 'disgusto', 'arrepentido', 'arrepentida', 'horror', 'desastroso', 'desastrosa', 'rude', 'late', 'delay', 'delayed', 'rotten', 'damaged', 'refund', 'worse',
  // calidad de alimentos y productos
  'descongelado', 'descongelada', 'descongelados', 'descongeladas', 'crudo', 'cruda', 'crudos', 'crudas', 'quemado', 'quemada', 'quemados', 'quemadas',
  'rancio', 'rancia', 'rancios', 'rancias', 'caducado', 'caducada', 'caducados', 'caducadas', 'mohoso', 'mohosa', 'moho', 'insípido', 'insipido', 'insípida', 'insipida',
  'aguado', 'aguada', 'salado', 'salada', 'sucio', 'sucia', 'sucios', 'sucias', 'derretido', 'derretida', 'abollado', 'abollada', 'aplastado', 'aplastada',
  'golpeado', 'golpeada', 'magullado', 'magullada', 'pegajoso', 'pegajosa', 'faltó', 'falto', 'faltaron', 'faltaba', 'faltaban', 'expired', 'spoiled', 'stale', 'burnt', 'raw', 'dirty']
const POS_E = ['❤', '😍', '🥰', '😊', '😁', '😀', '😃', '👍', '👏', '🙌', '💯', '🔥', '🎉', '💪', '😂', '🤣', '💙', '💚', '💛', '💜', '♥', '😘', '🤩', '✨', '🙏']
const NEG_E = ['😡', '😠', '🤬', '👎', '😢', '😭', '😞', '😒', '🙄', '💩', '😤', '😔', '😩', '😫', '🤮', '😑']
const POSS = new Set(POS), NEGS = new Set(NEG)
const NEG_STEMS = ['desagrad', 'tardanz', 'demor', 'retras', 'malolient', 'podrid', 'apest', 'asquer', 'estaf', 'engan', 'defectuos', 'incumpl', 'irrespons', 'decepcion', 'frustr', 'insatisf', 'descontent', 'indign', 'pesim', 'horribl', 'lamentabl', 'vergonz', 'abusiv', 'fraudul', 'descongel', 'caducad', 'insipid', 'mohos', 'abollad', 'aplastad', 'magullad']
const POS_STEMS = ['recomend', 'agradec', 'excelen', 'encant', 'maravill', 'fantast', 'satisf', 'puntual', 'eficien', 'profesional', 'felicit', 'impecabl']
const ADVERSATIVE = new Set(['pero', 'aunque', 'sin embargo', 'embargo', 'but', 'however'])
const NEGATORS = new Set(['no', 'nunca', 'ni', 'jamás', 'jamas', 'not', 'never', 'sin'])

export const norm = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '')
export const normL = (s: unknown) => norm(String(s || '').replace(/\s+/g, ' ').trim().toLowerCase())
export const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu
export const tokenize = (text: string) => (text || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []

function polarity(w: string) {
  const n = norm(w)
  if (NEGS.has(w) || NEGS.has(n)) return -1 // lo negativo primero: «insatisfecho» no cuenta como «satisf…»
  if (POSS.has(w) || POSS.has(n)) return 1
  if (n.length >= 5) {
    if (NEG_STEMS.some((s) => n.startsWith(s))) return -1
    if (POS_STEMS.some((s) => n.startsWith(s))) return 1
  }
  return 0
}

/**
 * Temperatura según lo que se nombra cerca (hasta 4 palabras): «cerveza fría» es un elogio y «pizza fría», una queja;
 * con «caliente» es al revés. Sin bebida ni comida cerca no cuenta.
 */
const COLD = /^(fri[oa]s?|fresquit[oa]s?|helad[oa]s?|heladit[oa]s?|congelad[oa]s?|cold|iced)$/
const HOT = /^(calientes?|calentit[oa]s?|tibi[oa]s?|hot|warm)$/
const DRINK = /^(carnes?|pollos?|pescados?|mariscos?|camarones?|cerdo|res|embutidos?|jamon|jamones|salchichas?|picadillo|queso|quesos|leches?|yogures?|yogur|mantequillas?|helados?|cervezas?|birras?|refrescos?|bebidas?|aguas?|jugos?|zumos?|colas?|maltas?|vinos?|sodas?|limonadas?|batidos?|tragos?|cocteles?|cocktails?|beers?|drinks?|sodas?)$/
const FOOD = /^(comidas?|pizzas?|sopas?|cafes?|hamburguesas?|papas?|patatas?|pan|panes|arroz|platos?|pedidos?|almuerzos?|cenas?|desayunos?|pastas?|frituras?|croquetas?|empanadas?|tacos?|food|meal|coffee|fries)$/
function tempPolarity(toks: string[], i: number) {
  const n = norm(toks[i]), cold = COLD.test(n), hot = HOT.test(n)
  if (!cold && !hot) return 0
  // bebidas y productos que se venden fríos (carne, pollo, lácteos…): frío es bueno; comida servida: caliente es bueno
  let kind: 'drink' | 'food' | null = null
  for (let d = 1; d <= 4 && !kind; d++) for (const j of [i - d, i + d]) { const w = toks[j] && norm(toks[j]); if (!w) continue; if (DRINK.test(w)) { kind = 'drink'; break } if (FOOD.test(w)) { kind = 'food'; break } }
  if (!kind) return 0
  return (kind === 'drink') === cold ? 1 : -1
}

/**
 * Precios: «precios altos», «los cambios muy caros», «la página está cara» son quejas; «precios bajos», elogio.
 * «cara» solo cuenta como adjetivo (tras «está», «muy», «tan»…), no como «cara a cara».
 */
const PRICE = /^(precios?|costos?|coste|costes|tarifas?|cambios?|tasas?|comision|comisiones|envios?|domicilios?|delivery|mensajeria|cobros?|cuotas?|valor|prices?|fees?|shipping|rates?)$/
const HIGH = /^(altos?|altas?|elevad[oa]s?|car[oa]s|carisim[oa]s?|excesiv[oa]s?|high|expensive)$/
const LOW = /^(baj[oa]s?|economic[oa]s?|accesibles?|asequibles?|barat[oa]s?|baratisim[oa]s?|low|cheap)$/
const BEFORE_ADJ = new Set(['esta', 'estan', 'es', 'son', 'muy', 'tan', 'bastante', 'demasiado', 'mas', 'algo', 're', 'super', 'carisima', 'sale', 'salen', 'resulta', 'resultan'])
function pricePolarity(toks: string[], i: number) {
  const n = norm(toks[i])
  if ((n === 'cara' || n === 'caro') && i > 0 && BEFORE_ADJ.has(norm(toks[i - 1]))) return -1
  const high = HIGH.test(n), low = LOW.test(n)
  if (!high && !low) return 0
  const near = [-3, -2, -1, 1, 2, 3].some((d) => toks[i + d] && PRICE.test(norm(toks[i + d])))
  // «carísimo», «caros» se quejan aunque no se nombre el precio
  if (!near) return high && /^car/.test(n) ? -1 : 0
  return high ? -1 : 1
}

/**
 * +1 por término positivo, −1,5 por negativo (las quejas pesan más que los elogios de cortesía);
 * la negación previa invierte; lo que sigue a «pero/aunque» vale el doble; los emojis suman o restan 1.
 */
export function sentiment(text: string): { score: number; label: Sentiment } {
  const toks = tokenize(text)
  let score = 0, boost = 1
  toks.forEach((w, i) => {
    if (ADVERSATIVE.has(w)) { boost = 2; return }
    if (w === 'nadie' && i > 0 && (toks[i - 1] === 'que' || toks[i - 1] === 'como')) return
    const pol = tempPolarity(toks, i) || pricePolarity(toks, i) || polarity(w)
    if (!pol) return
    const neg = (i > 0 && NEGATORS.has(toks[i - 1])) || (i > 1 && NEGATORS.has(toks[i - 2]) && !polarity(toks[i - 1]))
    const v = neg ? -pol : pol
    score += (v < 0 ? -1.5 : 1) * boost
  })
  score = Math.round(score * 2) / 2
  POS_E.forEach((e) => { if (text.includes(e)) score += 1 })
  NEG_E.forEach((e) => { if (text.includes(e)) score -= 1 })
  return { score, label: score > 0 ? 'positivo' : score < 0 ? 'negativo' : 'neutral' }
}

export const SENT_LABEL: Record<Sentiment, string> = { positivo: 'Positivo', neutral: 'Neutral', negativo: 'Negativo' }
