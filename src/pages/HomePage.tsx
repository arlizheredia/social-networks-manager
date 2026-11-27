import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Card, CardHead, CountUp, Icon, SkeletonList } from '@/components/ui'
import { ColumnChart } from '@/components/charts/Charts'
import { setPub, usePublisher } from '@/features/publisher/store'
import { retryFailed, startRun } from '@/features/publisher/run'
import { parseFbUrl } from '@/features/publisher/fb'
import { openTrackingComments } from '@/features/comments/components/open'
import { activeGroups, awaitingItems, entryTitle, usage } from '@/features/publisher/logic'
import { ymd } from '@/features/publisher/report'
import { useTR, trackProgress, inHistory, runTracking } from '@/features/comments/tracking'
import { getPrefs } from '@/features/comments/prefs'
import { loadCompHistory, setRun, useCompetition, useCompHistory } from '@/features/competition/store'
import { useAI } from '@/features/ai/engine'
import { useExtension } from '@/features/extension/bridge'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/cn'
import { WorkRhythm, type DayAct } from './WorkRhythm'
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

type Kind = 'pub' | 'seg' | 'comp'
interface ActBtn { label: string; icon: string; run: () => void }
interface Act { at: number; kind: Kind; icon: string; tone: string; title: string; sub: string; to: string; badges: { text: string; cls: string }[]; actions: ActBtn[] }

const KIND: Record<Kind, string> = { pub: 'Difusión', seg: 'Seguimientos', comp: 'Competencia' }
const dayLabel = (ts: number) => {
  const d = new Date(ts), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  return same(d, t) ? 'Hoy' : same(d, y) ? 'Ayer' : d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())
}
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

