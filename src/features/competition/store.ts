/** Fichas de competidores, perfil de la marca e historial de informes de competencia. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createStore, del, get, keys, set } from 'idb-keyval'
import { PROVINCES, type Province } from './data'
import type { Combo } from './combos'

export interface PriceRef { product: string; price: number; currency: string; note: string }
export interface Competitor {
  id: string
  name: string
  /** Otros nombres con que lo mencionan (p. ej. «Fagales», «Fagales Market»). */
  aliases: string[]
  provinces: Province[]
  payments: string[]
  /** Plazo de entrega habitual, en horas (0 = sin dato). */
  deliveryHours: number
  coverage: string
  prices: PriceRef[]
  /** Reputación: calificación (p. ej. 4.3) y comentario. */
  rating: number | null
  reputation: string
  /** Propuesta de valor y notas («primero se entrega, luego se paga», factura, evidencia fotográfica…). */
  model: string
  url: string
  /** Direcciones de referencia que indica el usuario (sitio, página de Facebook, catálogo, reseñas). */
  refUrls?: string[]
  verifiedAt: number | null
  source: 'manual' | 'detectado' | 'web'
  /** Encontrados en Internet: quedan por confirmar hasta que el usuario los acepta. */
  status?: 'pendiente' | 'confirmado'
  /** De qué búsqueda salió y qué se leyó en su sitio. */
  web?: { query: string; snippet: string; evidence?: Record<string, string> }
  /** Campos corregidos por el usuario: la detección automática ya no los cambia. */
  manual?: string[]
  detectedAt?: number | null
  lastSeen?: number | null
  /** Comentarios en que aparece (acumulado de los informes). */
  mentions?: number
  /** Se detectó como autor de una publicación seguida (página de la competencia). */
  page?: boolean
  /** Combos de comida que publica (nombre, precio, peso, contenido, marcas). */
  combos?: Combo[]
}
export interface BrandProfile {
  /** Cobertura por provincia («8 municipios», «cabecera provincial»…); vacío = sin presencia. */
  coverage: Partial<Record<Province, string>>
  payments: string[]
  deliveryHours: number
  publicPrices: boolean
  reviews: string
  /** Sitio online de la marca (configuración inicial): de aquí se detecta la ficha. */
  urls?: string[]
  /** Resumen de la propuesta de la marca (IA, a partir del sitio). */
  summary?: string
  analyzedAt?: number | null
  pages?: { url: string; title: string; chars?: number }[]
  /** Frase del sitio de la que salió cada dato detectado. */
  evidence?: Record<string, string>
  /** Campos corregidos a mano: la detección no los cambia. */
  manual?: string[]
  /** Huella de lo leído (para no rehacer el resumen de la IA si no cambió). */
  sig?: string
  /** Precios de combos publicados en su sitio. */
  prices?: PriceRef[]
  /** Combos de comida de su sitio. */
  combos?: Combo[]
}

interface CompState { competitors: Competitor[]; brand: BrandProfile; provinces: Province[]; /** Buscar competidores nuevos en Internet al generar. */ webSearch: boolean; /** Última búsqueda en Internet completa (para no repetirla en el mismo día). */ lastWeb?: { at: number; key: string } | null; /** Detectados que el usuario descartó (no se vuelven a crear). */ ignored: string[] }
export const useCompetition = create<CompState>()(persist(() => ({
  competitors: [] as Competitor[],
  brand: { coverage: {}, payments: [], deliveryHours: 0, publicPrices: false, reviews: '' } as BrandProfile,
  // por defecto, todo el oriente
  provinces: [...PROVINCES] as Province[],
  ignored: [] as string[],
  webSearch: true as boolean,
}), {
  name: 'snm.competition', version: 4,
  migrate: (p0, v) => {
    const p = { ignored: [], webSearch: true, ...(p0 as object) } as unknown as CompState
    // antes el valor inicial era solo Santiago y Guantánamo: pasa a todo el oriente
    if (v < 3 && p.provinces?.length === 2 && p.provinces.includes('Santiago de Cuba') && p.provinces.includes('Guantánamo')) p.provinces = [...PROVINCES]
    return p
  },
}))
export const setComp = useCompetition.setState

