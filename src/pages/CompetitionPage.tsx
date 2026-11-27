import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Button, Card, CardHead, Icon, Input, PageHead, Switch, Tabs, toast } from '@/components/ui'
import { usePrefs } from '@/features/comments/prefs'
import { countTxt, useTR, trackTs } from '@/features/comments/tracking'
import { useAI } from '@/features/ai/engine'
import { NeedsAI } from '@/features/ai/AIDialog'
import { buildCompetitionModel, headlineOf, tracksInRange, type CompModel } from '@/features/competition/analyze'
import { compHtml, compTitle } from '@/features/competition/html'
import { CompDashboard } from '@/features/competition/Dashboard'
import { saveCompReport, setComp, setRun, useCompRun, useCompetition } from '@/features/competition/store'
import { pruneNonBusiness } from '@/features/competition/discover'
import { CompReportView, CompetitorsTab, ProvincePicker, compFileName, runResearch } from '@/features/competition/components'
import { useExtension } from '@/features/extension/bridge'

const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Pasos de la generación con su tramo de porcentaje (con búsqueda en Internet; sin ella, solo el análisis en 0–100 %). */
const WEB_STEPS = [
  { label: 'Buscar en Google', icon: 'travel_explore', to: 21 },
  { label: 'Leer los sitios encontrados', icon: 'language', to: 31 },
  { label: 'Revisar los competidores y la ficha de tu marca', icon: 'storefront', to: 40 },
]
const ANALYSIS_STEPS = [
  { label: 'Reunir los comentarios de los seguimientos', icon: 'forum', to: 5 },
  { label: 'Detectar a la competencia en los comentarios', icon: 'person_search', to: 35 },
  { label: 'Analizar pagos, cobertura y precios', icon: 'payments', to: 60 },
  { label: 'Comparativa, combos y nivel de amenaza', icon: 'compare_arrows', to: 65 },
  { label: 'Redactar el resumen', icon: 'edit_note', to: 100 },
]
/** Progreso al estilo de la publicación en grupos: a la izquierda el anillo con el porcentaje; a su lado, el estado y su descripción. */
export function RunProgress({ step, pct, web }: { step: string; pct: number; web: boolean }) {
  const steps = web ? [...WEB_STEPS, ...ANALYSIS_STEPS.map((s) => ({ ...s, to: 40 + s.to * 0.6 }))] : ANALYSIS_STEPS
  const cur = Math.max(0, steps.findIndex((s) => pct < s.to)), now = steps[cur]
  const C = 2 * Math.PI * 34
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-surface-2 p-5 sm:flex-row sm:gap-8 sm:p-6" role="status" aria-live="polite">
      <div className="relative size-28 shrink-0" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del informe">
        <svg viewBox="0 0 80 80" className="size-28 -rotate-90"><circle cx="40" cy="40" r="34" className="fill-none stroke-primary-container" strokeWidth="7" /><circle cx="40" cy="40" r="34" className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg>
        <b className="absolute inset-0 grid place-items-center font-display text-xl tabular-nums">{pct} %</b>
      </div>
      {/* el anillo y el texto, centrados como un bloque en el área */}
      <div className="min-w-0 sm:max-w-xl">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary"><Icon name={now.icon} className="!text-[18px]" />Paso {cur + 1} de {steps.length}</div>
        <h4 className="mb-1 text-base">{now.label}</h4>
        <p className="text-sm text-text-2">{step}</p>
        {cur > 0 && (
          <ol className="mt-3 space-y-0.5 text-xs text-text-2">
            {steps.slice(Math.max(0, cur - 3), cur).map((s) => <li key={s.label} className="flex items-center gap-1.5"><Icon name="check_circle" className="!text-[16px] text-success" />{s.label}</li>)}
          </ol>
        )}
        <p className="mt-3 text-xs text-text-2">Puedes cambiar de pestaña o de sección: el informe se sigue generando.</p>
      </div>
    </div>
  )
}

