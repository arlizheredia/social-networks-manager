import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Card, CardHead, Icon } from '@/components/ui'
import { ColumnChart } from '@/components/charts/Charts'
import { usePublisher } from '@/features/publisher/store'
import { activeGroups, awaitingItems, entryTitle, usage } from '@/features/publisher/logic'
import { ymd } from '@/features/publisher/report'
import { useTR, trackProgress, inHistory } from '@/features/comments/tracking'
import { getPrefs } from '@/features/comments/prefs'
import { loadCompHistory, setRun, useCompetition, useCompHistory } from '@/features/competition/store'
import { useAI } from '@/features/ai/engine'
import { useExtension } from '@/features/extension/bridge'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/cn'
import { ActivityHeatmap, type DayAct } from './ActivityHeatmap'
import { fmtNum } from '@/lib/util'

/** «hace 5 min», «ayer», «12 nov.» */
function ago(ts: number) {
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 2 * 86400) return 'ayer'
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} días`
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

interface Act { at: number; icon: string; tone: string; title: string; sub: string; to: string; tag: string }

function Activity({ items }: { items: Act[] }) {
  if (!items.length) return <p className="py-6 text-center text-text-2">Aún no hay actividad. Empieza publicando en tus grupos o creando un seguimiento de comentarios.</p>
  return (
    <ol className="divide-y divide-outline-2">
      {items.map((a, i) => (
        <li key={i}>
          <Link to={a.to} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-text no-underline hover:bg-text/4">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', a.tone)}><Icon name={a.icon} className="!text-[20px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.title}</span>
              <span className="block truncate text-xs text-text-2">{a.tag} · {a.sub}</span>
            </span>
            <span className="shrink-0 text-xs whitespace-nowrap text-text-2">{ago(a.at)}</span>
            <Icon name="chevron_right" className="!text-[18px] text-text-2" />
          </Link>
        </li>
      ))}
    </ol>
  )
}

/** Indicador compacto: icono y etiqueta en una línea, valor debajo. */
function Tile({ icon, label, value, sub, tone = 'text-primary' }: { icon: string; label: string; value: ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-outline-2 bg-surface px-3 py-2">
      <div className="flex items-start gap-1 text-xs leading-4 text-text-2"><Icon name={icon} className={cn('!text-[16px]', tone)} /><span className="min-w-0">{label}</span></div>
      <div className="font-display text-xl leading-7 tabular-nums">{value}{sub && <span className="ml-1 text-xs text-text-2">{sub}</span>}</div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-2xl bg-surface-2 px-3 py-2"><div className="text-xs text-text-2">{label}</div><div className="font-display text-xl tabular-nums">{value}</div></div>
}

export default function HomePage() {
  const nav = useNavigate()
  const pub = usePublisher()
  const { tracks, posts, running } = useTR()
  const comp = useCompetition()
  const compHist = useCompHistory()
  const ai = useAI()
  const ext = useExtension((s) => s.version)
  const { welcomeDismissed, dismissWelcome } = useSettings()
  useEffect(() => { if (!useCompHistory.getState().loaded) loadCompHistory() }, [])

  const brand = getPrefs().report.client?.trim() || ''
  const day = usage(pub).day.length
  const pendingRuns = pub.history.filter((h) => h.items.some((i) => i.status === 'pending')).length
  const aw = awaitingItems(pub.history).length
  const runningT = tracks.find((t) => t.id === running)
  const lastDone = tracks.find(inHistory)

  // Difusión: grupos en que se compartió cada día (últimos 14 días)
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const days = Array.from({ length: 14 }, (_, k) => { const d = new Date(today); d.setDate(d.getDate() - (13 - k)); return d })
  const perDay = new Map<string, number>()
  pub.history.forEach((h) => h.items.forEach((i) => { if (i.status === 'done' && i.at) { const k = ymd(i.at); perDay.set(k, (perDay.get(k) || 0) + 1) } }))
  const cols = days.map((d) => ({ label: d.toLocaleDateString('es', { day: 'numeric', month: 'short' }), value: perDay.get(ymd(d.getTime())) || 0 }))
  const week = cols.slice(7).reduce((s, c) => s + c.value, 0), prevWeek = cols.slice(0, 7).reduce((s, c) => s + c.value, 0)

  // Actividad por día (para el ritmo de trabajo)
  const byDay = new Map<string, DayAct>()
  const addAct = (ts: number | string | undefined, k: keyof DayAct) => {
    const t = typeof ts === 'string' ? Date.parse(ts) : ts
    if (!t) return
    const key = ymd(t), x = byDay.get(key) || { shares: 0, extractions: 0, reports: 0 }
    x[k]++; byDay.set(key, x)
  }
  pub.history.forEach((h) => h.items.forEach((i) => { if (i.status === 'done') addAct(i.at || h.date, 'shares') }))
  tracks.forEach((t) => Object.values(t.items).forEach((i) => { if (i.status === 'done' || i.partial) addAct(i.finishedAt, 'extractions') }))
  compHist.list.forEach((r) => addAct(r.createdAt, 'reports'))

  // Comentarios recogidos en los últimos 30 días
  const since30 = Date.now() - 30 * 864e5
  const comments30 = tracks.filter((t) => Date.parse(t.date + 'T12:00') >= since30).reduce((s, t) => s + trackProgress(t).comments, 0)

  // Competencia
  const rivals = comp.competitors.filter((c) => c.status !== 'pendiente')
  const pendingRivals = comp.competitors.length - rivals.length
  const topRivals = [...rivals].sort((a, b) => (b.mentions || 0) - (a.mentions || 0) || a.name.localeCompare(b.name)).slice(0, 3)
  const lastComp = compHist.list[0]

  // Actividad reciente: publicaciones, seguimientos e informes de competencia
  const acts: Act[] = [
    ...pub.history.map((h): Act => {
      const ok = h.items.filter((i) => i.status === 'done').length, pend = h.items.filter((i) => i.status === 'pending').length
      const last = Math.max(h.date, ...h.items.map((i) => i.at || 0))
      return { at: last, icon: 'send', tone: pend ? 'bg-warn-container text-warn' : 'bg-success-container text-success', tag: 'Difusión en grupos', title: entryTitle(h).slice(0, 90),
        sub: pend ? `${ok} de ${h.items.length} grupos · a medias` : `compartida en ${ok} de ${h.items.length} grupos`, to: '/historial?tab=pub' }
    }),
    ...tracks.filter((t) => t.status !== 'draft').map((t): Act => {
      const pr = trackProgress(t)
      return { at: Date.parse(t.finishedAt || t.startedAt || t.createdAt) || 0, icon: 'forum', tone: t.status === 'done' ? 'bg-primary-container text-on-primary-container' : 'bg-warn-container text-warn', tag: 'Seguimiento de comentarios', title: t.name,
        sub: `${fmtNum(pr.comments)} comentarios de ${pr.n} publicaciones${t.status === 'running' ? ' · en curso' : t.status === 'paused' ? ' · en pausa' : ''}`, to: t.status === 'done' ? `/historial?tab=seg&t=${encodeURIComponent(t.id)}` : '/comentarios' }
    }),
    ...compHist.list.map((r): Act => ({ at: r.createdAt, icon: 'radar', tone: 'bg-secondary-container text-on-secondary-container', tag: 'Informe de la competencia', title: r.brand ? `Competencia · ${r.brand}` : 'Informe de la competencia', sub: r.headline || `${r.from} a ${r.to}`, to: '/historial?tab=comp' })),
  ].filter((a) => a.at).sort((a, b) => b.at - a.at).slice(0, 8)

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tile icon="group" label="Grupos activos" value={fmtNum(activeGroups(pub).length)} />
      <Tile icon="send" tone="text-success" label="Publicados hoy" value={fmtNum(day)} sub={`/ ${fmtNum(pub.settings.dayCap)}`} />
      <Tile icon="pending" tone="text-warn" label="En aprobación" value={fmtNum(aw)} />
      <Tile icon="track_changes" label="Publicaciones seguidas" value={fmtNum(posts.length)} />
      <Tile icon="forum" label="Comentarios (30 días)" value={fmtNum(comments30)} />
      <Tile icon="storefront" label="Competidores" value={fmtNum(rivals.length)} />
    </div>
  )
  const C = '!p-4 sm:!p-5' // tarjetas compactas (cn no fusiona clases: se fuerza el relleno)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl">Hola 👋</h1>
        <p className="text-sm text-text-2">{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}{brand ? ` · ${brand}` : ''}</p>
      </div>

      {!welcomeDismissed && (!pub.groups.length || !ai.installed || !ext) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-surface-2 px-4 py-2 text-sm">
          <span className="flex items-center gap-1 font-medium"><Icon name="rocket_launch" className="!text-[18px] text-primary" />Primeros pasos</span>
          <span className="flex items-center gap-1"><Icon name={pub.groups.length ? 'check_circle' : 'radio_button_unchecked'} className={cn('!text-[18px]', pub.groups.length ? 'text-success' : 'text-text-3')} /><Link to="/grupos">Añade tus grupos</Link></span>
          <span className="flex items-center gap-1"><Icon name={ai.installed ? 'check_circle' : 'radio_button_unchecked'} className={cn('!text-[18px]', ai.installed ? 'text-success' : 'text-text-3')} />Instala la IA (botón <b className="font-medium">Instalar IA</b>)</span>
          <span className="flex items-center gap-1"><Icon name={ext ? 'check_circle' : 'radio_button_unchecked'} className={cn('!text-[18px]', ext ? 'text-success' : 'text-text-3')} />Extensión de Chrome (opcional)</span>
          <Button variant="text" size="sm" className="ml-auto" onClick={dismissWelcome}>Ocultar</Button>
        </div>
      )}

      {pendingRuns > 0 && (
        <Banner tone="info" icon="pending_actions" action={<Link to="/historial"><Button size="sm">Ver</Button></Link>}>
          <b>Tienes {pendingRuns === 1 ? 'una publicación a medias' : `${pendingRuns} publicaciones a medias`}.</b> Puedes reanudarla desde el Historial.
        </Banner>
      )}
      {runningT && (
        <Banner tone="info" icon="progress_activity" action={<Link to="/comentarios"><Button size="sm">Ver</Button></Link>}>
          <b>Extrayendo comentarios:</b> «{runningT.name}» · {trackProgress(runningT).pct} %
        </Banner>
      )}

      {/* en pantallas estrechas, los indicadores van primero */}
      <div className="xl:hidden">{stats}</div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <ActivityHeatmap byDay={byDay} className={C} />
          <Card className={C}>
            <CardHead title="Actividad reciente" sub="Toca un elemento para abrirlo" actions={<Link to="/historial"><Button size="sm" variant="text">Ver todo</Button></Link>} />
            <Activity items={acts} />
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="hidden xl:block">{stats}</div>
          <Card className={C}>
            <CardHead title="Competencia" sub={lastComp ? `Último informe ${ago(lastComp.createdAt)} · ${fmtNum(compHist.list.length)} en total` : 'Aún no hay informes de la competencia'} />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Mini label="Competidores" value={fmtNum(rivals.length)} />
              <Mini label="Por revisar" value={fmtNum(pendingRivals)} />
            </div>
            {lastComp?.headline && <p className="mb-2 line-clamp-2 text-sm text-text-2">{lastComp.headline}</p>}
            {!!topRivals.length && (
              <ul className="mb-2 space-y-0.5">{topRivals.map((c) => <li key={c.id} className="flex items-center gap-2 text-sm"><Icon name="storefront" className="!text-[16px] text-text-2" /><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-text-2 tabular-nums">{c.mentions ? `${fmtNum(c.mentions)} ${c.mentions === 1 ? 'mención' : 'menciones'}` : c.provinces.slice(0, 2).join(', ')}</span></li>)}</ul>
            )}
            <div className="flex flex-wrap gap-1">
              <Button size="sm" icon="radar" onClick={() => { setRun({ tab: 'new' }); nav('/competencia') }}>Nuevo informe</Button>
              {pendingRivals > 0 && <Button size="sm" variant="tonal" icon="fact_check" onClick={() => { setRun({ tab: 'comps' }); nav('/competencia') }}>Revisar {pendingRivals}</Button>}
              {lastComp && <Button size="sm" variant="text" icon="history" onClick={() => nav('/historial?tab=comp')}>Informes</Button>}
            </div>
          </Card>

          <Card className={C}>
            <CardHead title="Difusión en grupos" sub={week + prevWeek ? `7 días: ${fmtNum(week)} ${week === 1 ? 'grupo' : 'grupos'} · semana anterior: ${fmtNum(prevWeek)}` : 'Últimas dos semanas'} />
            {week + prevWeek ? <ColumnChart data={cols} height={120} valueLabel="grupos en que se compartió" />
              : <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-text-2"><Icon name="campaign" className="text-primary" /><span className="flex-1">Nada compartido en dos semanas.</span><Link to="/publicar"><Button size="sm" variant="tonal">Publicar</Button></Link></div>}
          </Card>

          {lastDone && (
            <Card className={C}>
              <CardHead title="Último seguimiento" sub={`${lastDone.name} · ${fmtNum(trackProgress(lastDone).comments)} comentarios de ${lastDone.postIds.length} publicaciones`} />
              <div className="flex flex-wrap gap-1">
                <Link to={`/informes?t=${lastDone.id}`}><Button size="sm" variant="tonal" icon="summarize">Crear informe</Button></Link>
                <Link to={`/historial?tab=seg&t=${encodeURIComponent(lastDone.id)}`}><Button size="sm" variant="text" icon="history">Historial</Button></Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
