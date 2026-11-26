/**
 * Detección automática de competidores y relleno de sus fichas a partir de los comentarios de los seguimientos.
 * Fuentes (todas dentro de la app; la IA funciona sin Internet):
 *  1. Publicaciones de la competencia que se siguen: el autor de la página es un competidor; lo que él responde es
 *     información oficial (pagos, plazos, precios) y lo que dicen sus clientes, su reputación.
 *  2. Menciones en los comentarios («me envían todo con La Bodega del Chago»).
 *  3. La IA de la app extrae nombres de negocios de los comentarios sobre compras; solo se aceptan los que aparecen
 *     literalmente en el texto (así no inventa).
 * Lo que el usuario corrige en una ficha (`manual`) no se sobrescribe; lo que elimina (`ignored`) no se vuelve a crear.
 */
import { detectRivals } from '@/features/comments/analysis'
import { brandIn, brandKeys } from '@/features/comments/normalize'
import { normL, sentiment } from '@/features/comments/text'
import type { Comment } from '@/features/comments/types'
import { generate, parseJsonLoose, useAI } from '@/features/ai/engine'
import { deliveryHoursIn, paymentsIn, placesIn, pricesIn, PROVINCES, type Province } from './data'
import { newCompetitor, type Competitor, type PriceRef } from './store'
import { extractCombos } from './combos'

export const keyOf = (s: string) => normL(s).replace(/^(la|el|los|las)\s+/, '').replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim()
type C = Comment & { _postAuthor?: string }
export interface Candidate { name: string; aliases: Set<string>; comments: C[]; official: C[]; viaPost: boolean }

/**
 * Solo empresas, sitios y páginas de venta (no personas): el nombre lleva una señal de negocio, es un dominio
 * o tiene forma de marca (DimeCuba, Kanasta24, iTENCEL). «Harry Landy Smith» o «Holguín en fotos» no pasan.
 */
const BUSINESS = /(^|[^a-z])(tiendas?|store|shop|shopping|market|mercado|mercadito|super|supermercado|minimarket|bodegas?|combos?|envios?|express|delivery|mipymes?|pymes?|agencias?|online|comercial|comercializadora|distribuidora|importadora|cafeteria|restaurante|panaderia|dulceria|carniceria|ferreteria|farmacia|remesas|cargo|courier|paqueteria|ventas?|servicios|food|foods|group|grupo|sa|srl|ltd|llc|inc)($|[^a-z])/
export function isBusinessName(name: string) {
  const raw = String(name || '').trim(), n = normL(raw)
  if (raw.length < 3) return false
  if (/\.(com|net|org|cu|shop|store|online|es|us)\b/i.test(raw)) return true // dominio
  if (BUSINESS.test(n)) return true
  if (/\d/.test(raw) || /[a-z][A-Z]/.test(raw) || /^[A-Z]{2,}[a-z]*[A-Z]/.test(raw) || /^i?[A-Z]{3,}$/.test(raw.replace(/\s+/g, ''))) return true // Kanasta24, DimeCuba, iTENCEL
  return false
}
/** Quita fichas detectadas automáticamente que no son negocios (las confirmadas o corregidas se respetan). */
export const pruneNonBusiness = (list: Competitor[]) => list.filter((c) => c.source === 'manual' || c.status === 'confirmado' || (c.manual?.length ?? 0) > 0 || !!c.url || isBusinessName(c.name) || c.aliases.some(isBusinessName))

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const COMMERCE = /(combo|combos|tienda|bodega|market|mercado|envio|envian|entrega|compro|compra|pido|pedido|precio|zelle|paypal|delivery|mipyme|negocio|pagina|agencia)/

