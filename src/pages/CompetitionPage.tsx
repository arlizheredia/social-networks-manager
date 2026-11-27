import { useEffect, useState } from 'react'
import { Banner, Button, Card, CardHead, Icon, IconButton, Input, PageHead, Switch, Tabs, confirmBox, toast } from '@/components/ui'
import { usePrefs } from '@/features/comments/prefs'
import { countTxt, useTR } from '@/features/comments/tracking'
import { useAI } from '@/features/ai/engine'
import { NeedsAI } from '@/features/ai/AIDialog'
import { buildCompetitionModel, headlineOf, tracksInRange, type CompModel } from '@/features/competition/analyze'
import { compHtml, compTitle, consolidatedHtml } from '@/features/competition/html'
import { CompDashboard } from '@/features/competition/Dashboard'
import { analysisName, createAnalysis, deleteAnalysis, loadCompHistory, provKey, runsOf, saveCompReport, setComp, setRun, useCompHistory, useCompRun, useCompetition, type Analysis } from '@/features/competition/store'
import { PROVINCES, type Province } from '@/features/competition/data'
import { collapseRows } from '@/lib/motion'
import { pruneNonBusiness } from '@/features/competition/discover'
import { CompReportView, CompetitorsTab, ProvincePicker, compFileName, runResearch, stamp } from '@/features/competition/components'
import { useExtension } from '@/features/extension/bridge'