function NewReport({ brand }: { brand: string }) {
  const nav = useNavigate()
  const provinces = useCompetition((s) => s.provinces)
  const comps = useCompetition((s) => s.competitors)
  const ignored = useCompetition((s) => s.ignored)
  const brandProfile = useCompetition((s) => s.brand)
  const aiReady = useAI((s) => s.installed)
  const ext = useExtension((s) => s.publisher)
  const webSearch = useCompetition((s) => s.webSearch)
  useTR((s) => s.tracks.length)
  // el estado vive fuera del componente: cambiar de pestaña o de sección no lo pierde
  const run0 = useCompRun()
  const from = run0.from || ymd(Date.now() - 6 * 864e5), to = run0.to || ymd(Date.now())
  const setFrom = (v: string) => setRun({ from: v }), setTo = (v: string) => setRun({ to: v })
  const tracks = tracksInRange(from <= to ? from : to, from <= to ? to : from)
  const skip = new Set(run0.skip), setSkip = (v: Set<string>) => setRun({ skip: [...v] })
  // paso y porcentaje global: la búsqueda en Internet ocupa 0–40 % y el análisis 40–100 % (sin búsqueda, 0–100 %)
  const step = run0.step, pct = run0.pct
  const setStep = (v: string | null, p?: number) => setRun((st) => ({ step: v, pct: v == null ? 0 : p == null ? st.pct : Math.max(st.pct, Math.min(99, Math.round(p))) }))
  const model = run0.model as CompModel | null, setModel = (m: CompModel | null) => setRun({ model: m })
  const html = useMemo(() => (model ? compHtml(model) : ''), [model])

  const run = async () => {
    if (!provinces.length) { toast('Elige al menos una provincia'); return }
    if (useCompRun.getState().step) return
    setStep('Preparando…', 0)
    const withWeb = webSearch && !!ext
    setRun({ web: withWeb })
    try {
      // búsqueda en Internet (Google): ficha de la marca y competidores nuevos
      let bp = brandProfile, cs = comps
      let webInfo: CompModel['webInfo']
      if (webSearch && ext) {
        try {
          const r = await runResearch((x, p) => setStep(x || 'Buscando en Internet…', p == null ? undefined : p * 0.4), { maxAgeMs: 12 * 3600_000 })
          bp = r.brandProfile; cs = r.competitors
          if (!r.reused) webInfo = { found: r.found, refreshed: r.refreshed, blocked: r.blocked, error: r.error }
          if (r.error) toast(`Búsqueda en Internet: ${r.error} Se usan las fichas guardadas.`)
        } catch (e) { toast(`No se pudo buscar en Internet: ${(e as Error).message}. Se usan las fichas guardadas.`) }
      }
      const lo = from <= to ? from : to, hi = from <= to ? to : from
      const m = await buildCompetitionModel({ from: lo, to: hi, provinces, tids: tracks.filter((t) => !skip.has(t.id)).map((t) => t.id), competitors: cs, brandProfile: bp, ignored, webInfo, onStep: (x, p) => setStep(x || 'Terminando…', p == null ? undefined : withWeb ? 40 + p * 0.6 : p), onCompetitors: (list) => setComp({ competitors: list }) })
      await saveCompReport({ id: 'r' + Date.now().toString(36), createdAt: Date.now(), from: lo, to: hi, provinces, brand: m.brand, author: m.author, headline: headlineOf(m), model: m })
      setModel(m)
      const fc = m.fichas?.created.length || 0
      toast(`Informe creado y guardado en el historial${fc ? ` · la IA creó ${fc} ficha${fc === 1 ? '' : 's'} de competidor${fc === 1 ? '' : 'es'}` : ''}`, 'radar', { label: 'Ver historial', onClick: () => nav('/historial?tab=comp') })
    } catch (e) { toast('No se pudo crear el informe: ' + (e as Error).message) }
    finally { setStep(null) }
  }

  if (model) return <CompReportView html={html} title={compTitle(model)} file={compFileName(model.brand, model.generatedAt)} dashboard={<CompDashboard m={model} />} back={{ label: 'Nuevo informe', onClick: () => setModel(null) }} />
  return (
    <div className="space-y-4">
      <Card>
        <CardHead step={1} title="Provincias" sub="Elige las provincias del oriente que quieres analizar." />
        <ProvincePicker value={provinces} onChange={(v) => setComp({ provinces: v })} />
      </Card>
      <Card>
        <CardHead step={2} title="Periodo y comentarios" sub="El análisis de redes usa los seguimientos de comentarios completados en el periodo." />
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-2">Desde<Input type="date" className="!h-10" max={ymd(Date.now())} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></label>
          <label className="text-xs text-text-2">Hasta<Input type="date" className="!h-10" max={ymd(Date.now())} value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value) }} /></label>
        </div>
        {tracks.length ? (
          <div className="space-y-1">{tracks.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!skip.has(t.id)} onChange={(e) => { const s = new Set(skip); e.target.checked ? s.delete(t.id) : s.add(t.id); setSkip(s) }} /><span className="truncate">{t.name}</span><span className="text-xs text-text-2">· actualizado {new Date(trackTs(t)).toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {countTxt(t.postIds.length, 'publicación', 'publicaciones')}</span></label>
          ))}</div>
        ) : <p className="text-text-2">No hay seguimientos completados en ese periodo: la IA no tendrá comentarios en los que buscar a la competencia y el informe usará solo las fichas que ya existen.</p>}
      </Card>
      <Card>
        <CardHead step={3} title="Generar" sub={<>Marca base: <b className="font-medium text-text">{brand}</b> (Ajustes › General › Informes) · {comps.length ? countTxt(comps.length, 'competidor detectado', 'competidores detectados') : 'la IA detectará a los competidores al generar'}</>} />
        {!aiReady && <div className="mb-3"><NeedsAI what="Buscar por significado en los comentarios y redactar el resumen" /></div>}
        <Switch label="Buscar en Internet (Google)" sub={ext ? `La extensión busca en Google a ${brand} y a la competencia de cada provincia, lee los sitios encontrados y la IA completa las fichas. Los competidores nuevos quedan por confirmar.` : 'Necesita la extensión de Chrome (Ajustes › Extensión).'} checked={webSearch && !!ext} onChange={(v) => setComp({ webSearch: v })} />
        <Banner tone="info" icon="info" className="my-3">Además, la IA busca a la competencia en los comentarios del periodo. Si Google pide una verificación, la pestaña se abrirá al frente: resuélvela y la búsqueda seguirá sola.</Banner>
        {step ? <RunProgress step={step} pct={pct} web={run0.web} />
          : <Button icon="radar" disabled={!!run0.research || !provinces.length} onClick={run}>{run0.research ? 'Esperando la búsqueda en Internet…' : 'Generar informe de competencia'}</Button>}
      </Card>
    </div>
  )
}