/** Competidores que aparecen en los comentarios, con sus comentarios de evidencia. */
export async function findCandidates(all: C[], opts: { ignored?: string[]; known?: Competitor[]; onStep?: (s: string, frac?: number) => void } = {}): Promise<Candidate[]> {
  const bk = brandKeys(), ignored = new Set((opts.ignored || []).map(keyOf))
  const isBrand = (n: string) => !!n && brandIn(normL(n), bk)
  const authors = new Set(all.map((c) => keyOf(c.authorName)).filter(Boolean))
  const out = new Map<string, Candidate>()
  const knownKeys = new Set((opts.known || []).flatMap((f) => [f.name, ...f.aliases]).map(keyOf))
  const add = (name: string, cs: C[], official: C[] = [], viaPost = false) => {
    const k = keyOf(name)
    if (k.length < 3 || ignored.has(k) || isBrand(name)) return
    // por ahora solo empresas, sitios y páginas de venta: las personas no son competidores
    if (!knownKeys.has(k) && (!isBusinessName(name) || authors.has(k) && !BUSINESS.test(normL(name)))) return
    const cur = out.get(k) || { name, aliases: new Set<string>(), comments: [], official: [], viaPost: false }
    cur.aliases.add(name)
    if (name.length > cur.name.length && /[A-ZÁÉÍÓÚÑ]/.test(name)) cur.name = name
    cs.forEach((c) => { if (!cur.comments.includes(c)) cur.comments.push(c) })
    official.forEach((c) => { if (!cur.official.includes(c)) cur.official.push(c) })
    cur.viaPost ||= viaPost
    out.set(k, cur)
  }
  // 1. páginas de la competencia que se siguen
  const byPost = new Map<string, C[]>()
  all.forEach((c) => { const pa = (c._postAuthor || '').trim(); if (pa && !isBrand(pa)) byPost.set(pa, [...(byPost.get(pa) || []), c]) })
  byPost.forEach((cs, pa) => add(pa, cs.filter((c) => keyOf(c.authorName) !== keyOf(pa)), cs.filter((c) => keyOf(c.authorName) === keyOf(pa)), true))
  // 2. menciones (heurística de nombres propios y comparaciones)
  detectRivals(all).forEach((r) => add(r.name, all.filter((c) => r.ids.includes(c.id))))
  // fichas que ya existen: sus menciones por nombre o alias
  ;(opts.known || []).forEach((f) => {
    const ks = [f.name, ...f.aliases].map(keyOf).filter((k) => k.length >= 3)
    const cs = all.filter((c) => ks.some((k) => keyOf(c.text).includes(k)))
    if (cs.length) add(f.name, cs)
  })
  // 3. la IA lee los comentarios sobre compras y extrae nombres de negocios
  if (useAI.getState().installed) {
    const seen = new Set([...out.values()].flatMap((x) => x.comments.map((c) => c.id)))
    const pool = all.filter((c) => !c.isTeam && c.text && !seen.has(c.id) && COMMERCE.test(normL(c.text)) && /[A-ZÁÉÍÓÚÑ][\p{L}]+/u.test(c.text.slice(1))).slice(0, 30)
    for (let i = 0; i < pool.length; i += 10) {
      const batch = pool.slice(i, i + 10)
      opts.onStep?.(`Buscando competidores en los comentarios (${Math.min(i + 10, pool.length)} de ${pool.length})…`, (0.6 * i) / pool.length)
      try {
        const txt = await generate(
          'Extraes nombres de empresas, tiendas online o páginas de venta que venden o envían productos. Nunca nombres de personas. Respondes solo JSON.',
          `Comentarios:\n${batch.map((c, j) => `${j + 1}. ${c.text.replace(/\s+/g, ' ').slice(0, 280)}`).join('\n')}\n\nDevuelve {"negocios":[{"n":número del comentario,"nombre":"nombre exacto como aparece"}]}. Si no hay ninguno, {"negocios":[]}. No incluyas personas.`,
          { maxTokens: 160 })
        const j = parseJsonLoose<{ negocios?: { n?: number; nombre?: string }[] }>(txt)
        ;(j?.negocios || []).forEach((x) => {
          const c = batch[(x.n || 0) - 1], nm = String(x.nombre || '').trim()
          // solo si el nombre aparece tal cual en el comentario y no es una persona que comenta
          if (!c || nm.length < 3 || nm.length > 50 || !keyOf(c.text).includes(keyOf(nm)) || authors.has(keyOf(nm)) || keyOf(nm).split(' ').every((w) => w.length < 4)) return
          add(nm, [c])
        })
      } catch { /* sin IA o respuesta inválida: seguimos con lo detectado */ }
    }
  }
  return [...out.values()].filter((x) => x.comments.length + x.official.length > 0)
}

