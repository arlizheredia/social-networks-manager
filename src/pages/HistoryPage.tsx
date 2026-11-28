import { useEffect, useState } from 'react'
import { collapseRows } from '@/lib/motion'
import { ymd } from '@/features/publisher/report'
import { CompHistoryTab } from '@/features/competition/components'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Empty, Icon, IconButton, Input, PageHead, Tabs, confirmBox, toast, SkeletonList } from '@/components/ui'
import { cn } from '@/lib/cn'
import { fmtDate, fmtRelative } from '@/lib/util'
import { parseFbUrl } from '@/features/publisher/fb'
import { mutateHistory, setPub, usePublisher } from '@/features/publisher/store'
import { entryTitle, failedItems, unpublishItem } from '@/features/publisher/logic'
import { retryFailed, startRun } from '@/features/publisher/run'
import type { HistoryEntry, HistoryItem } from '@/features/publisher/types'
import { countTxt, deleteTracking, inHistory, trackProgress, trackWhen, useTR, activeIn } from '@/features/comments/tracking'
import { openTrackingComments } from '@/features/comments/components/open'

const statusPill = (i: HistoryItem) =>
  i.status === 'done' ? (i.review === 'awaiting' ? ['En aprobación', 'bg-primary-container text-on-primary-container'] : i.review === 'rejected' ? ['Rechazada', 'bg-error-container text-error'] : i.review === 'approved' ? ['Aprobada', 'bg-success-container text-success'] : ['Publicado', 'bg-success-container text-success'])
    : i.status === 'skipped' ? ['Omitido', 'bg-surface-3 text-text-2'] : ['Por hacer', 'bg-warn-container text-warn']