export const newCompetitor = (name: string, extra: Partial<Competitor> = {}): Competitor => ({
  id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim(), aliases: [], provinces: [], payments: [], deliveryHours: 0,
  coverage: '', prices: [], rating: null, reputation: '', model: '', url: '', verifiedAt: null, source: 'manual', ...extra,
})
export function upsertCompetitor(c: Competitor) {
  setComp((s) => ({ competitors: s.competitors.some((x) => x.id === c.id) ? s.competitors.map((x) => (x.id === c.id ? c : x)) : [...s.competitors, c] }))
}
/** Elimina una ficha (si se vuelve a encontrar en una búsqueda, se crea de nuevo). */
export const removeCompetitor = (id: string) => setComp((s) => ({ competitors: s.competitors.filter((x) => x.id !== id) }))
/** Descarta una ficha: no se vuelve a crear aunque se detecte otra vez. */
export const deleteCompetitor = (id: string) => setComp((s) => { const c = s.competitors.find((x) => x.id === id); return { competitors: s.competitors.filter((x) => x.id !== id), ignored: c ? [...new Set([...s.ignored, c.name, ...c.aliases])] : s.ignored } })

/** Borra todas las fichas de competidores y los descartados; la próxima búsqueda en Internet empieza de cero. */
export const clearCompetitors = () => setComp({ competitors: [], ignored: [], lastWeb: null })
export const confirmCompetitor = (id: string) => setComp((s) => ({ competitors: s.competitors.map((c) => (c.id === id ? { ...c, status: 'confirmado' as const } : c)) }))

/* ---------- Estado de los procesos en curso ----------
 * Fuera de los componentes: cambiar de pestaña o de sección no pierde el progreso ni el informe generado. */
export interface CompRun {
  from: string | null; to: string | null; skip: string[]
  /** Paso actual al generar el informe (null = parado). */
  step: string | null
  /** Porcentaje del informe (0–100). */
  pct: number
  /** La generación en curso incluye la búsqueda en Internet (para la lista de pasos). */
  web: boolean
  /** Último informe generado en esta sesión (se muestra hasta pulsar «Nuevo informe»). */
  model: unknown | null
  /** Paso actual de «Buscar en Internet ahora» (null = parado). */
  research: string | null
  researchPct: number
  tab: 'new' | 'comps'
}
export const useCompRun = create<CompRun>(() => ({ from: null, to: null, skip: [], step: null, pct: 0, web: false, model: null, research: null, researchPct: 0, tab: 'new' }))
export const setRun = useCompRun.setState

/* ---------- Historial de informes ---------- */
export interface SavedCompReport {
  id: string
  createdAt: number
  from: string
  to: string
  provinces: Province[]
  brand: string
  author: string
  /** Resumen para la lista del historial. */
  headline: string
  /** Modelo completo (datos planos) para volver a verlo y para los consolidados. */
  model: unknown
}
let store_: ReturnType<typeof createStore> | null = null
const st = () => (store_ ||= createStore('snm-comp', 'reports'))
export const useCompHistory = create<{ list: SavedCompReport[]; loaded: boolean }>(() => ({ list: [], loaded: false }))
export async function loadCompHistory() {
  try {
    const ks = await keys(st())
    const all = (await Promise.all(ks.map((k) => get<SavedCompReport>(k, st())))).filter(Boolean) as SavedCompReport[]
    useCompHistory.setState({ list: all.sort((a, b) => b.createdAt - a.createdAt), loaded: true })
  } catch { useCompHistory.setState({ loaded: true }) }
}
export async function saveCompReport(r: SavedCompReport) {
  await set(r.id, r, st())
  useCompHistory.setState((s) => ({ list: [r, ...s.list.filter((x) => x.id !== r.id)] }))
}
export async function deleteCompReports(ids: string[]) {
  await Promise.all(ids.map((id) => del(id, st())))
  useCompHistory.setState((s) => ({ list: s.list.filter((x) => !ids.includes(x.id)) }))
}