/** Actividad reciente: filtros por tipo, agrupada por día, con estado y acciones directas en cada elemento. */
function Activity({ items }: { items: Act[] }) {
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [more, setMore] = useState(false)
  const week = Date.now() - 7 * 864e5
  const count = (k: Kind | 'all') => items.filter((a) => (k === 'all' || a.kind === k) && a.at >= week).length
  const list = items.filter((a) => kind === 'all' || a.kind === kind)
  const shown = list.slice(0, more ? 30 : 8)
  const groups: { day: string; items: Act[] }[] = []
  shown.forEach((a) => { const d = dayLabel(a.at), g = groups[groups.length - 1]; if (g && g.day === d) g.items.push(a); else groups.push({ day: d, items: [a] }) })
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Tipo de actividad">
        {(['all', 'pub', 'seg', 'comp'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setMore(false) }}
            className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-colors', kind === k ? 'bg-secondary-container text-on-secondary-container' : 'text-text-2 hover:bg-text/8')}>
            {k === 'all' ? 'Todo' : KIND[k]}{count(k) ? <span className="ml-1 tabular-nums opacity-70">{count(k)}</span> : null}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-text-2">cifras: últimos 7 días</span>
      </div>
      {!list.length ? <p className="py-6 text-center text-sm text-text-2">{kind === 'all' ? 'Aún no hay actividad. Empieza publicando en tus grupos o creando un seguimiento de comentarios.' : `No hay actividad de ${KIND[kind].toLowerCase()} todavía.`}</p> : (
        <div>
          {groups.map((g, gi) => (
            <section key={g.day} className={cn(gi > 0 && 'mt-1 border-t border-outline-2 pt-1')}>
              <h4 className="sticky top-0 z-[1] bg-surface py-1 text-xs font-medium text-text-2">{g.day}</h4>
              <ol>
                {g.items.map((a, i) => (
                  <li key={i} className="border-b border-outline-2 py-1 last:border-b-0"><div className="group flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-text/4">
                    <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', a.tone)}><Icon name={a.icon} className="!text-[18px]" /></span>
                    <div className="min-w-0 flex-1">
                      <Link to={a.to} className="block truncate font-medium text-text no-underline hover:underline">{a.title}</Link>
                      <div className="truncate text-xs text-text-2">{a.sub}</div>
                      {(a.badges.length > 0 || a.actions.length > 0) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {a.badges.map((b, j) => <span key={j} className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', b.cls)}>{b.text}</span>)}
                          {a.actions.map((x, j) => (
                            <button key={j} onClick={x.run} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/8">
                              <Icon name={x.icon} className="!text-[14px]" />{x.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-text-2 tabular-nums" title={new Date(a.at).toLocaleString('es')}>{g.day === 'Hoy' || g.day === 'Ayer' ? hhmm(a.at) : ago(a.at)}</span>
                  </div></li>
                ))}
              </ol>
            </section>
          ))}
          {list.length > shown.length && <Button size="sm" variant="text" icon="expand_more" onClick={() => setMore(true)}>Mostrar más ({Math.min(30, list.length) - shown.length})</Button>}
        </div>
      )}
    </>
  )
}

/** Cifra de los últimos 7 días con su cambio frente a los 7 anteriores («▲ +2»). invert: subir es malo. */
function Delta({ label, v, p, suffix = '', unit = '', invert, na }: { label: string; v: number; p: number; suffix?: string; unit?: string; invert?: boolean; na?: boolean }) {
  const d = v - p, good = invert ? d < 0 : d > 0
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2 px-3 py-2">
      <div className="truncate text-xs text-text-2">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-xl tabular-nums">{na ? '—' : <CountUp value={v} />}{!na && suffix && <span className="text-xs text-text-2">{suffix}</span>}</span>
        {!na && d !== 0 && <span className={cn('text-[11px] font-medium tabular-nums', good ? 'text-success' : 'text-error')} title="Frente a los 7 días anteriores">{d > 0 ? '▲ +' : '▼ '}{fmtNum(d)}{unit}</span>}
      </div>
    </div>
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
  const { tracks, posts, running, loaded: trLoaded } = useTR()
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
  // Estadísticas de difusión: últimos 7 días frente a los 7 anteriores
  const dif = (from: number, to: number) => {
    const its = pub.history.flatMap((h) => h.items.filter((i) => i.at && i.at >= from && i.at < to && i.status !== 'pending').map((i) => ({ h, i })))
    const ok = its.filter(({ i }) => i.status === 'done')
    const fail = its.filter(({ i }) => i.status === 'skipped' && i.error && !/^(Descartado|Marcado como no publicado)|24 h/.test(i.error))
    const groupsN = new Map<string, number>()
    ok.forEach(({ i }) => groupsN.set(i.name, (groupsN.get(i.name) || 0) + 1))
    return {
      posts: new Set(ok.map(({ h }) => h.url || h.id)).size, shares: ok.length, groups: groupsN.size,
      days: new Set(ok.map(({ i }) => ymd(i.at!))).size, aw: ok.filter(({ i }) => i.review === 'awaiting').length,
      rej: ok.filter(({ i }) => i.review === 'rejected').length, fail: fail.length,
      rate: ok.length + fail.length ? Math.round((ok.length / (ok.length + fail.length)) * 100) : null,
      top: [...groupsN].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3),
    }
  }
  const now7 = Date.now(), d7 = dif(now7 - 7 * 864e5, now7 + 1), p7 = dif(now7 - 14 * 864e5, now7 - 7 * 864e5)

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
  const ERR = 'bg-error-container text-error', WARN = 'bg-warn-container text-warn', INFO = 'bg-primary-container text-on-primary-container', OK = 'bg-success-container text-success'
  const acts: Act[] = [
    ...pub.history.map((h): Act => {
      const done = h.items.filter((i) => i.status === 'done'), pend = h.items.filter((i) => i.status === 'pending').length
      const awN = done.filter((i) => i.review === 'awaiting').length, rej = done.filter((i) => i.review === 'rejected').length
      const fail = h.items.filter((i) => i.status === 'skipped' && i.error && !/^(Descartado|Marcado como no publicado)|24 h/.test(i.error)).length
      const last = Math.max(h.date, ...h.items.map((i) => i.at || 0))
      const badges = [
        ...(pend ? [{ text: `${pend} pendientes`, cls: WARN }] : []),
        ...(awN ? [{ text: `${awN} en aprobación`, cls: INFO }] : []),
        ...(fail ? [{ text: `${fail} con incidencias`, cls: ERR }] : []),
        ...(rej ? [{ text: `${rej} rechazadas`, cls: ERR }] : []),
        ...(!pend && !fail && !rej && done.length ? [{ text: 'completada', cls: OK }] : []),
      ]
      return { at: last, kind: 'pub', icon: 'send', tone: pend ? WARN : fail ? ERR : OK, title: entryTitle(h).slice(0, 90),
        sub: `Difusión en grupos · compartida en ${done.length} de ${h.items.length} grupos${h.url ? ' · ' + (parseFbUrl(h.url).kind || 'enlace').toLowerCase() : ''}`, to: '/historial?tab=pub', badges,
        actions: [
          ...(pend ? [{ label: 'Continuar', icon: 'play_arrow', run: () => { nav('/publicar'); startRun(h.id) } }] : []),
          ...(fail && !pend ? [{ label: 'Reintentar fallidos', icon: 'refresh', run: () => retryFailed(h.id) }] : []),
          { label: 'Reutilizar', icon: 'content_copy', run: () => { setPub({ draft: { url: h.url, text: h.text, name: h.name || '' } }); nav('/publicar') } },
          { label: 'Informe', icon: 'summarize', run: () => nav('/informes') },
        ] }
    }),
    ...tracks.filter((t) => t.status !== 'draft').map((t): Act => {
      const pr = trackProgress(t)
      const badges = [
        ...(t.status === 'running' ? [{ text: `en curso · ${pr.pct} %`, cls: INFO }] : []),
        ...(t.status === 'paused' ? [{ text: t.interrupted ? 'interrumpido' : 'en pausa', cls: WARN }] : []),
        ...(pr.errors ? [{ text: `${pr.errors} con error`, cls: ERR }] : []),
        ...(t.status === 'done' ? [{ text: 'completado', cls: OK }] : []),
      ]
      return { at: Date.parse(t.finishedAt || t.startedAt || t.createdAt) || 0, kind: 'seg', icon: 'forum', tone: t.status === 'done' ? INFO : WARN, title: t.name,
        sub: `Seguimiento de comentarios · ${fmtNum(pr.comments)} comentarios de ${pr.n} publicaciones`, to: t.status === 'done' ? `/historial?tab=seg&t=${encodeURIComponent(t.id)}` : '/comentarios', badges,
        actions: [
          ...(t.status === 'paused' && !running ? [{ label: 'Continuar', icon: 'play_arrow', run: () => { nav('/comentarios'); runTracking(t.id) } }] : []),
          ...(pr.comments ? [{ label: 'Ver comentarios', icon: 'forum', run: async () => { await openTrackingComments([t.id]); nav('/comentarios/explorar') } }] : []),
          ...(pr.comments ? [{ label: 'Crear informe', icon: 'summarize', run: () => nav(`/informes?t=${t.id}`) }] : []),
        ] }
    }),
    ...compHist.list.map((r): Act => ({ at: r.createdAt, kind: 'comp', icon: 'radar', tone: 'bg-secondary-container text-on-secondary-container', title: r.brand ? `Informe de la competencia · ${r.brand}` : 'Informe de la competencia',
      sub: r.headline || `${r.from} a ${r.to}`, to: '/historial?tab=comp', badges: r.provinces?.length ? [{ text: `${r.provinces.length} provincias`, cls: 'bg-surface-3 text-text-2' }] : [],
      actions: [{ label: 'Ver informes', icon: 'history', run: () => nav('/historial?tab=comp') }, { label: 'Nuevo', icon: 'radar', run: () => { setRun({ tab: 'new' }); nav('/competencia') } }] })),
  ].filter((a) => a.at).sort((a, b) => b.at - a.at)

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tile icon="group" label="Grupos activos" value={<CountUp value={activeGroups(pub).length} />} />
      <Tile icon="send" tone="text-success" label="Publicados hoy" value={<CountUp value={day} />} sub={`/ ${fmtNum(pub.settings.dayCap)}`} />
      <Tile icon="pending" tone="text-warn" label="En aprobación" value={<CountUp value={aw} />} />
      <Tile icon="track_changes" label="Publicaciones seguidas" value={<CountUp value={posts.length} />} />
      <Tile icon="forum" label="Comentarios (30 días)" value={<CountUp value={comments30} />} />
      <Tile icon="storefront" label="Competidores" value={<CountUp value={rivals.length} />} />
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
          <span className="flex items-center gap-1"><Icon name={pub.groups.length ? 'check_circle' : 'radio_button_unchecked'} className={cn('!text-[18px]', pub.groups.length ? 'text-success' : 'text-text-3')} /><Link to="/publicar/grupos">Añade tus grupos</Link></span>
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


      {/* izquierda: indicadores, actividad reciente y último seguimiento · derecha: ritmo de trabajo, difusión y competencia */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {stats}

          <Card className={C}>
            <CardHead title="Actividad reciente" sub="Publicaciones, seguimientos e informes, con acceso directo a lo siguiente que puedes hacer" actions={<Link to="/historial"><Button size="sm" variant="text">Ver todo</Button></Link>} />
            {trLoaded ? <Activity items={acts} /> : <SkeletonList rows={3} className="[&>div]:border-0 [&>div]:p-2" />}
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

        <div className="min-w-0 space-y-4">
          <WorkRhythm byDay={byDay} className={C} />
          <Card className={C}>
            <CardHead title="Difusión en grupos" sub="Últimos 7 días, comparado con los 7 anteriores" actions={<Link to="/informes"><Button size="sm" variant="text">Informe</Button></Link>} />
            {week + prevWeek ? (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Delta label="Publicaciones" v={d7.posts} p={p7.posts} />
                  <Delta label="Veces compartida" v={d7.shares} p={p7.shares} />
                  <Delta label="Grupos distintos" v={d7.groups} p={p7.groups} />
                  <Delta label="Días con difusión" v={d7.days} p={p7.days} suffix=" / 7" />
                  <Delta label="Éxito" v={d7.rate ?? 0} p={p7.rate ?? 0} suffix=" %" na={d7.rate == null} unit=" pts" />
                  <Delta label="En aprobación" v={d7.aw} p={p7.aw} invert />
                </div>
                {(d7.fail > 0 || d7.rej > 0) && (
                  <div className="mb-2 flex flex-wrap gap-1 text-[11px] font-medium">
                    {d7.fail > 0 && <span className="rounded-md bg-error-container px-1.5 py-0.5 text-error">{d7.fail} {d7.fail === 1 ? 'intento fallido' : 'intentos fallidos'}</span>}
                    {d7.rej > 0 && <span className="rounded-md bg-error-container px-1.5 py-0.5 text-error">{d7.rej} {d7.rej === 1 ? 'rechazada' : 'rechazadas'}</span>}
                  </div>
                )}
                {d7.top.length > 0 && (
                  <div className="mb-2 text-xs text-text-2">Grupos más usados: {d7.top.map(([n, c], k) => <span key={n}>{k ? ', ' : ''}<b className="font-medium text-text">{n}</b> ({c})</span>)}</div>
                )}
                <div className="mb-1 text-xs text-text-2">Grupos por día (14 días)</div>
                <ColumnChart data={cols} height={110} valueLabel="grupos en que se compartió" />
              </>
            ) : <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-text-2"><Icon name="campaign" className="text-primary" /><span className="flex-1">Nada compartido en dos semanas.</span><Link to="/publicar"><Button size="sm" variant="tonal">Publicar</Button></Link></div>}
          </Card>
          <Card className={C}>
            <CardHead title="Competencia" sub={lastComp ? `Último informe ${ago(lastComp.createdAt)} · ${fmtNum(compHist.list.length)} en total` : 'Aún no hay informes de la competencia'} />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Mini label="Competidores" value={<CountUp value={rivals.length} />} />
              <Mini label="Por revisar" value={<CountUp value={pendingRivals} />} />
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
        </div>
      </div>
    </div>
  )
}
