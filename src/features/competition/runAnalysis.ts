/**
 * Actualización de un análisis de competencia: la lanza el usuario («Actualizar») o el programador automático según
 * la periodicidad del análisis (semanal, cada 2 semanas o mensual). El usuario solo tiene que abrir el informe.
 */
import { useEffect } from 'react'
import { alertBox, toast } from '@/components/ui'
import { useExtension } from '@/features/extension/bridge'
import { useTR } from '@/features/comments/tracking'
import { buildCompetitionModel, headlineOf, tracksInRange, type CompModel } from './analyze'
import { runResearch } from './components'
import { analysisName, EVERY_TXT, loadCompHistory, nextRunAt, saveCompReport, setComp, setRun, useCompetition, useCompHistory, useCompRun, type Analysis } from './store'

const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const setStep = (v: string | null, p?: number) => setRun((st) => ({ step: v, pct: v == null ? 0 : p == null ? st.pct : Math.max(st.pct, Math.min(99, Math.round(p))) }))

/** Actualiza un análisis. Con `auto` (lanzada por el programador) avisa al terminar; con `bg`, empieza en segundo plano. */
export async function updateAnalysis(a: Analysis, opts: { auto?: boolean; bg?: boolean } = {}) {
  if (useCompRun.getState().step) { if (!opts.auto) toast('Ya se está actualizando un análisis'); return false }
  const { competitors, brand, ignored, webSearch } = useCompetition.getState()
  const withWeb = webSearch && !!useExtension.getState().publisher
  setRun({ active: a.id, bg: !!opts.bg, done: null, web: withWeb })
  setStep(opts.auto ? 'Actualización automática: preparando…' : 'Preparando…', 0)
  try {
    // búsqueda en Internet (Google, anuncios, Telegram) con las provincias del análisis
    let bp = brand, cs = competitors
    let webInfo: CompModel['webInfo']
    if (withWeb) {
      try {
        const r = await runResearch((x, p) => setStep(x || 'Buscando en Internet…', p == null ? undefined : p * 0.4), { maxAgeMs: 12 * 3600_000, provinces: a.provinces })
        bp = r.brandProfile; cs = r.competitors
        if (!r.reused) webInfo = { found: r.found, refreshed: r.refreshed, blocked: r.blocked, error: r.error }
        if (r.error && !opts.auto) toast(`Búsqueda en Internet: ${r.error} Se usan las fichas guardadas.`)
      } catch (e) { if (!opts.auto) toast(`No se pudo buscar en Internet: ${(e as Error).message}. Se usan las fichas guardadas.`) }
    }
    // comentarios desde el inicio del análisis hasta hoy, de los seguimientos con actividad en ese periodo
    const lo = a.since, hi = ymd(Date.now())
    const tids = tracksInRange(lo, hi).map((t) => t.id)
    const m = await buildCompetitionModel({ from: lo, to: hi, provinces: a.provinces, tids, competitors: cs, brandProfile: bp, ignored, webInfo, onStep: (x, p) => setStep(x || 'Terminando…', p == null ? undefined : withWeb ? 40 + p * 0.6 : p), onCompetitors: (list) => setComp({ competitors: list }) })
    await saveCompReport({ id: 'r' + Date.now().toString(36), analysisId: a.id, createdAt: Date.now(), from: lo, to: hi, provinces: a.provinces, brand: m.brand, author: m.author, headline: headlineOf(m), model: m })
    setRun({ done: { id: a.id, at: Date.now(), model: m } })
    const fc = m.fichas?.created.length || 0
    toast(`${opts.auto ? 'Actualización automática: análisis' : 'Análisis'} «${analysisName(a.provinces)}» actualizado${fc ? ` · la IA creó ${fc} ficha${fc === 1 ? '' : 's'} de competidor${fc === 1 ? '' : 'es'}` : ''}`, 'radar',
      opts.auto ? { label: 'Ver informe', onClick: () => { setRun({ model: m, done: null, tab: 'new' }); location.hash = '#/competencia' } } : undefined)
    return true
  } catch (e) { toast('No se pudo actualizar el análisis: ' + (e as Error).message); return false }
  finally { setStep(null); setRun({ active: null }) }
}

/** Análisis a los que les toca actualizarse (el que más tiempo lleva esperando, primero). */
export function dueAnalyses(now = Date.now()) {
  const { analyses } = useCompetition.getState(), list = useCompHistory.getState().list
  return analyses.map((a) => ({ a, at: nextRunAt(a, list) })).filter((x) => x.at <= now).sort((x, y) => x.at - y.at).map((x) => x.a)
}

/** Análisis que el usuario dejó «para más tarde» en esta sesión: no se vuelve a preguntar hasta esa hora. */
const SNOOZE = new Map<string, number>()
const SNOOZE_MS = 3 * 3600_000
let asking = false

/**
 * Programador: mientras la app está abierta, comprueba cada pocos minutos si a algún análisis le toca actualizarse.
 * Antes de empezar avisa al usuario; la actualización comienza solo si la acepta (de una en una, sin interrumpir otra
 * actualización ni una búsqueda en curso). Si la deja para más tarde, se vuelve a preguntar pasadas unas horas.
 */
export function useAnalysisScheduler() {
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!alive) return
      if (!useCompHistory.getState().loaded) await loadCompHistory()
      if (!useTR.getState().loaded) return
      const run = useCompRun.getState()
      if (run.step || run.research || asking) return
      const now = Date.now()
      const due = dueAnalyses(now).find((a) => (SNOOZE.get(a.id) ?? 0) <= now)
      if (!due) return
      asking = true
      try {
        const ok = await alertBox('radar', 'Actualización automática del análisis',
          `Le toca actualizarse al análisis de la competencia «${analysisName(due.provinces)}» (${EVERY_TXT[due.every ?? '2weeks'].toLowerCase()}).\n\nBusca información nueva de los competidores y analiza los comentarios desde el inicio del análisis; puede tardar unos minutos y la app se puede seguir usando mientras tanto.`,
          { ok: 'Aceptar', cancel: 'Más tarde' })
        if (!alive) return
        if (!ok) { SNOOZE.set(due.id, Date.now() + SNOOZE_MS); toast('Actualización pospuesta: se volverá a proponer en unas horas. También puedes actualizarlo desde Competencia.', 'schedule'); return }
        const r = useCompRun.getState()
        if (r.step || r.research) { toast('Hay otra actualización en curso; el análisis se actualizará cuando termine.'); return }
        await updateAnalysis(due, { auto: true })
      } finally { asking = false }
    }
    const first = setTimeout(tick, 20_000)          // tras abrir la app, cuando ya cargó todo
    const every = setInterval(tick, 5 * 60_000)     // y cada 5 minutos
    return () => { alive = false; clearTimeout(first); clearInterval(every) }
  }, [])
}