/** Datos que se deducen de las evidencias de un competidor. */
async function profileOf(c: Candidate, provinces: readonly Province[], useAi = true) {
  const texts = [...c.official, ...c.comments].map((x) => x.text)
  const prov = new Set<Province>()
  texts.forEach((t) => { placesIn(t).forEach((p) => prov.add(p.province)); PROVINCES.forEach((p) => { if (normL(t).includes(normL(p))) prov.add(p) }) })
  // lo que responde la propia página es lo más fiable: pagos, plazos y precios oficiales
  const payments = [...new Set(texts.flatMap(paymentsIn))]
  const hours = median([...c.official.flatMap((x) => deliveryHoursIn(x.text)), ...c.comments.flatMap((x) => deliveryHoursIn(x.text))])
  const prices: PriceRef[] = []
  ;[...c.official, ...c.comments].forEach((x) => pricesIn(x.text).slice(0, 2).forEach((p) => {
    const i = x.text.indexOf(p.raw), before = x.text.slice(Math.max(0, i - 50), i).replace(/.*[.!?\n]/s, '').replace(/\b(a|en|por|sale|cuesta|vale|de|el|la|los|las|un|una)\s*$/i, '').trim()
    if (!prices.some((r) => Math.abs(r.price - p.value) < 0.01)) prices.push({ product: before.slice(-40) || 'Precio mencionado', price: p.value, currency: p.currency, note: `${c.official.includes(x) ? 'Publicado por la página' : 'Mencionado por ' + (x.authorName || 'un cliente')}` })
  }))
  const pos = c.comments.filter((x) => sentiment(x.text).label === 'positivo').length, neg = c.comments.filter((x) => sentiment(x.text).label === 'negativo').length
  const worst = c.comments.filter((x) => sentiment(x.text).label === 'negativo').sort((a, b) => (b.reactions || 0) - (a.reactions || 0))[0]
  let reputation = c.comments.length ? `En los comentarios: ${pos} a favor y ${neg} en contra de ${c.comments.length}.${worst ? ` Queja destacada: «${worst.text.replace(/\s+/g, ' ').slice(0, 120)}».` : ''}` : ''
  let model = ''
  if (useAi && useAI.getState().installed && texts.length) {
    try {
      const txt = await generate(
        'Eres analista de mercado en Cuba. Resumes en una frase corta, en español, solo con lo que dicen los textos. Si no hay datos, respondes "sin datos".',
        `Negocio: ${c.name}\nTextos sobre él:\n${texts.slice(0, 10).map((t) => '- ' + t.replace(/\s+/g, ' ').slice(0, 220)).join('\n')}\n\n¿Cuál es su propuesta de valor (qué ofrece y por qué lo eligen)?`,
        { maxTokens: 70 })
      const m = String(txt || '').replace(/\s+/g, ' ').replace(/^["«]|["»]$/g, '').trim()
      if (m.length > 12 && !/sin datos/i.test(m)) model = m.slice(0, 220)
    } catch { /* sin propuesta */ }
  }
  if (!model && c.official.length) model = `Lo que publica la página: «${c.official[0].text.replace(/\s+/g, ' ').slice(0, 140)}»`
  if (!reputation && c.official.length) reputation = 'Sin opiniones de clientes en los comentarios seguidos.'
  const combos = c.official.flatMap((x) => extractCombos(x.text))
  return { combos, provinces: PROVINCES.filter((p) => prov.has(p) && provinces.includes(p)).length ? PROVINCES.filter((p) => prov.has(p)) : [...prov], payments, deliveryHours: hours, prices: prices.slice(0, 6), reputation, model }
}

/** Crea o actualiza las fichas con lo detectado. Respeta los campos corregidos a mano. */
export async function autoFillCompetitors(all: C[], known: Competitor[], opts: { ignored?: string[]; provinces: readonly Province[]; onStep?: (s: string, frac?: number) => void }) {
  const cands = await findCandidates(all, { ignored: opts.ignored, known, onStep: opts.onStep })
  const next = pruneNonBusiness(known), created: string[] = [], updated: string[] = []
  // la propuesta redactada por la IA solo para los 3 más mencionados (cada consulta a la IA tarda segundos)
  const top = new Set([...cands].sort((a, b) => (b.comments.length + b.official.length) - (a.comments.length + a.official.length)).slice(0, 3).map((c) => c.name))
  for (const [ci, c] of cands.entries()) {
    opts.onStep?.(`Rellenando la ficha de ${c.name}…`, 0.6 + (0.4 * ci) / Math.max(1, cands.length))
    const known0 = next.find((f) => keyOf(f.name) === keyOf(c.name))
    const p = await profileOf(c, opts.provinces, top.has(c.name) && !known0?.model)
    const ck = keyOf(c.name), aliases = [...c.aliases].filter((a) => keyOf(a) !== ck)
    const i = next.findIndex((f) => [f.name, ...f.aliases].some((n) => keyOf(n) === ck || [...c.aliases].some((a) => keyOf(a) === keyOf(n))))
    const mentions = c.comments.length + c.official.length
    if (i < 0) {
      next.push(newCompetitor(c.name, { aliases, ...p, source: 'detectado', detectedAt: Date.now(), lastSeen: Date.now(), mentions, page: c.viaPost }))
      created.push(c.name)
      continue
    }
    const f = next[i], man = new Set(f.manual || [])
    const merged: Competitor = {
      ...f,
      aliases: man.has('aliases') ? f.aliases : [...new Set([...f.aliases, ...aliases])].filter((a) => keyOf(a) !== keyOf(f.name)),
      provinces: man.has('provinces') ? f.provinces : PROVINCES.filter((x) => f.provinces.includes(x) || p.provinces.includes(x)),
      payments: man.has('payments') ? f.payments : [...new Set([...f.payments, ...p.payments])],
      deliveryHours: man.has('deliveryHours') || !p.deliveryHours ? f.deliveryHours : p.deliveryHours,
      prices: man.has('prices') ? f.prices : [...f.prices, ...p.prices.filter((x) => !f.prices.some((y) => Math.abs(y.price - x.price) < 0.01))].slice(-8),
      reputation: man.has('reputation') || !p.reputation ? f.reputation : p.reputation,
      model: man.has('model') || !p.model ? f.model : p.model,
      combos: man.has('combos') ? f.combos : [...(f.combos || []), ...p.combos.filter((x) => !(f.combos || []).some((y) => y.name === x.name && y.price === x.price))].slice(0, 30),
      lastSeen: Date.now(), mentions: (f.mentions || 0) + mentions, page: f.page || c.viaPost,
    }
    next[i] = merged
    updated.push(f.name)
  }
  return { competitors: next, created, updated }
}
