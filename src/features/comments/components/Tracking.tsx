import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Button, Card, CardHead, Chip, Dialog, Empty, Field, Icon, IconButton, Input, MenuItem, NumberField, Popover, Select, Textarea, confirmBox, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText } from '@/lib/util'
import { useExtension } from '@/features/extension/bridge'
import { ExtensionDialog } from '@/features/extension/ExtensionDialog'
import { postLabel, todayISO, type Post, type Tracking as T } from '../db'
import { setPrefs, usePrefs } from '../prefs'
import { platName } from '../text'
import {
  addPosts, countTxt, exportPosts, importPosts, parsePostsFile, deletePosts, deleteTracking, finishTracking, LOGIN_URL, missingAuth, refreshSessions, retryItem, retryNow, runTracking,
  saveTracking, skipItem, stopTracking, trackProgress, trackWhen, updatePost, useTR,
} from '../tracking'
import { openTrackingComments } from './open'

const PDOT: Record<string, string> = { facebook: 'bg-fb', instagram: 'bg-ig', tiktok: 'bg-tt' }
const ST_TXT = { draft: ['edit_note', 'Borrador'], running: ['progress_activity', 'En curso'], paused: ['pause_circle', 'En pausa'], done: ['task_alt', 'Completado'] } as const

function TrackDialog({ open, onClose, postIds, edit }: { open: boolean; onClose: () => void; postIds: string[]; edit?: T | null }) {
  const { posts, sessions } = useTR()
  const ext = useExtension((s) => s.extractor)
  const prefs = usePrefs()
  const [ids, setIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO())
  const [order, setOrder] = useState(prefs.fbOrder)
  const [limit, setLimit] = useState(prefs.fbLimit || 1500)
  const [noLimit, setNoLimit] = useState(!prefs.fbLimit)
  useEffect(() => {
    if (!open) return
    setIds(edit ? edit.postIds : postIds)
    setName(edit ? edit.name : 'Seguimiento del ' + new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }))
    setDate(edit ? edit.date : todayISO())
    if (edit) { setOrder(edit.fbOrder); setNoLimit(!edit.fbLimit); setLimit(edit.fbLimit || 1500) }
    refreshSessions()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = ids.map((id) => posts.find((p) => p.id === id)).filter((p): p is Post => !!p)
  const miss = ext ? missingAuth(sel) : []
  const save = async (start: boolean) => {
    const fbLimit = noLimit ? 0 : Math.max(50, Math.round(limit) || 1500)
    setPrefs({ fbOrder: order, fbLimit })
    const t = await saveTracking({ id: edit?.id, name, date, postIds: ids, fbOrder: order, fbLimit })
    onClose()
    if (start) runTracking(t.id)
  }
  return (
    <Dialog open={open} onClose={onClose} title={edit ? 'Editar seguimiento' : 'Nuevo seguimiento'}
      actions={<><Button variant="text" onClick={onClose}>Cancelar</Button><Button variant="outlined" disabled={!sel.length} onClick={() => save(false)}>Guardar</Button><Button icon="play_arrow" disabled={!sel.length || !ext || !!miss.length} onClick={() => save(true)}>Guardar e iniciar</Button></>}>
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Fecha"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="mb-1 text-[13px] font-medium text-text-2">Publicaciones ({sel.length})</div>
      <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-outline-2">
        {sel.map((p) => <div key={p.id} className="flex items-center gap-2 border-b border-outline-2 px-3 py-1.5 last:border-0"><i className={cn('size-2.5 rounded-full', PDOT[p.platform])} /><span className="min-w-0 flex-1 truncate text-sm">{postLabel(p)}</span><IconButton size="sm" icon="close" label="Quitar" onClick={() => setIds(ids.filter((x) => x !== p.id))} /></div>)}
        {!sel.length && <p className="p-3 text-sm text-text-2">No hay publicaciones. Ciérralo y selecciona algunas en la lista.</p>}
      </div>
      {!ext && <Banner tone="err" className="mb-3">La extensión no está instalada: instálala (Ajustes › Extensión) para poder iniciar el seguimiento.</Banner>}
      {!!miss.length && (
        <Banner tone="err" className="mb-3">
          Se necesita una sesión iniciada en {miss.map(platName).join(', ')} en este navegador.
          <div className="mt-1 flex flex-wrap gap-2">{miss.map((n) => <a key={n} href={LOGIN_URL[n]} target="_blank" rel="noopener">Iniciar sesión en {platName(n)}</a>)}<button className="underline" onClick={() => refreshSessions()}>Comprobar de nuevo</button></div>
          {!sessions.known && <div className="text-xs">Comprobando sesiones…</div>}
        </Banner>
      )}
      {sel.some((p) => p.platform === 'facebook') && (
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="mb-2 text-sm font-medium">Comentarios de Facebook</div>
          <Field label="Comentarios a revisar"><Select value={order} onChange={(e) => setOrder(e.target.value as typeof order)}><option value="all">Todos los comentarios</option><option value="pert">Más pertinentes</option><option value="rec">Más recientes</option></Select></Field>
          <div className="flex items-center gap-3"><span className="text-sm">Máximo por publicación</span><NumberField label="Máximo de comentarios por publicación" min={50} max={100000} step={50} disabled={noLimit} className="w-28" value={limit} onChange={setLimit} onOutOfRange={(_, f) => toast(`El máximo por publicación debe ser al menos 50: se usa ${f}`)} /><Chip selected={noLimit} onClick={() => setNoLimit(!noLimit)}>Sin límite</Chip></div>
        </div>
      )}
    </Dialog>
  )
}

