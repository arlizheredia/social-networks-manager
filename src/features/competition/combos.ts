/**
 * Combos de comida a partir del texto de los sitios y de Google: nombre, precio, peso, contenido (producto,
 * cantidad, unidad, marca), precio por libra y si el sitio lo destaca como más vendido. Con reglas, no con la IA:
 * el modelo pequeño inventaría cantidades y precios.
 */
import { normL } from '@/features/comments/text'
import { pricesIn } from './data'

export interface ComboItem { product: string; qty: number | null; unit: string; brand: string }
export interface Combo {
  name: string; price: number; currency: string
  /** Peso total en libras (explícito o sumado del contenido); 0 = sin dato. */
  weightLb: number
  items: ComboItem[]
  /** Precio por libra (USD) cuando se conoce el peso. */
  perLb: number | null
  bestSeller: boolean
  url: string
}

/** Productos habituales en los combos (forma canónica). */
const PRODUCTS: [string, RegExp][] = [
  ['Pollo', /\b(pollo|muslos?|cuartos? de pollo|pechugas?|alitas?)\b/], ['Cerdo', /\b(cerdo|chuletas?|lomo|masas? de cerdo|costillas?|pierna)\b/],
  ['Carne de res', /\b(res|carne de res|bistec|ternera)\b/], ['Picadillo', /\bpicadillo\b/], ['Jamón', /\bjamon(es)?\b/], ['Salchichas', /\b(salchichas?|perros calientes)\b/],
  ['Mortadella', /\b(mortadella|mortadela)\b/], ['Pescado', /\b(pescado|pargo|tilapia|merluza|atun|sardinas?)\b/], ['Huevos', /\bhuevos?\b/],
  ['Arroz', /\barroz\b/], ['Frijoles', /\b(frijol(es)?|frijoles negros|frijoles colorados|chicharos?|garbanzos?|lentejas?)\b/], ['Azúcar', /\bazucar\b/],
  ['Aceite', /\baceite\b/], ['Café', /\bcafe\b/], ['Leche', /\b(leche|leche en polvo)\b/], ['Pastas', /\b(espaguetis?|spaghetti|pastas?|coditos|macarrones|fideos)\b/],
  ['Puré de tomate', /\b(pure|pasta|salsa) de tomate\b/], ['Harina', /\bharina\b/], ['Sal', /\bsal\b/], ['Viandas', /\b(viandas?|malanga|yuca|boniato|papas?|platanos?)\b/],
  ['Galletas', /\bgalletas?\b/], ['Refrescos', /\b(refrescos?|maltas?|jugos?)\b/], ['Cerveza', /\bcervezas?\b/], ['Queso', /\bquesos?\b/], ['Mantequilla', /\b(mantequilla|margarina)\b/],
  ['Detergente', /\b(detergente|jabon|champu|aseo|papel higienico|pasta dental)\b/], ['Condimentos', /\b(condimentos?|sazon|comino|ajo|cebolla|vinagre)\b/],
]
/** Solo combos de comida: un alimento en el contenido o en el nombre (no ferretería, aseo solo, envíos…). */
const FOOD_NAME = /(comida|aliment|despensa|carnic|proteina|desayun|almuerzo|cena|pollo|cerdo|\bres\b|arroz|frijol|cafe|leche|huevo|picadillo|mercado|viveres|bodega|cocina)/
const NOT_COMBO = /(^paso\s*\d|se env[ií]a|enviamos|tiempo establecido|rastre|seguimiento|aduana|tu paquete|nuestros? paquetes?|electrodom|ferret|ropa|calzado|celular|telefon|medicin|farmac|art[ií]culos de)/
const isFood = (p: string) => p !== 'Detergente'
const UNIT = /(\d+(?:[.,]\d+)?)\s*(lbs?|libras?|kg|kgs|kilos?|kilogramos?|g|gr|grs|gramos|ml|l|lt|litros?|oz|u|ud|uds|unidad(?:es)?|paquetes?|latas?|botellas?|pomos?|cajas?|bolsas?)\b/i
const COMBO_WORD = /\b(combos?|paquetes?|kit|jabas?|canastas?|modulos?|bolsas?)\b/i
const BEST = /(mas vendid|best ?seller|popular|top ventas|favorit|recomendad|destacad|el preferido|oferta especial)/
/** Marcas habituales en combos para Cuba (además, palabras con mayúscula junto al producto). */
const KNOWN_BRANDS = ['Serrano', 'Cubita', 'Ybarra', 'Carbonell', 'Goya', 'Nestlé', 'Nido', 'Tyson', 'Perdue', 'Iberia', 'Barilla', 'Gallo', 'La Fina', 'Hamby', 'Sonrisa', 'Gilda', 'Vima', 'Mazola', 'Dos Pinos', 'Pilón', 'Bustelo', 'Café Bustelo', 'La Llave', 'Kirkland', 'Del Monte', 'Hunts', "Hunt's", 'Oscar Mayer', 'Sabor de Cuba', 'Ciego Montero', 'Bucanero', 'Cristal', 'Tropical']
const NOT_BRAND = new Set('combo combos paquete paquetes kit jaba canasta este contiene incluye total precio envio entrega cuba habana santiago holguin granma tunas guantanamo de del la el los las con para y o en por lb lbs kg ml unidad unidades familiar basico básico super súper especial cocina clasico clásico premium mixto económico economico grande pequeño mediano carne carnes polvo molida molido fresco fresca frescos temporada natural blanco blanca negro negros colorados entero entera paquete bolsa lata pomo botella caja unidad libra libras kilo gramos litro'.split(' '))

