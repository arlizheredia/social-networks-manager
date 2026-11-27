import type { Comment } from './types'

/** Intención del comentario: decide qué tipo de respuesta corresponde. */
export type Intent = 'saludo' | 'queja' | 'precio' | 'envio' | 'disponibilidad' | 'pregunta' | 'elogio' | 'negativo' | 'general'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const RX: [Intent, RegExp][] = [
  ['queja', /\b(demora|demorad|no (ha )?llega|no me (ha )?llegad|nadie (me )?respond|estafa|robo|mal servicio|pesimo|decepcion|reclam|todavia no|aun no|faltab|vino (mal|roto|podrido|descongelad)|lleva \d+ dias|no contestan)/],
  ['precio', /\b(precio|cuanto (cuesta|vale|sale)|cuesta|valor|costo|usd|dolares|\$)/],
  ['envio', /\b(envio|envian|entrega|llega(n)? a|hacen entregas|a domicilio|mandan|domicilio|(llevan|entregan) a|municipio|provincia|holguin|granma|santiago|guantanamo|las tunas)/],
  ['disponibilidad', /\b(tienen|hay|queda(n)?|disponible|venden)\b/],
  ['saludo', /\b(saludos? (a|para)|un saludo|besos (a|para)|abrazos? (a|para)|felicidades|feliz (cumple|dia)|mi (familia|mama|madre|papa|abuela|hij[oa]|herman[oa])|los quiero|te quiero|bendicion)/],
  ['elogio', /\b(excelente|gracias|recomiendo|buen(isimo|o)? servicio|lo mejor|puntuales|rapid(o|isimo)|calidad|encant|feliz|contento|satisfech|10 de 10|100 ?%)/],
]

export function intentOf(c: Pick<Comment, 'text' | 'sentiment' | 'isQuestion'>): Intent {
  const t = fold(c.text || '')
  const hit = (k: Intent) => RX.find(([i]) => i === k)![1].test(t)
  if (hit('queja') || (c.sentiment === 'negativo' && /\b(pedido|orden|combo|envio|entrega)/.test(t))) return 'queja'
  if (c.isQuestion || /\?/.test(t)) {
    if (hit('precio')) return 'precio'
    if (hit('envio')) return 'envio'
    if (hit('disponibilidad')) return 'disponibilidad'
    return 'pregunta'
  }
  if (hit('saludo')) return 'saludo'
  if (hit('elogio') || c.sentiment === 'positivo') return 'elogio'
  if (c.sentiment === 'negativo') return 'negativo'
  return 'general'
}