function PostsCard({ onTrack }: { onTrack: (ids: string[]) => void }) {
  const posts = useTR((s) => s.posts)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [many, setMany] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const list = posts.filter((p) => !q || (postLabel(p) + ' ' + p.url).toLowerCase().includes(q.toLowerCase()))
  const ids = [...sel].filter((id) => posts.some((p) => p.id === id))
  const fileRef = useRef<HTMLInputElement>(null)
  /** Se exportan las seleccionadas; sin selección, todas. */
  const toExport = ids.length ? posts.filter((p) => sel.has(p.id)) : posts
  return (
    <Card>
      <CardHead step={1} title="Publicaciones" sub="Las publicaciones de Facebook, Instagram o TikTok que revisas cada día" />
      {many == null ? (
        <div className="flex flex-wrap gap-2">
          <div className="min-w-60 flex-[2]"><Input icon="link" placeholder="Pega el enlace de una publicación" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && url.trim()) { if (await addPosts([url], name)) { setUrl(''); setName('') } } }} /></div>
          <div className="min-w-40 flex-1"><Input placeholder="Nombre (recomendado)" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button icon="add" disabled={!url.trim()} onClick={async () => { if (await addPosts([url], name)) { setUrl(''); setName('') } }}>Añadir</Button>
          <Button variant="text" onClick={() => setMany('')}>Añadir varias</Button>
          <Popover trigger={(o) => <IconButton icon="import_export" label="Importar / exportar publicaciones" className="self-center" onClick={o} />}>
            {(close) => <>
              <MenuItem icon="upload_file" onClick={() => { close(); fileRef.current?.click() }}>Importar desde archivo (JSON, CSV, TXT)</MenuItem>
              <MenuItem icon="data_object" disabled={!posts.length} onClick={() => { close(); exportPosts(toExport, 'json') }}>Exportar {ids.length ? `${ids.length} seleccionada${ids.length === 1 ? '' : 's'}` : 'todas'} (JSON)</MenuItem>
              <MenuItem icon="table_view" disabled={!posts.length} onClick={() => { close(); exportPosts(toExport, 'csv') }}>Exportar {ids.length ? `${ids.length} seleccionada${ids.length === 1 ? '' : 's'}` : 'todas'} a Excel (CSV)</MenuItem>
            </>}
          </Popover>
          <input ref={fileRef} type="file" hidden accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            try { await importPosts(parsePostsFile(await f.text(), f.name)) } catch (err) { toast('No se pudo leer el archivo: ' + (err as Error).message) }
          }} />
        </div>
      ) : (
        <div>
          <Textarea rows={5} placeholder="Un enlace por línea" value={many} onChange={(e) => setMany(e.target.value)} />
          <div className="mt-2 flex gap-2"><Button onClick={async () => { await addPosts(many.split(/[\s,]+/)); setMany(null) }}>Añadir todas</Button><Button variant="text" onClick={() => setMany(null)}>Cancelar</Button></div>
        </div>
      )}
      <p className="mt-1.5 text-xs text-text-2">La red se detecta sola. Las publicaciones repetidas no se duplican.</p>
      {!!posts.length && (
        <>
          <div className="mt-4 mb-2 flex flex-wrap items-center gap-2">
            <input type="checkbox" aria-label="Seleccionar todas" className="ml-[13px] size-4 shrink-0 accent-[var(--primary)]" checked={list.length > 0 && list.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(list.map((p) => p.id)) : new Set())} />
            <div className="min-w-40 flex-1"><Input icon="search" className="!h-10" placeholder="Buscar publicación" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {ids.length > 0 && <>
              <Button size="sm" variant="text" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar publicaciones?', `Se quitarán ${ids.length} de la lista. Los comentarios ya guardados se conservan en los seguimientos.`, 'Eliminar', true)) { await deletePosts(ids); setSel(new Set()) } }}>Eliminar</Button>
              <Button size="sm" icon="track_changes" onClick={() => onTrack(ids)}>Crear seguimiento ({ids.length})</Button>
            </>}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-outline-2">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-outline-2 px-3 py-2 last:border-0">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(p.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(p.id) : s.delete(p.id); setSel(s) }} />
                <i className={cn('size-2.5 shrink-0 rounded-full', PDOT[p.platform])} title={platName(p.platform)} />
                <div className="min-w-0 flex-1"><div className="truncate">{postLabel(p)}</div><div className="truncate text-xs text-text-2">{platName(p.platform)}{p.author ? ' · ' + p.author : ''} · <a href={p.url} target="_blank" rel="noopener">{p.url.replace(/^https?:\/\/(www\.)?/, '')}</a></div></div>
                <IconButton size="sm" icon="edit" label="Renombrar" onClick={() => { const n = prompt('Nombre para identificarla:', p.name || postLabel(p)); if (n != null) updatePost({ ...p, name: n.trim().slice(0, 120) }) }} />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