export default function CompetitionPage() {
  const brand = usePrefs((p) => p.report.client || p.report.terms.split(',')[0] || 'tu marca')
  const tab = useCompRun((s) => s.tab), setTab = (t: 'new' | 'comps') => setRun({ tab: t })
  const nComps = useCompetition((s) => s.competitors.length)
  const running = useCompRun((s) => !!s.step), researching = useCompRun((s) => !!s.research), runPct = useCompRun((s) => s.pct)
  // fichas creadas antes de filtrar personas: se quitan las que no son negocios
  useEffect(() => { const cs = useCompetition.getState().competitors, ok = pruneNonBusiness(cs); if (ok.length !== cs.length) setComp({ competitors: ok }) }, [])
  return (
    <div>
      <PageHead title="Competencia" sub={<>Informes de la competencia de <b className="font-medium">{brand}</b> en las provincias del oriente, con lo que dicen tus seguimientos de comentarios.</>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'new', label: running ? `Nuevo informe · ${runPct} %` : 'Nuevo informe', icon: running ? 'progress_activity' : 'radar' }, { id: 'comps', label: researching ? 'Competidores · buscando…' : 'Competidores', icon: researching ? 'progress_activity' : 'storefront', badge: nComps || undefined }]} />
      <div key={tab} className="anim-page">{tab === 'new' ? <NewReport brand={brand} /> : <CompetitorsTab brand={brand} />}</div>
      <p className="mt-4 flex items-center gap-1 text-xs text-text-2"><Icon name="history" className="!text-[16px]" />Los informes quedan en Historial › Competencia, donde puedes crear consolidados.</p>
    </div>
  )
}