function Entry({ h }: { h: HistoryEntry }) {
  const nav = useNavigate()
  const aw = h.items.filter((i) => i.review === 'awaiting').length, d = h.items.filter((i) => i.status === 'done').length, s = h.items.filter((i) => i.status === 'skipped').length, p = h.items.length - d - s
  const F = failedItems(h)
  return (
    <details className="group rounded-3xl border border-outline-2 bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{entryTitle(h).slice(0, 90)}</div>
          {h.name && h.text.trim() && <div className="truncate text-xs text-text-2">{h.text.trim().split('\n')[0].slice(0, 90)}</div>}
          <div className="text-xs text-text-2">{fmtDate(h.date)} · {h.items.length} grupo(s){h.url ? ' · ' + parseFbUrl(h.url).kind : ''}</div>
        </div>
        <div className="hidden flex-wrap gap-1 text-xs sm:flex">
          {!p && !!F.length && <span className="rounded-lg bg-error-container px-2 py-0.5 text-error">Con incidencias</span>}
          <span className="rounded-lg bg-success-container px-2 py-0.5 text-success">{d - aw} publicados</span>
          {!!aw && <span className="rounded-lg bg-primary-container px-2 py-0.5 text-on-primary-container">{aw} en aprobación</span>}
          {!!s && <span className="rounded-lg bg-surface-3 px-2 py-0.5">{s} omitidos</span>}
          {!!p && <span className="rounded-lg bg-warn-container px-2 py-0.5 text-warn">{p} pendientes</span>}
        </div>
        <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-outline-2 p-4">
        {h.url && <p className="mb-2 break-all text-sm"><a href={h.url} target="_blank" rel="noopener">{h.url}</a></p>}
        {h.text && <pre className="mb-3 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{h.text}</pre>}
        <div className="mb-3 divide-y divide-outline-2 rounded-2xl border border-outline-2">
          {h.items.map((i, ix) => { const [lbl, cls] = statusPill(i); return (
            <div key={ix} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-[min(100%,10rem)] flex-1"><div className="truncate">{i.name}</div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-text-2"><span className={cn('rounded px-1.5', cls)}>{lbl}</span>{i.verify && <span className={i.verify.found ? 'text-success' : 'text-warn'}>{i.verify.found ? '✓ Verificada' : 'No encontrada'}</span>}{i.error && <span title={i.error}>· {i.error}</span>}{i.fbMsg && <span title={i.fbMsg}>· Facebook: «{i.fbMsg.slice(0, 60)}»</span>}</div>
              </div>
              {i.status === 'done' && <>
                <Button size="sm" variant="text" icon="undo" onClick={async () => { if (await confirmBox(`¿No llegaste a publicar en «${i.name}»?`, 'Se corregirá el registro: el grupo quedará disponible y dejará de contar para el límite diario.', 'No se publicó, liberar')) { unpublishItem(h.id, ix); toast(`«${i.name}» marcado como no publicado`) } }}>No se publicó</Button></>}
              <span className="text-xs text-text-2">{i.at ? fmtRelative(i.at) : '—'}</span>
              <a href={i.url} target="_blank" rel="noopener" aria-label="Abrir grupo" className="text-text-2"><Icon name="open_in_new" className="!text-[18px]" /></a>
            </div>
          ) })}
        </div>
        <div className="flex flex-wrap gap-2">
          {!!p && <Button icon="play_arrow" onClick={() => { nav('/publicar'); startRun(h.id) }}>Reanudar ({p})</Button>}
          {!p && !!F.length && <Button icon="refresh" onClick={() => { nav('/publicar'); retryFailed(h.id) }}>Reintentar fallidos ({F.length})</Button>}
          <Button variant="outlined" icon="label" onClick={() => { const n = prompt('Nombre para identificar la publicación en los informes:', h.name || ''); if (n != null) mutateHistory((hs) => { const x = hs.find((y) => y.id === h.id); if (x) { if (n.trim()) x.name = n.trim().slice(0, 120); else delete x.name } }) }}>{h.name ? 'Renombrar' : 'Poner nombre'}</Button>
          <Button variant="outlined" icon="content_copy" onClick={() => { setPub({ draft: { url: h.url, text: h.text, name: h.name || '' } }); nav('/publicar'); toast('Contenido cargado en Publicar') }}>Reutilizar contenido</Button>
          <Button variant="text" className="!text-error" icon="delete" onClick={() => { const before = usePublisher.getState().history; setPub({ history: before.filter((x) => x.id !== h.id) }); toast('Entrada eliminada') }}>Eliminar</Button>
        </div>
      </div>
    </details>
  )
}

function PublishHistory() {
  const history = usePublisher((s) => s.history)
  const nav = useNavigate()
  const [from, setFrom] = useState(ymd(Date.now() - 6 * 864e5))
  const [to, setTo] = useState(ymd(Date.now()))
  if (!history.length) return <Card><Empty icon={<Icon name="history" />} title="Aún no hay actividad">Cuando publiques en tus grupos aparecerá aquí, con el estado de cada grupo.<div className="mt-3"><Button icon="send" onClick={() => nav('/publicar')}>Ir a Publicar</Button></div></Empty></Card>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Button icon="today" className="w-full self-end sm:w-auto" onClick={() => { const d = ymd(Date.now()); nav(`/informes?tipo=difusion&desde=${d}&hasta=${d}`) }}>Informe diario</Button>
        <label className="w-full text-xs text-text-2 sm:w-auto">Desde<Input type="date" className="!h-10" max={ymd(Date.now())} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></label>
        <label className="w-full text-xs text-text-2 sm:w-auto">Hasta<Input type="date" className="!h-10" max={ymd(Date.now())} value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value) }} /></label>
        <Button variant="outlined" icon="summarize" className="w-full self-end sm:w-auto" onClick={() => nav(`/informes?tipo=difusion&desde=${from}&hasta=${to}`)}>{from === to ? 'Informe del día' : 'Informe del periodo'}</Button>
        <span className="flex-1" />
        <Button variant="text" icon="delete_sweep" className="self-end" onClick={async () => { if (await confirmBox('¿Borrar todo el historial de publicaciones?', 'Esta acción no afecta a lo publicado en Facebook ni a tus grupos.', 'Borrar', true)) { setPub({ history: [], runId: null, runIds: [] }); toast('Historial borrado') } }}>Borrar historial</Button>
      </div>
      {history.map((h) => <Entry key={h.id} h={h} />)}
    </div>
  )
}