function TrackCard({ t, onEdit }: { t: T; onEdit: () => void }) {
  const { posts, running } = useTR()
  const nav = useNavigate()
  const [open, setOpen] = useState(t.id === running)
  const pr = trackProgress(t)
  const [ic, label] = ST_TXT[t.status]
  const isRun = running === t.id
  return (
    <div className="rounded-3xl border border-outline-2 bg-surface">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={ic} className={cn('text-primary', isRun && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{t.name}</div>
          <div className="text-xs text-text-2">{trackWhen(t)} · {countTxt(pr.n, 'publicación', 'publicaciones')} · {countTxt(pr.comments, 'comentario', 'comentarios')}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-container"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pr.pct}%` }} /></div>
        </div>
        <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs">{label} · {pr.pct} %</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} />
      </button>
      {open && (
        <div className="border-t border-outline-2 p-4">
          {t.halt && <Banner tone="err" className="mb-3"><b>Se detuvo la extracción</b> en «{t.halt.post}»: {t.halt.error}</Banner>}
          <div className="mb-3 flex flex-wrap gap-2">
            {isRun ? <Button variant="danger" icon="stop" onClick={() => stopTracking()}>Detener</Button>
              : t.status !== 'done' && <Button icon="play_arrow" disabled={!!running} onClick={() => runTracking(t.id)}>{t.status === 'draft' ? 'Iniciar' : 'Continuar'}</Button>}
            <Button variant="outlined" icon="forum" disabled={!pr.comments} onClick={async () => { await openTrackingComments([t.id]); nav('/comentarios/explorar') }}>Ver comentarios</Button>
            <Button variant="outlined" icon="summarize" disabled={!pr.comments} onClick={() => nav(`/informes?t=${t.id}`)}>Crear informe</Button>
            {!isRun && <Button variant="text" icon="edit" onClick={onEdit}>Editar</Button>}
            {!isRun && t.status !== 'done' && <Button variant="text" icon="inventory_2" onClick={() => finishTracking(t)}>Finalizar y archivar</Button>}
            {!isRun && <Button variant="text" icon="delete" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar el seguimiento?', 'Se borrarán sus resultados. Los comentarios de una publicación solo se borran si ningún otro seguimiento los usa.', 'Eliminar', true)) deleteTracking(t.id) }}>Eliminar</Button>}
          </div>
          <div className="space-y-1">
            {t.postIds.map((id) => {
              const p = posts.find((x) => x.id === id), it = t.items[id]
              if (!it) return null
              const st = it.status === 'running' ? (it.phase === 'retry' && it.retry ? `Reintento ${it.retry.attempt} de ${it.retry.max} en ${it.retry.left} s${it.retry.offline ? ' (sin conexión)' : ''}` : it.phase === 'opening' ? 'Abriendo la publicación…' : `Extrayendo… ${it.count || 0}${it.total ? ' de ' + it.total : ''} comentarios`)
                : it.status === 'done' ? `${countTxt(it.count || 0, 'comentario', 'comentarios')}${it.limitReached ? ' · límite alcanzado' : ''}${it.partial ? ' · parcial' : ''}`
                : it.status === 'error' ? `Error: ${it.error}` : it.status === 'skipped' ? 'Omitida' : it.partial ? `Parcial: ${countTxt(it.count || 0, 'comentario', 'comentarios')}` : 'Pendiente'
              return (
                <div key={id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-text/4">
                  <Icon name={{ pending: 'schedule', running: 'progress_activity', done: 'check_circle', error: 'error', skipped: 'block' }[it.status]} className={cn('!text-[20px]', it.status === 'done' ? 'text-success' : it.status === 'error' ? 'text-error' : 'text-text-2', it.status === 'running' && 'animate-spin')} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm">{p ? postLabel(p) : id}</div><div className={cn('text-xs', it.status === 'error' ? 'text-error' : 'text-text-2')}>{st}{it.note && it.status === 'running' ? ` · ${it.note}` : ''}</div></div>
                  {it.status === 'running' && it.phase === 'retry' && <Button size="sm" variant="text" onClick={retryNow}>Reintentar ahora</Button>}
                  {!isRun && (it.status === 'error' || it.status === 'done') && <IconButton size="sm" icon="refresh" label="Reintentar" onClick={() => retryItem(t, id)} />}
                  {!isRun && (it.status === 'error' || it.status === 'pending') && <IconButton size="sm" icon="skip_next" label="Omitir" onClick={() => skipItem(t, id)} />}
                  {it.status === 'error' && !!it.diag && <IconButton size="sm" icon="bug_report" label="Copiar diagnóstico" onClick={async () => toast((await copyText(JSON.stringify({ url: p?.url, error: it.error, diag: it.diag }, null, 2))) ? 'Diagnóstico copiado' : 'No se pudo copiar')} />}
                  {p && <a href={p.url} target="_blank" rel="noopener" aria-label="Abrir publicación" className="text-text-2"><Icon name="open_in_new" className="!text-[18px]" /></a>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Seguimiento diario: publicaciones guardadas y extracción automática con la extensión. */
export function TrackingPanel() {
  const { tracks, loaded } = useTR()
  const ext = useExtension((s) => s.extractor)
  const [dlg, setDlg] = useState<{ open: boolean; ids: string[]; edit: T | null }>({ open: false, ids: [], edit: null })
  const [extOpen, setExtOpen] = useState(false)
  const active = tracks.filter((t) => t.status !== 'done')
  if (!loaded) return <p className="text-text-2">Cargando…</p>
  return (
    <div className="space-y-4">
      {!ext && <Banner tone="warn" icon="extension_off" action={<Button size="sm" onClick={() => setExtOpen(true)}>Instalar</Button>}>Para extraer automáticamente los comentarios necesitas la <b>extensión de Chrome</b>.</Banner>}
      <PostsCard onTrack={(ids) => setDlg({ open: true, ids, edit: null })} />
      <Card>
        <CardHead step={2} title="Seguimientos" sub="Cada seguimiento extrae los comentarios de sus publicaciones. Los completados pasan al Historial." />
        {active.length ? <div className="space-y-3">{active.map((t) => <TrackCard key={t.id} t={t} onEdit={() => setDlg({ open: true, ids: [], edit: t })} />)}</div>
          : <Empty icon={<Icon name="track_changes" />} title="No hay seguimientos en curso">Selecciona publicaciones en la lista y pulsa <b>Crear seguimiento</b>.</Empty>}
      </Card>
      <TrackDialog open={dlg.open} postIds={dlg.ids} edit={dlg.edit} onClose={() => setDlg({ open: false, ids: [], edit: null })} />
      <ExtensionDialog open={extOpen} onClose={() => setExtOpen(false)} />
    </div>
  )
}

export { TrackCard }