const toLb = (q: number, u: string) => { const x = u.toLowerCase(); return /^(lbs?|libras?)$/.test(x) ? q : /^(kg|kgs|kilos?|kilogramos?)$/.test(x) ? q * 2.2046 : /^(g|gr|grs|gramos)$/.test(x) ? q / 453.6 : /^oz$/.test(x) ? q / 16 : 0 }
const unitName = (u: string) => { const x = u.toLowerCase(); return /^(lbs?|libras?)$/.test(x) ? 'lb' : /^(kg|kgs|kilos?|kilogramos?)$/.test(x) ? 'kg' : /^(g|gr|grs|gramos)$/.test(x) ? 'g' : /^(l|lt|litros?)$/.test(x) ? 'L' : /^ml$/.test(x) ? 'ml' : /^(u|ud|uds|unidad(?:es)?)$/.test(x) ? 'u' : x }

/** Un elemento del contenido: «Pollo 5 lbs», «-1 Aceite Ybarra [900 ml]», «2 x Arroz 5 lb». */
export function parseItem(seg: string): ComboItem | null {
  const raw = seg.replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
  const n = normL(raw)
  const prod = PRODUCTS.find(([, re]) => re.test(n))
  if (!prod) return null
  const m = raw.match(UNIT)
  const lead = raw.match(/^[-–•·*]?\s*(\d{1,2})\s*(?:x\s*)?[A-Za-zÁÉÍÓÚÑáéíóúñ]/)
  let qty: number | null = null, unit = ''
  if (m) { qty = parseFloat(m[1].replace(',', '.')); unit = unitName(m[2]) }
  if (lead && (!m || !/^(lb|kg|g|L|ml)$/.test(unit))) { qty = (qty && unit ? qty : 1) * +lead[1]; if (!unit) unit = 'u' }
  // marca: conocida, o palabra con mayúscula que no es el producto, una unidad ni una palabra común
  const known = KNOWN_BRANDS.find((b) => new RegExp('(^|[^\\p{L}])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(raw))
  let brand = known || ''
  if (!brand) {
    const caps = (raw.match(/\b[A-ZÁÉÍÓÚÑ][\p{L}'’]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'’]{2,})?/gu) || [])
      .filter((w) => !NOT_BRAND.has(normL(w).split(' ')[0]) && !PRODUCTS.some(([, re]) => re.test(normL(w))) && !UNIT.test(w))
    brand = caps[0] || ''
  }
  return { product: prod[0], qty, unit, brand }
}

const SPLIT = /\s*(?:\n|·|•|;|,|\s-\s|\s–\s|(?=\s-\d)|\s\+\s|\by\b(?=\s+\d))\s*/
/** Combos que aparecen en un texto (página de un sitio o fragmento de Google). */
export function extractCombos(text: string, url = ''): Combo[] {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const out: Combo[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!COMBO_WORD.test(line) || line.length > 220) continue
    // bloque: la línea del combo y las siguientes hasta el próximo combo (como mucho 14 líneas)
    const block = [line]
    for (let j = i + 1; j < lines.length && j <= i + 14 && !(COMBO_WORD.test(lines[j]) && pricesIn(lines[j]).length); j++) block.push(lines[j])
    const btxt = block.join('\n')
    const pr = pricesIn(btxt)[0]
    if (!pr) continue
    // nombre: la oración del combo, sin el precio, el contenido ni las palabras de enlace («El combo cárnico sale a $117» → «Combo cárnico»)
    const sent = line.split(/(?<=[.!?])\s+/).find((x) => COMBO_WORD.test(x)) || line
    const at = sent.search(COMBO_WORD)
    let name = (at > 25 ? sent.slice(at) : sent).split(/(?:\s[-–|·:]\s|\$|\d+(?:[.,]\d+)?\s*(?:usd|eur|mlc|dolares|dólares)|este combo|contiene|incluye)/i)[0]
    let prev = ''
    while (prev !== name) { prev = name; name = name.replace(/\s*\b(precio|desde|solo|a|en|por|de|sale|salen|cuesta|cuestan|vale|valen|el|la|los|las|un|una|y|es|son|con|al)\s*$/i, '').replace(/[\s,:;(–—-]+$/, '').trim() }
    name = name.replace(/^(el|la|los|las|un|una|nuestro|nuestra)\s+/i, '')
    name = (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 70)
    if (name.length < 4) continue
    // descartar textos del proceso de envío, listas de categorías y combos que no son de comida
    const nn = normL(name)
    if (NOT_COMBO.test(nn) || (name.match(/,/g) || []).length >= 2 || /\betc\.?$/i.test(name)) continue
    const items: ComboItem[] = []
    btxt.replace(/.*?(contiene|incluye|productos?:)/i, '').split(SPLIT).forEach((seg) => {
      if (seg.length > 90) return
      const it = parseItem(seg)
      if (it && !items.some((x) => x.product === it.product && x.qty === it.qty && x.brand === it.brand)) items.push(it)
    })
    const explicit = name.match(/(\d+(?:[.,]\d+)?)\s*(lbs?|libras?|kg)\b/i) || btxt.match(/(?:total|peso)[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(lbs?|libras?|kg)\b/i)
    const summed = items.reduce((a, x) => a + (x.qty && /^(lb|kg|g)$/.test(x.unit) ? toLb(x.qty, x.unit) : 0), 0)
    // el total nunca es menor que la suma del contenido («Combo Cárnico (carne de res 5 lb, pollo 5 lb)» → 10 lb)
    const weightLb = Math.round(Math.max(explicit ? toLb(parseFloat(explicit[1].replace(',', '.')), explicit[2]) : 0, summed) * 10) / 10
    const perLb = weightLb >= 3 && pr.currency === 'USD' ? Math.round((pr.value / weightLb) * 100) / 100 : null
    if (!items.some((i) => isFood(i.product)) && !FOOD_NAME.test(nn)) continue
    if (!out.some((c) => c.name === name && Math.abs(c.price - pr.value) < 0.01)) out.push({ name, price: pr.value, currency: pr.currency, weightLb, items, perLb, bestSeller: BEST.test(normL(btxt)), url })
  }
  return out.slice(0, 20)
}

/** ¿Es un combo de comida válido? (para filtrar también los ya guardados en las fichas). */
export function validCombo(c: Combo) {
  const nn = normL(c.name)
  if (NOT_COMBO.test(nn) || (c.name.match(/,/g) || []).length >= 2 || /\betc\.?$/i.test(c.name)) return false
  return c.items.some((i) => isFood(i.product)) || FOOD_NAME.test(nn)
}

/** Productos más frecuentes en un conjunto de combos (en cuántos combos aparece cada uno). */
export function topProducts(combos: Combo[], n = 10) {
  const c = new Map<string, number>()
  combos.forEach((x) => new Set(x.items.map((i) => i.product)).forEach((p) => c.set(p, (c.get(p) || 0) + 1)))
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([product, count]) => ({ product, count }))
}
/** Marcas que aparecen en los combos, con su producto. */
export function topBrands(combos: Combo[], n = 12) {
  const c = new Map<string, { brand: string; products: Set<string>; count: number }>()
  combos.forEach((x) => x.items.filter((i) => i.brand).forEach((i) => { const k = normL(i.brand); const e = c.get(k) || { brand: i.brand, products: new Set(), count: 0 }; e.products.add(i.product); e.count++; c.set(k, e) }))
  return [...c.values()].sort((a, b) => b.count - a.count).slice(0, n).map((e) => ({ brand: e.brand, products: [...e.products], count: e.count }))
}
/** Productos que piden los clientes en los comentarios («¿tienen combos de pollo?», «necesito aceite»). */
export function demandedProducts(texts: string[], n = 8) {
  const c = new Map<string, number>()
  texts.forEach((t) => { const x = normL(t); if (!/(combo|tienen|hay|venden|necesito|quiero|busco|cuando|traen|pedi|compre|llego)/.test(x)) return; PRODUCTS.forEach(([p, re]) => { if (re.test(x)) c.set(p, (c.get(p) || 0) + 1) }) })
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([product, count]) => ({ product, count }))
}