function TrackingHistory() {
  const { tracks, runs, loaded } = useTR()
  const nav = useNavigate()
  // seguimiento pedido por enlace (p. ej. desde el aviso «Ver en el historial»): se muestra y se resalta
  const [params] = useSearchParams()
  const focus = params.get('t')
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById('seg-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => clearTimeout(t)
  }, [focus, tracks.length])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const list = tracks.filter((t) => inHistory(t) && !runs.includes(t.id) && activeIn(t, from, to))
  const ids = [...sel].filter((id) => list.some((t) => t.id === id))
  if (!loaded) return <SkeletonList rows={3} />
  if (!tracks.some(inHistory)) return <Card><Empty icon={<Icon name="track_changes" />} title="Todavía no hay seguimientos completados">Créalos en Comentarios › Seguimiento.<div className="mt-3"><Button icon="forum" onClick={() => nav('/comentarios')}>Ir a Comentarios</Button></div></Empty></Card>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-xs text-text-2 sm:w-auto">Desde<Input type="date" className="!h-10" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="w-full text-xs text-text-2 sm:w-auto">Hasta<Input type="date" className="!h-10" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="flex-1" />
        {ids.length > 0 && <>
          <Button variant="outlined" icon="forum" onClick={async () => { if (await openTrackingComments(ids)) nav('/comentarios/explorar') }}>Ver comentarios ({ids.length})</Button>
          <Button icon="summarize" onClick={() => nav(`/informes?t=${ids.join(',')}`)}>Crear informe ({ids.length})</Button>
          <Button variant="text" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar seguimientos?', `Se eliminarán ${ids.length} seguimiento(s) y sus resultados.`, 'Eliminar', true)) { await collapseRows(ids); for (const id of ids) await deleteTracking(id); setSel(new Set()) } }}>Eliminar</Button>
        </>}
      </div>
      {list.length > 0 && (
        // misma sangría que las casillas de la lista (borde de 1 px + 16 px de margen)
        <label className="flex items-center gap-3 pl-[17px] text-sm text-text-2">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" aria-label="Seleccionar todos" checked={list.every((t) => sel.has(t.id))}
            ref={(el) => { if (el) el.indeterminate = ids.length > 0 && ids.length < list.length }}
            onChange={(e) => setSel(e.target.checked ? new Set(list.map((t) => t.id)) : new Set())} />
          {ids.length ? `${ids.length} de ${list.length} seleccionado${ids.length === 1 ? '' : 's'}` : 'Seleccionar todos'}
        </label>
      )}
      <div className="divide-y divide-outline-2 rounded-3xl border border-outline-2 bg-surface">
        {list.map((t) => { const pr = trackProgress(t); return (
          <div key={t.id} id={'seg-' + t.id} data-row-id={t.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 transition-colors', focus === t.id && 'bg-primary-container/50 first:rounded-t-3xl last:rounded-b-3xl')}>
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(t.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(t.id) : s.delete(t.id); setSel(s) }} />
            <div className="min-w-[min(100%,12rem)] flex-1"><div className="truncate font-medium">{t.name}{t.status === 'paused' && <span className="ml-2 rounded bg-warn-container px-1.5 text-xs text-warn">parcial</span>}</div><div className="text-xs text-text-2">{trackWhen(t)} · {countTxt(pr.n, 'publicación', 'publicaciones')} · {countTxt(pr.comments, 'comentario', 'comentarios')}</div></div>
            <IconButton icon="forum" label="Ver comentarios" onClick={async () => { if (await openTrackingComments([t.id])) nav('/comentarios/explorar') }} />
            <IconButton icon="summarize" label="Crear informe" onClick={() => nav(`/informes?t=${t.id}`)} />
            <IconButton icon="delete" label="Eliminar" onClick={async () => { if (await confirmBox('¿Eliminar el seguimiento?', 'Se borrarán sus resultados.', 'Eliminar', true)) { await collapseRows([t.id]); deleteTracking(t.id) } }} />
          </div>
        ) })}
        {!list.length && <p className="p-6 text-center text-text-2">No hay seguimientos en esas fechas.</p>}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [params] = useSearchParams()
  const fromUrl = (): 'pub' | 'seg' | 'comp' => (params.get('tab') === 'seg' ? 'seg' : params.get('tab') === 'comp' ? 'comp' : 'pub')
  const [tab, setTab] = useState<'pub' | 'seg' | 'comp'>(fromUrl())
  useEffect(() => { if (params.get('tab')) setTab(fromUrl()) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  const pend = usePublisher((s) => s.history.filter((h) => h.items.some((i) => i.status === 'pending')).length)
  return (
    <div>
      <PageHead title="Historial" sub="Todo lo publicado en tus grupos, los seguimientos de comentarios y los informes de competencia." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'pub', label: 'Publicaciones en grupos', short: 'Publicaciones', icon: 'send', badge: pend || undefined }, { id: 'seg', label: 'Seguimientos de comentarios', short: 'Seguimientos', icon: 'track_changes' }, { id: 'comp', label: 'Competencia', icon: 'radar' }]} />
      <div key={tab} className="anim-page">{tab === 'pub' ? <PublishHistory /> : tab === 'seg' ? <TrackingHistory /> : <CompHistoryTab />}</div>
    </div>
  )
}
