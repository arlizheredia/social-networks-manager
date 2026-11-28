import { useEffect, useState } from 'react'
import { Banner, Button, Card, CardHead, Icon, IconButton, Input, PageHead, Select, Switch, Tabs, confirmBox, toast } from '@/components/ui'
import { usePrefs } from '@/features/comments/prefs'
import { countTxt, useTR } from '@/features/comments/tracking'
import { useAI } from '@/features/ai/engine'
import { NeedsAI } from '@/features/ai/AIDialog'
import { type CompModel } from '@/features/competition/analyze'
import { compHtml, compTitle, consolidatedHtml } from '@/features/competition/html'
import { CompDashboard } from '@/features/competition/Dashboard'
import { EVERY_TXT, analysisName, createAnalysis, deleteAnalysis, loadCompHistory, nextRunAt, provKey, runsOf, setAnalysisEvery, setComp, setRun, useCompHistory, useCompRun, useCompetition, type Analysis, type Every } from '@/features/competition/store'
import { updateAnalysis } from '@/features/competition/runAnalysis'
import { PROVINCES, type Province } from '@/features/competition/data'
import { collapseRows } from '@/lib/motion'
import { pruneNonBusiness } from '@/features/competition/discover'
import { CompReportView, CompetitorsTab, ProvincePicker, compFileName, stamp } from '@/features/competition/components'
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
  const webSearch = useCompetition((s) => s.webSearch)
  const adLibrary = useCompetition((s) => s.adLibrary)
  const telegram = useCompetition((s) => s.telegram)
  const hist = useCompHistory()
  useEffect(() => { if (!useCompHistory.getState().loaded) loadCompHistory() }, [])
  const aiReady = useAI((s) => s.installed)
  const ext = useExtension((s) => s.publisher)
  useTR((s) => s.tracks.length)
  // el estado vive fuera del componente: cambiar de pestaña o de sección no lo pierde
  const run0 = useCompRun()
  const step = run0.step, pct = run0.pct
  const [view, setView] = useState<{ html: string; title: string; file: string; model?: CompModel } | null>(null)
  const model = run0.model as CompModel | null
  // nuevo análisis
  const [creating, setCreating] = useState(!analyses.length)
  const [provs, setProvs] = useState<Province[]>([...PROVINCES])
  const [since, setSince] = useState(ymd(Date.now() - 29 * 864e5))
  const [every, setEvery] = useState<Every>('2weeks')
  const dup = analyses.find((a) => a.id === provKey(provs))

  const run = (a: Analysis) => updateAnalysis(a)
  const create = () => {
    if (!provs.length) { toast('Elige al menos una provincia'); return }
    const { analysis, existed } = createAnalysis(provs, since, every)
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
        <CardHead title="Análisis de la competencia" sub={<>Uno por conjunto de provincias. Se actualizan con la periodicidad elegida, avisándote antes de empezar (mientras la app esté abierta), y también cuando quieras; cada actualización queda en su informe, con su evolución. Marca base: <b className="font-medium text-text">{brand}</b></>}
          actions={!creating && <Button size="sm" variant="tonal" icon="add" onClick={() => setCreating(true)}>Nuevo análisis</Button>} />
        {analyses.length ? (
          <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2">
            {analyses.map((a) => {
              const rs = runsOf(hist.list, a), last = rs[0], isRun = run0.active === a.id && !!step
              return (
                <div key={a.id} data-row-id={a.id} className="flex items-start gap-3 px-3 py-3 min-[400px]:px-4">
                  <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container min-[360px]:grid"><Icon name={isRun ? 'progress_activity' : 'radar'} className={isRun ? 'animate-spin' : ''} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{analysisName(a.provinces)}</div>
                        <div className="text-xs text-text-2">Comentarios desde el {fmtDay(a.since)} · {last ? `actualizado ${ago(last.createdAt)} · ${countTxt(rs.length, 'actualización', 'actualizaciones')}` : 'sin actualizar todavía'}</div>
                      </div>
                      <IconButton size="sm" icon="delete" label="Eliminar el análisis y sus informes" disabled={isRun} onClick={async () => { if (await confirmBox(`¿Eliminar el análisis «${analysisName(a.provinces)}»?`, `Se borrarán sus ${countTxt(rs.length, 'informe', 'informes')}. Las fichas de la competencia se conservan.`, 'Eliminar', true)) { await collapseRows([a.id]); await deleteAnalysis(a); toast('Análisis eliminado') } }} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-2">
                      <Icon name="event_repeat" className="!text-[16px]" />
                      <select aria-label="Actualización automática" className="rounded-md border border-outline-2 bg-surface px-1.5 py-0.5 text-xs text-text" value={a.every || '2weeks'} onChange={(e) => setAnalysisEvery(a.id, e.target.value as Every)}>
                        {(Object.keys(EVERY_TXT) as Every[]).map((k) => <option key={k} value={k}>{EVERY_TXT[k]}</option>)}
                      </select>
                      <span>Próxima: {(() => { const t = nextRunAt(a, hist.list); return t <= Date.now() ? 'en cuanto sea posible' : new Date(t).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) })()}</span>
                    </div>
                    {last?.headline && <div className="mt-0.5 line-clamp-2 text-sm text-text-2">{last.headline}</div>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" className="grow sm:grow-0" icon={isRun ? 'open_in_full' : 'refresh'} disabled={(!!step && !isRun) || !!run0.research} onClick={() => (isRun ? setRun({ bg: false }) : run(a))} title={isRun ? 'Mostrar la ventana de la actualización' : undefined}>{isRun ? `Actualizando ${pct} %` : 'Actualizar'}</Button>
                      {last && <Button size="sm" className="grow sm:grow-0" variant="tonal" icon="description" onClick={() => openLatest(a)}>Ver informe</Button>}
                      {rs.length > 1 && <Button size="sm" className="grow sm:grow-0" variant="text" icon="timeline" onClick={() => openEvolution(a)}>Evolución</Button>}
                    </div>
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
          <div className="mb-3 flex flex-wrap gap-3">
            <label className="block text-xs text-text-2">Comentarios desde<Input type="date" className="!h-10 max-w-48" max={ymd(Date.now())} value={since} onChange={(e) => setSince(e.target.value)} /></label>
            <label className="block text-xs text-text-2">Actualización automática<Select className="!h-10" value={every} onChange={(e) => setEvery(e.target.value as Every)}>{(Object.keys(EVERY_TXT) as Every[]).map((k) => <option key={k} value={k}>{EVERY_TXT[k]}</option>)}</Select></label>
          </div>
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
        <Switch label="Biblioteca de anuncios (Facebook e Instagram)" sub={ext ? 'Busca los anuncios activos de cada competidor y anunciantes nuevos de combos: cuántos anuncios tiene, desde cuándo y qué ofertas y precios promociona.' : 'Necesita la extensión de Chrome (versión 2.3.6 o superior).'} checked={adLibrary && !!ext && webSearch} onChange={(v) => setComp({ adLibrary: v, ...(v ? { webSearch: true } : {}) })} />
        <Switch label="Canales de Telegram" sub={ext ? 'Busca los canales públicos de la competencia (y de combos en tus provincias) y lee su catálogo: combos y precios publicados.' : 'Necesita la extensión de Chrome.'} checked={telegram && !!ext && webSearch} onChange={(v) => setComp({ telegram: v, ...(v ? { webSearch: true } : {}) })} />
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
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'new', label: running ? `Análisis · ${runPct} %` : 'Análisis', short: running ? `${runPct} %` : 'Análisis', icon: running ? 'progress_activity' : 'radar' }, { id: 'comps', label: researching ? 'Competidores · buscando…' : 'Competidores', short: researching ? 'Buscando…' : 'Competidores', icon: researching ? 'progress_activity' : 'storefront', badge: nComps || undefined }]} />
      <div key={tab} className="anim-page">{tab === 'new' ? <Analyses brand={brand} /> : <CompetitorsTab brand={brand} />}</div>
      <p className="mt-4 flex items-center gap-1 text-xs text-text-2"><Icon name="history" className="!text-[16px]" />Cada actualización queda también en Historial › Análisis de la competencia.</p>
    </div>
  )
}
