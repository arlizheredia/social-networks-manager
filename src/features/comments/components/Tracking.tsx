import { useEffect, useRef, useState } from 'react'
import { collapseRows } from '@/lib/motion'
import { useNavigate } from 'react-router-dom'
import { SkeletonList, Banner, Button, Card, CardHead, Chip, Dialog, Empty, Field, Icon, IconButton, Input, MenuItem, NumberField, Popover, Select, Textarea, confirmBox, toast, FloatingWindow } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText } from '@/lib/util'
import { useExtension } from '@/features/extension/bridge'
import { ExtensionDialog } from '@/features/extension/ExtensionDialog'
import { postLabel, type Post, type Tracking as T } from '../db'
import { setPrefs, usePrefs } from '../prefs'
import { platName } from '../text'
import {
  addPosts, countTxt, exportPosts, importPosts, parsePostsFile, deletePosts, deleteTracking, finishTracking, LOGIN_URL, missingAuth, refreshSessions, retryItem, retryNow, runTracking,
  saveTracking, skipItem, stopTracking, trackProgress, trackWhen, updatePost, useTR, unarchiveTracking, setTrackBg, closeTrackWin,
} from '../tracking'
import { openTrackingComments } from './open'

const PDOT: Record<string, string> = { facebook: 'bg-fb', instagram: 'bg-ig', tiktok: 'bg-tt' }
const ST_TXT = { draft: ['edit_note', 'Borrador'], running: ['progress_activity', 'En curso'], paused: ['pause_circle', 'En pausa'], done: ['task_alt', 'Al día'] } as const