/* {n} = nombre de pila · {m} = cliente/marca (Preferencias); cada intención tiene variantes distintas */
const T: Record<Intent, string[]> = {
  saludo: [
    '¡Gracias, {n}! En {m} hacemos llegar tu cariño a toda la familia. ¡Un abrazo grande! ❤️',
    '¡Qué lindo mensaje, {n}! Gracias por confiar en {m} para estar cerca de los tuyos. 🤗',
    '¡Saludos para ti también, {n}! Todo el equipo de {m} les desea que disfruten mucho en familia. 😊',
  ],
  elogio: [
    '¡Muchas gracias, {n}! En {m} nos alegra mucho saber que quedaste contento/a. 😊',
    '¡Gracias por tus palabras, {n}! En {m} seguimos trabajando para darte siempre el mejor servicio.',
    '¡Qué alegría leerte, {n}! Gracias por confiar en {m}. ❤️',
  ],
  queja: [
    'Hola, {n}. En {m} lamentamos mucho lo ocurrido. Escríbenos por mensaje privado con tu número de pedido y lo revisamos enseguida.',
    '{n}, sentimos las molestias. Envía un mensaje privado a {m} con los datos del pedido y le damos solución lo antes posible.',
    'Hola, {n}. Gracias por avisarnos; en {m} queremos resolverlo. Escríbenos por privado y te atendemos de inmediato.',
  ],
  negativo: [
    'Hola, {n}. En {m} sentimos que tu experiencia no haya sido buena. Escríbenos por privado para saber qué pasó y ayudarte.',
    'Gracias por tu comentario, {n}. En {m} tomamos nota para mejorar; si quieres, cuéntanos más por mensaje privado.',
    '{n}, lamentamos que te sientas así. El equipo de {m} está a tu disposición por mensaje privado.',
  ],
  precio: [
    'Hola, {n}. Te enviamos por mensaje privado los precios actualizados de {m}. 😊',
    '¡Hola, {n}! Los precios de {m} dependen del combo y del destino; escríbenos por privado y te pasamos el detalle.',
    'Hola, {n}. Con gusto te informamos; revisa tu bandeja de mensajes, {m} te escribe con los precios.',
  ],
  envio: [
    'Hola, {n}. Escribe a {m} por privado con el municipio de entrega y te confirmamos disponibilidad y tiempo de envío.',
    '¡Hola, {n}! Para confirmarte la entrega de {m}, dinos por mensaje privado el municipio y la provincia.',
    'Hola, {n}. Con gusto te informamos sobre la entrega; envía a {m} un mensaje privado con la dirección de destino.',
  ],
  disponibilidad: [
    'Hola, {n}. En {m} te confirmamos la disponibilidad por mensaje privado. 😊',
    '¡Hola, {n}! Escribe a {m} por privado y te decimos qué tenemos disponible ahora mismo.',
    'Hola, {n}. Con gusto te ayudamos; revisa tu bandeja de mensajes, {m} te escribe con los detalles.',
  ],
  pregunta: [
    'Hola, {n}. En {m} con gusto te ayudamos; escríbenos por mensaje privado y te respondemos enseguida.',
    '¡Hola, {n}! {m} te escribe por privado para darte toda la información.',
    'Hola, {n}. Gracias por tu pregunta; revisa tu bandeja de mensajes, {m} te contesta por allí.',
  ],
  general: [
    '¡Gracias por tu comentario, {n}! Un saludo de parte de {m}. 😊',
    '¡Gracias por estar con {m}, {n}!',
    'Hola, {n}. Gracias por escribir a {m}; si necesitas algo, estamos por mensaje privado.',
  ],
}

export const firstName = (c: Pick<Comment, 'authorName'>) => String(c.authorName || '').replace(/^@/, '').trim().split(/\s+/)[0] || ''

/** Respuestas fiables según la intención (sin IA). */
export function templateReplies(c: Comment, n = 3, brand = ''): string[] {
  const name = firstName(c)
  return T[intentOf(c)].slice(0, n).map((t) => fillName(fillBrand(t, brand.trim()), name))
}
/** Sin marca configurada, la frase se adapta para no dejar huecos. */
function fillBrand(t: string, m: string) {
  if (m) return t.replace(/\{m\}/g, m)
  return t.replace(/confiar en \{m\}/g, 'confiar en nosotros').replace(/Escribe a \{m\}/g, 'Escríbenos').replace(/envía a \{m\} un/g, 'envíanos un').replace(/En \{m\} /g, '').replace(/ en \{m\}/g, '').replace(/el equipo de \{m\}/gi, (x) => (x[0] === 'E' ? 'Nuestro equipo' : 'nuestro equipo'))
    .replace(/Todo el equipo de \{m\}/g, 'Todo nuestro equipo').replace(/ de parte de \{m\}/g, '').replace(/ (de|a|con) \{m\}/g, (_, p: string) => (p === 'de' ? '' : p === 'con' ? ' con nosotros' : ''))
    .replace(/\{m\} te escribe/g, 'te escribimos').replace(/\{m\} te contesta/g, 'te contestamos').replace(/^¡Hola, \{n\}! \{m\}/, '¡Hola, {n}!').replace(/\{m\}\s*/g, '')
    .replace(/^([a-záéíóúñ])/, (x) => x.toUpperCase()).replace(/([.!?] )([a-záéíóúñ])/g, (_, a: string, b2: string) => a + b2.toUpperCase())
}
function fillName(t: string, name: string) {
  if (name) return t.replace(/\{n\}/g, name)
  const s = t.replace(/, \{n\}/g, '').replace(/^\{n\}, (\S)/, (_, ch: string) => ch.toUpperCase())
  return s.replace(/\{n\}\s*/g, '').trim()
}