const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const fmtDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 3600 ? `hace ${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : s < 2 * 86400 ? 'ayer' : `hace ${Math.round(s / 86400)} días` }

/**
 * Análisis de la competencia: uno por conjunto de provincias. Se crea una vez y se actualiza cuando se quiera; cada
 * actualización recoge la información nueva (comentarios, fichas, Internet) y queda como un informe del análisis.
 */
function Analyses({ brand }: { brand: string }) {
  const analyses = useCompetition((s) => s.analyses)
  const comps = useCompetition((s) => s.competitors)
  const ignored = useCompetition((s) => s.ignored)
  const brandProfile = useCompetition((s) => s.brand)
  const webSearch = useCompetition((s) => s.webSearch)
  const hist = useCompHistory()
  useEffect(() => { if (!useCompHistory.getState().loaded) loadCompHistory() }, [])
  const aiReady = useAI((s) => s.installed)
  const ext = useExtension((s) => s.publisher)
  useTR((s) => s.tracks.length)
  // el estado vive fuera del componente: cambiar de pestaña o de sección no lo pierde
  const run0 = useCompRun()
  const step = run0.step, pct = run0.pct
  const setStep = (v: string | null, p?: number) => setRun((st) => ({ step: v, pct: v == null ? 0 : p == null ? st.pct : Math.max(st.pct, Math.min(99, Math.round(p))) }))
  const [view, setView] = useState<{ html: string; title: string; file: string; model?: CompModel } | null>(null)
  const model = run0.model as CompModel | null
  // nuevo análisis
  const [creating, setCreating] = useState(!analyses.length)
  const [provs, setProvs] = useState<Province[]>([...PROVINCES])
  const [since, setSince] = useState(ymd(Date.now() - 29 * 864e5))
  const dup = analyses.find((a) => a.id === provKey(provs))

  const run = async (a: Analysis) => {
    if (useCompRun.getState().step) { toast('Ya se está actualizando un análisis'); return }
    setRun({ active: a.id, bg: false, done: null })
    setStep('Preparando…', 0)
    const withWeb = webSearch && !!ext
    setRun({ web: withWeb })
    try {
      // búsqueda en Internet (Google): ficha de la marca y competidores nuevos
      let bp = brandProfile, cs = comps
      let webInfo: CompModel['webInfo']
      if (withWeb) {
        try {
          const r = await runResearch((x, p) => setStep(x || 'Buscando en Internet…', p == null ? undefined : p * 0.4), { maxAgeMs: 12 * 3600_000 })
          bp = r.brandProfile; cs = r.competitors
          if (!r.reused) webInfo = { found: r.found, refreshed: r.refreshed, blocked: r.blocked, error: r.error }
          if (r.error) toast(`Búsqueda en Internet: ${r.error} Se usan las fichas guardadas.`)
        } catch (e) { toast(`No se pudo buscar en Internet: ${(e as Error).message}. Se usan las fichas guardadas.`) }
      }
      // comentarios desde el inicio del análisis hasta hoy, de los seguimientos con actividad en ese periodo
      const lo = a.since, hi = ymd(Date.now())
      const tids = tracksInRange(lo, hi).map((t) => t.id)
      const m = await buildCompetitionModel({ from: lo, to: hi, provinces: a.provinces, tids, competitors: cs, brandProfile: bp, ignored, webInfo, onStep: (x, p) => setStep(x || 'Terminando…', p == null ? undefined : withWeb ? 40 + p * 0.6 : p), onCompetitors: (list) => setComp({ competitors: list }) })
      await saveCompReport({ id: 'r' + Date.now().toString(36), analysisId: a.id, createdAt: Date.now(), from: lo, to: hi, provinces: a.provinces, brand: m.brand, author: m.author, headline: headlineOf(m), model: m })
      setRun({ done: { id: a.id, at: Date.now(), model: m } })
      const fc = m.fichas?.created.length || 0
      toast(`Análisis «${analysisName(a.provinces)}» actualizado${fc ? ` · la IA creó ${fc} ficha${fc === 1 ? '' : 's'} de competidor${fc === 1 ? '' : 'es'}` : ''}`, 'radar')
    } catch (e) { toast('No se pudo actualizar el análisis: ' + (e as Error).message) }
    finally { setStep(null); setRun({ active: null }) }
  }
  const create = () => {
    if (!provs.length) { toast('Elige al menos una provincia'); return }
    const { analysis, existed } = createAnalysis(provs, since)
    if (existed) { toast('Ya existe un análisis con esas provincias: se actualiza ese'); }
    setCreating(false)
    run(analysis)
  }
  const openLatest = (a: Analysis) => {
    const r = runsOf(hist.list, a)[0]
    if (!r) return
    const m = r.model as CompModel
    setView({ html: compHtml(m), title: compTitle(m), file: compFileName(m.brand, m.generatedAt || r.createdAt), model: m })
  }
  const openEvolution = (a: Analysis) => {
    const rs = runsOf(hist.list, a)
    const b = (rs[0]?.model as CompModel | undefined)?.brand || brand
    setView({ html: consolidatedHtml(rs), title: `Evolución de la competencia - ${analysisName(a.provinces)} - ${b}`, file: `Evolución de la competencia - ${analysisName(a.provinces)} - ${b}-${stamp(Date.now())}` })
  }

  if (model) return <CompReportView html={compHtml(model)} title={compTitle(model)} file={compFileName(model.brand, model.generatedAt)} dashboard={<CompDashboard m={model} />} back={{ label: 'Volver a los análisis', onClick: () => setRun({ model: null }) }} />
  if (view) return <CompReportView {...view} dashboard={view.model ? <CompDashboard m={view.model} /> : undefined} back={{ label: 'Volver a los análisis', onClick: () => setView(null) }} />
  return (
    <div className="space-y-4">
      {!aiReady && <NeedsAI what="Buscar por significado en los comentarios y redactar el resumen" />}
      <Card>
        <CardHead title="Análisis de la competencia" sub={<>Uno por conjunto de provincias. Actualízalo cuando quieras: cada actualización recoge la información nueva y queda en su informe (con su evolución). Marca base: <b className="font-medium text-text">{brand}</b></>}
          actions={!creating && <Button size="sm" variant="tonal" icon="add" onClick={() => setCreating(true)}>Nuevo análisis</Button>} />
        {analyses.length ? (
          <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2">
            {analyses.map((a) => {
              const rs = runsOf(hist.list, a), last = rs[0], isRun = run0.active === a.id && !!step
              return (
                <div key={a.id} data-row-id={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name={isRun ? 'progress_activity' : 'radar'} className={isRun ? 'animate-spin' : ''} /></span>
                  <div className="min-w-48 flex-1">
                    <div className="font-medium">{analysisName(a.provinces)}</div>
                    <div className="text-xs text-text-2">Comentarios desde el {fmtDay(a.since)} · {last ? `actualizado ${ago(last.createdAt)} · ${countTxt(rs.length, 'actualización', 'actualizaciones')}` : 'sin actualizar todavía'}</div>
                    {last?.headline && <div className="mt-0.5 line-clamp-2 text-sm text-text-2">{last.headline}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" icon={isRun ? 'open_in_full' : 'refresh'} disabled={(!!step && !isRun) || !!run0.research} onClick={() => (isRun ? setRun({ bg: false }) : run(a))} title={isRun ? 'Mostrar la ventana de la actualización' : undefined}>{isRun ? `Actualizando ${pct} %` : 'Actualizar'}</Button>
                    {last && <Button size="sm" variant="tonal" icon="description" onClick={() => openLatest(a)}>Ver informe</Button>}
                    {rs.length > 1 && <Button size="sm" variant="text" icon="timeline" onClick={() => openEvolution(a)}>Evolución</Button>}
                    <IconButton size="sm" icon="delete" label="Eliminar el análisis y sus informes" disabled={isRun} onClick={async () => { if (await confirmBox(`¿Eliminar el análisis «${analysisName(a.provinces)}»?`, `Se borrarán sus ${countTxt(rs.length, 'informe', 'informes')}. Las fichas de la competencia se conservan.`, 'Eliminar', true)) { await collapseRows([a.id]); await deleteAnalysis(a); toast('Análisis eliminado') } }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : !creating && <p className="text-text-2">Aún no hay análisis. Crea el primero con las provincias que te interesan.</p>}
      </Card>
      {creating && (
        <Card>
          <CardHead title="Nuevo análisis" sub="Elige las provincias. No puede haber dos análisis con las mismas provincias: si ya existe, se actualiza ese." actions={analyses.length ? <Button size="sm" variant="text" onClick={() => setCreating(false)}>Cancelar</Button> : undefined} />
          <div className="mb-3"><ProvincePicker value={provs} onChange={setProvs} /></div>
          <label className="mb-3 block text-xs text-text-2">Comentarios desde<Input type="date" className="!h-10 max-w-48" max={ymd(Date.now())} value={since} onChange={(e) => setSince(e.target.value)} /></label>
          {dup ? (
            <Banner tone="warn" icon="block" action={<Button size="sm" icon="refresh" disabled={!!step} onClick={() => { setCreating(false); run(dup) }}>Actualizarlo</Button>}>
              <b>Ya existe un análisis de {analysisName(dup.provinces)}.</b> No se puede crear otro con las mismas provincias; actualízalo para recoger la información nueva.
            </Banner>
          ) : <Button icon="radar" disabled={!provs.length || !!step || !!run0.research} onClick={create}>Crear y ejecutar el análisis</Button>}
        </Card>
      )}
      <Card>
        <CardHead title="Opciones de las actualizaciones" />
        <Switch label="Buscar en Internet (Google)" sub={ext ? `La extensión busca en Google a ${brand} y a la competencia de cada provincia, lee los sitios encontrados y la IA completa las fichas. Los competidores nuevos quedan por confirmar.` : 'Necesita la extensión de Chrome (Ajustes › Extensión).'} checked={webSearch && !!ext} onChange={(v) => setComp({ webSearch: v })} />
        <p className="mt-2 text-xs text-text-2">Además, la IA busca a la competencia en los comentarios de tus seguimientos desde el inicio de cada análisis ({comps.length ? countTxt(comps.length, 'competidor detectado', 'competidores detectados') : 'aún sin competidores detectados'}). Si Google pide una verificación, la pestaña se abrirá al frente: resuélvela y la búsqueda seguirá sola.</p>
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
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'new', label: running ? `Análisis · ${runPct} %` : 'Análisis', icon: running ? 'progress_activity' : 'radar' }, { id: 'comps', label: researching ? 'Competidores · buscando…' : 'Competidores', icon: researching ? 'progress_activity' : 'storefront', badge: nComps || undefined }]} />
      <div key={tab} className="anim-page">{tab === 'new' ? <Analyses brand={brand} /> : <CompetitorsTab brand={brand} />}</div>
      <p className="mt-4 flex items-center gap-1 text-xs text-text-2"><Icon name="history" className="!text-[16px]" />Cada actualización queda también en Historial › Competencia.</p>
    </div>
  )
}