function TrackDialog({ open, onClose, postIds, edit }: { open: boolean; onClose: () => void; postIds: string[]; edit?: T | null }) {
  const { posts, sessions } = useTR()
  const ext = useExtension((s) => s.extractor)
  const prefs = usePrefs()
  const [ids, setIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [add, setAdd] = useState('')
  const [limit, setLimit] = useState(prefs.fbLimit || 1500)
  const [noLimit, setNoLimit] = useState(!prefs.fbLimit)
  useEffect(() => {
    if (!open) return
    setIds(edit ? edit.postIds : postIds)
    setName(edit ? edit.name : 'Seguimiento de comentarios')
    setAdd('')
    if (edit) { setNoLimit(!edit.fbLimit); setLimit(edit.fbLimit || 1500) }
    refreshSessions()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = ids.map((id) => posts.find((p) => p.id === id)).filter((p): p is Post => !!p)
  const miss = ext ? missingAuth(sel) : []
  const save = async (start: boolean) => {
    const fbLimit = noLimit ? 0 : Math.max(50, Math.round(limit) || 1500)
    setPrefs({ fbLimit })
    const t = await saveTracking({ id: edit?.id, name, postIds: ids, fbLimit })
    onClose()
    if (start) runTracking(t.id)
  }
  return (
    <Dialog open={open} onClose={onClose} wide title={edit ? 'Editar seguimiento' : 'Nuevo seguimiento'}
      actions={<><Button variant="text" onClick={onClose}>Cancelar</Button><Button variant="outlined" disabled={!sel.length} onClick={() => save(false)}>Guardar</Button><Button icon="play_arrow" disabled={!sel.length || !ext || !!miss.length} onClick={() => save(true)}>Guardar e iniciar</Button></>}>
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="mb-1 text-[13px] font-medium text-text-2">Publicaciones ({sel.length})</div>
      <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-outline-2">
        {sel.map((p) => <div key={p.id} className="flex items-center gap-2 border-b border-outline-2 px-3 py-1.5 last:border-0"><i className={cn('size-2.5 rounded-full', PDOT[p.platform])} /><span className="min-w-0 flex-1 truncate text-sm">{postLabel(p)}</span><IconButton size="sm" icon="close" label="Quitar" onClick={() => setIds(ids.filter((x) => x !== p.id))} /></div>)}
        {!sel.length && <p className="p-3 text-sm text-text-2">No hay publicaciones. Añádelas abajo o selecciónalas en la lista.</p>}
      </div>
      {posts.some((p) => !ids.includes(p.id)) && (
        <div className="mb-3 flex gap-2">
          <Select className="flex-1" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Añadir publicación">
            <option value="">Añadir una publicación…</option>
            {posts.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{postLabel(p)}</option>)}
          </Select>
          <Button variant="tonal" icon="add" disabled={!add} onClick={() => { setIds([...ids, add]); setAdd('') }}>Añadir</Button>
        </div>
      )}
      {edit && edit.postIds.some((id) => !ids.includes(id)) && <p className="mb-3 text-xs text-text-2"><Icon name="info" className="!text-[14px] align-[-2px]" /> Las publicaciones que quites conservan sus comentarios: no saldrán en los nuevos informes y, si las vuelves a añadir, la extracción continúa desde donde se quedó.</p>}
      <p className="mb-3 rounded-2xl bg-surface-2 p-3 text-xs text-text-2"><b className="font-medium text-text">Cómo se extrae:</b> cada vez que inicies o continúes, cada publicación trae como mucho el máximo de comentarios (o los que le queden, si son menos) y el seguimiento se detiene solo. La primera vez se empieza por todos; después se continúa desde el último extraído y se suman los nuevos. Cada comentario guarda su fecha de extracción para los informes por día.</p>
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
          <div className="flex flex-wrap items-center gap-3"><span className="text-sm">Máximo por publicación en cada extracción</span><NumberField label="Máximo de comentarios por publicación en cada extracción" min={50} max={100000} step={50} disabled={noLimit} className="w-28" value={limit} onChange={setLimit} onOutOfRange={(_, f) => toast(`El máximo por publicación debe ser al menos 50: se usa ${f}`)} /><Chip selected={noLimit} onClick={() => setNoLimit(!noLimit)}>Sin límite</Chip></div>
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
          <div className="min-w-[min(100%,15rem)] flex-[2]"><Input icon="link" placeholder="Pega el enlace de una publicación" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && url.trim()) { if (await addPosts([url], name)) { setUrl(''); setName('') } } }} /></div>
          <div className="min-w-[min(100%,10rem)] flex-1"><Input placeholder="Nombre (recomendado)" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
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
            <div className="min-w-[min(100%,10rem)] flex-1"><Input icon="search" className="!h-10" placeholder="Buscar publicación" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {ids.length > 0 && <>
              <Button size="sm" variant="text" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar publicaciones?', `Se quitarán ${ids.length} de la lista. Los comentarios ya guardados se conservan en los seguimientos.`, 'Eliminar', true)) { await collapseRows(ids); await deletePosts(ids); setSel(new Set()) } }}>Eliminar</Button>
              <Button size="sm" icon="track_changes" onClick={() => onTrack(ids)}>Crear seguimiento ({ids.length})</Button>
            </>}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-outline-2">
            {list.map((p) => (
              <div key={p.id} data-row-id={p.id} className="flex items-center gap-3 border-b border-outline-2 px-3 py-2 last:border-0">
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

/** Cabecera de un seguimiento: estado, nombre, última actualización, progreso. */
function TrackHead({ t }: { t: T }) {
  const { runs } = useTR()
  const isRun = runs.includes(t.id)
  const pr = trackProgress(t)
  const [ic, label] = ST_TXT[t.status]
  return (
    <>
        <Icon name={ic} className={cn('text-primary', isRun && 'animate-spin')} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{t.name}</div>
        <div className="text-xs text-text-2">{t.status === 'draft' ? 'Sin extraer' : `Actualizado ${trackWhen(t)}`} · {countTxt(pr.n, 'publicación', 'publicaciones')} · {countTxt(pr.comments, 'comentario', 'comentarios')}{(() => { const l = t.rounds?.[t.rounds.length - 1]; return l && t.status !== 'running' ? ` · última vuelta: ${l.newComments ? '+' + countTxt(l.newComments, 'nuevo', 'nuevos') : 'sin nuevos'}` : '' })()}{t.rounds && t.rounds.length > 1 ? ` · ${t.rounds.length} vueltas` : ''}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-container"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pr.pct}%` }} /></div>
      </div>
      <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs">{t.status === 'done' && t.postIds.some((id) => t.items[id]?.more) ? 'Quedan comentarios' : label}{t.status === 'running' ? ` · ${pr.pct} %` : ''}</span>
    </>
  )
}

/** Acciones y publicaciones de un seguimiento (en la lista y en la ventana flotante). */
function TrackBody({ t, onEdit }: { t: T; onEdit?: () => void }) {
  const { posts, runs } = useTR()
  const nav = useNavigate()
  const isRun = runs.includes(t.id)
  const pr = trackProgress(t)
  return (
    <>
          {t.halt && <Banner tone="err" className="mb-3"><b>Se detuvo la extracción</b> en «{t.halt.post}»: {t.halt.error}</Banner>}
          <div className="mb-3 flex flex-wrap gap-2">
            {isRun ? <Button variant="danger" icon="stop" onClick={() => stopTracking(t.id)}>Detener</Button>
              : <Button icon={t.status === 'done' ? 'refresh' : 'play_arrow'} onClick={() => runTracking(t.id)} title={t.status === 'done' ? 'Extrae solo los comentarios nuevos desde la última vez' : undefined}>{t.status === 'draft' ? 'Iniciar' : t.status === 'done' && !t.postIds.some((id) => t.items[id]?.more) ? 'Buscar comentarios nuevos' : 'Continuar'}</Button>}
            <Button variant="outlined" icon="forum" disabled={!pr.comments} onClick={async () => { await openTrackingComments([t.id]); nav('/comentarios/explorar') }}>Ver comentarios</Button>
            <Button variant="outlined" icon="summarize" disabled={!pr.comments} onClick={() => nav(`/informes?t=${t.id}`)}>Crear informe</Button>
            {!isRun && onEdit && <Button variant="text" icon="edit" onClick={onEdit}>Editar</Button>}
            {!isRun && t.status !== 'draft' && <Button variant="text" icon="inventory_2" onClick={async () => { await collapseRows([t.id]); await finishTracking(t); toast(`«${t.name}» archivado: sigue en el historial y en los informes`) }}>Archivar</Button>}
            {!isRun && <Button variant="text" icon="delete" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar el seguimiento?', 'Se borrarán sus resultados. Los comentarios de una publicación solo se borran si ningún otro seguimiento los usa.', 'Eliminar', true)) { await collapseRows([t.id]); deleteTracking(t.id) } }}>Eliminar</Button>}
          </div>
          <div className="space-y-1">
            {t.postIds.map((id) => {
              const p = posts.find((x) => x.id === id), it = t.items[id]
              if (!it) return null
              const st = it.status === 'running' ? (it.phase === 'retry' && it.retry ? `Reintento ${it.retry.attempt} de ${it.retry.max} en ${it.retry.left} s${it.retry.offline ? ' (sin conexión)' : ''}` : it.phase === 'opening' ? 'Abriendo la publicación…' : `Extrayendo… ${it.count || 0}${it.total ? ' de ' + it.total : ''} comentarios`)
                : it.status === 'done' ? `${countTxt(it.count || 0, 'comentario', 'comentarios')}${it.total && (it.count || 0) < it.total ? ` de ${it.total.toLocaleString('es')} según la red` : ''}${it.newCount != null ? ` · ${it.newCount ? '+' + countTxt(it.newCount, 'nuevo', 'nuevos') : 'sin nuevos'}` : ''}${it.mode === 'full' ? ' · primera extracción' : it.mode === 'catch' ? ' · continuó con los que faltaban' : ''}${it.more && it.total ? ` · quedan ~${countTxt(Math.max(0, it.total - (it.count || 0)), 'comentario', 'comentarios')}: pulsa Continuar` : ''}${it.limitReached ? ' · límite alcanzado' : ''}${it.partial ? ' · parcial' : ''}`
                : it.status === 'error' ? `Error: ${it.error}` : it.status === 'skipped' ? 'Omitida' : it.partial ? `Parcial: ${countTxt(it.count || 0, 'comentario', 'comentarios')}` : 'Pendiente'
              return (
                <div key={id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-text/4">
                  <Icon name={{ pending: 'schedule', running: 'progress_activity', done: 'check_circle', error: 'error', skipped: 'block' }[it.status]} className={cn('!text-[20px]', it.status === 'done' ? 'text-success' : it.status === 'error' ? 'text-error' : 'text-text-2', it.status === 'running' && 'animate-spin')} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm">{p ? postLabel(p) : id}</div><div className={cn('text-xs', it.status === 'error' ? 'text-error' : 'text-text-2')}>{st}{it.note && it.status === 'running' ? ` · ${it.note}` : ''}</div></div>
                  {it.status === 'running' && it.phase === 'retry' && <Button size="sm" variant="text" onClick={() => retryNow(t.id)}>Reintentar ahora</Button>}
                  {!isRun && (it.status === 'error' || it.status === 'done') && <IconButton size="sm" icon="refresh" label="Reintentar" onClick={() => retryItem(t, id)} />}
                  {!isRun && (it.status === 'error' || it.status === 'pending') && <IconButton size="sm" icon="skip_next" label="Omitir" onClick={() => skipItem(t, id)} />}
                  {(it.status === 'error' || (it.status === 'done' && !!it.total && (it.count || 0) < it.total)) && !!it.diag && <IconButton size="sm" icon="bug_report" label={it.status === 'error' ? 'Copiar diagnóstico' : `Faltan comentarios (${it.count || 0} de ${it.total}): copiar diagnóstico`} onClick={async () => toast((await copyText(JSON.stringify({ url: p?.url, error: it.error, extraidos: it.count, totalFacebook: it.total, diag: it.diag }, null, 2))) ? 'Diagnóstico copiado' : 'No se pudo copiar')} />}
                  {p && <a href={p.url} target="_blank" rel="noopener" aria-label="Abrir publicación" className="text-text-2"><Icon name="open_in_new" className="!text-[18px]" /></a>}
                </div>
              )
            })}
          </div>
    </>
  )
}

function TrackCard({ t, onEdit }: { t: T; onEdit: () => void }) {
  const { runs, bgIds, win } = useTR()
  const isRun = runs.includes(t.id), inWin = win === t.id && !bgIds.includes(t.id)
  const [open, setOpen] = useState(false)
  return (
    <div data-row-id={t.id} className="rounded-3xl border border-outline-2 bg-surface">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => (isRun ? setTrackBg(t.id, false) : setOpen(!open))} aria-expanded={open}>
        <TrackHead t={t} />
        <span title={isRun ? 'Mostrar la ventana del seguimiento' : undefined}><Icon name={isRun ? (inWin ? 'select_window' : 'open_in_full') : open ? 'expand_less' : 'expand_more'} /></span>
      </button>
      {open && !isRun && <div className="border-t border-outline-2 p-4"><TrackBody t={t} onEdit={onEdit} /></div>}
    </div>
  )
}

/** Ventana flotante (se arrastra, centrada por defecto) con el seguimiento en curso; se ve en cualquier pantalla. */
export function TrackWindow() {
  const { win, bgIds, tracks, runs } = useTR()
  const t = win && !bgIds.includes(win) ? tracks.find((x) => x.id === win) : undefined
  if (!t) return null
  const isRun = runs.includes(t.id)
  return (
    <FloatingWindow id="seguimiento" label={`Seguimiento ${t.name}`} className="max-h-[min(80dvh,720px)] w-[min(760px,calc(100vw-16px))]"
      head={<>
        <TrackHead t={t} />
        {isRun && <Button size="sm" variant="tonal" icon="picture_in_picture_alt" onClick={() => { setTrackBg(t.id, true); toast('Seguimiento en segundo plano: sigue en curso. Toca su tarjeta arriba a la derecha para volver.', 'picture_in_picture_alt') }}><span className="hidden sm:inline">Segundo plano</span></Button>}
        <IconButton icon="close" label={isRun ? 'Cerrar (sigue en segundo plano)' : 'Cerrar'} onClick={closeTrackWin} />
      </>}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5"><TrackBody t={t} /></div>
    </FloatingWindow>
  )
}

/** Seguimiento continuo: publicaciones guardadas y extracción automática (todos la primera vez; después, solo los nuevos). */
export function TrackingPanel() {
  const { tracks, loaded } = useTR()
  const ext = useExtension((s) => s.extractor)
  const [dlg, setDlg] = useState<{ open: boolean; ids: string[]; edit: T | null }>({ open: false, ids: [], edit: null })
  const [extOpen, setExtOpen] = useState(false)
  // los seguimientos son continuos: siguen aquí (para buscar comentarios nuevos) hasta que se archivan
  const active = tracks.filter((t) => !t.archived)
  const archived = tracks.filter((t) => t.archived)
  const [showArch, setShowArch] = useState(false)
  if (!loaded) return <SkeletonList rows={3} />
  return (
    <div className="space-y-4">
      {!ext && <Banner tone="warn" icon="extension_off" action={<Button size="sm" onClick={() => setExtOpen(true)}>Instalar</Button>}>Para extraer automáticamente los comentarios necesitas la <b>extensión de Chrome</b>.</Banner>}
      <PostsCard onTrack={(ids) => setDlg({ open: true, ids, edit: null })} />
      <Card>
        <CardHead step={2} title="Seguimientos" sub="Cada seguimiento extrae todos los comentarios la primera vez y, después, solo los nuevos. Actualízalo cuando quieras; archívalo cuando ya no lo necesites." />
        {active.length ? <div className="space-y-3">{active.map((t) => <TrackCard key={t.id} t={t} onEdit={() => setDlg({ open: true, ids: [], edit: t })} />)}</div>
          : <Empty icon={<Icon name="track_changes" />} title="No hay seguimientos activos">Selecciona publicaciones en la lista y pulsa <b>Crear seguimiento</b>.</Empty>}
        {archived.length > 0 && (
          <div className="mt-3">
            <Button size="sm" variant="text" icon={showArch ? 'expand_less' : 'inventory_2'} onClick={() => setShowArch(!showArch)}>{showArch ? 'Ocultar archivados' : `Archivados (${archived.length})`}</Button>
            {showArch && <div className="mt-2 divide-y divide-outline-2 rounded-2xl border border-outline-2">{archived.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Icon name="inventory_2" className="!text-[18px] text-text-2" /><span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-xs text-text-2">{countTxt(trackProgress(t).comments, 'comentario', 'comentarios')}</span>
                <Button size="sm" variant="tonal" icon="unarchive" onClick={async () => { await unarchiveTracking(t); toast(`«${t.name}» vuelve a los seguimientos activos`) }}>Reactivar</Button>
              </div>
            ))}</div>}
          </div>
        )}
      </Card>
      <TrackDialog open={dlg.open} postIds={dlg.ids} edit={dlg.edit} onClose={() => setDlg({ open: false, ids: [], edit: null })} />
      <ExtensionDialog open={extOpen} onClose={() => setExtOpen(false)} />
    </div>
  )
}

export { TrackCard }
