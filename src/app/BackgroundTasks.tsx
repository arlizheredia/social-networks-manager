import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { showRun, startRun, useRun, type RunState } from '@/features/publisher/run'
import { usePublisher } from '@/features/publisher/store'
import { entryTitle } from '@/features/publisher/logic'
import { autoPct } from '@/features/publisher/components/RunDialog'
import { putTracking, runTracking, setTrackBg, trackProgress, useTR } from '@/features/comments/tracking'
import { analysisName, setRun as setCompRun, useCompRun, useCompetition } from '@/features/competition/store'

/** Anillo de progreso pequeño con el porcentaje dentro. */
function Ring({ pct, spin }: { pct: number | null; spin?: boolean }) {
  const C = 2 * Math.PI * 15
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className={cn('absolute inset-0 size-10 -rotate-90', spin && pct == null && 'animate-spin')}>
        <circle cx="18" cy="18" r="15" className="fill-none stroke-primary-container" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="15" className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (pct ?? 25) / 100)} />
      </svg>
      {pct != null && <b className="relative text-[10px] tabular-nums">{pct}%</b>}
    </span>
  )
}

function Task({ icon, title, sub, pct, done, onOpen }: { icon: string; title: string; sub: string; pct: number | null; done?: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} title="Volver a primer plano" className="anim-slide-in flex w-full items-center gap-3 rounded-2xl bg-surface-3 px-3 py-2 text-left shadow-3 ring-1 ring-outline-2 transition-colors hover:bg-surface-2 sm:w-80">
      {done ? <span className="anim-bounce grid size-10 shrink-0 place-items-center rounded-full bg-success-container text-success"><Icon name="task_alt" /></span> : <Ring pct={pct} spin />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium"><Icon name={icon} className="!text-[16px] text-primary" /><span className="truncate">{title}</span></span>
        <span className="block truncate text-xs text-text-2">{sub}</span>
      </span>
      <Icon name="open_in_full" className="!text-[18px] text-text-2" />
    </button>
  )
}

/** Proceso que se interrumpió al recargar o cerrar la página: su avance está guardado y se puede continuar. */
function Interrupted({ icon, title, sub, pct, onContinue, onDismiss }: { icon: string; title: string; sub: string; pct: number; onContinue: () => void; onDismiss: () => void }) {
  return (
    <div className="anim-slide-in flex w-full items-center gap-3 rounded-2xl bg-warn-container px-3 py-2 shadow-3 ring-1 ring-outline-2 sm:w-80">
      <Ring pct={pct} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium"><Icon name={icon} className="!text-[16px] text-warn" /><span className="truncate">{title}</span></span>
        <span className="block truncate text-xs text-text-2">{sub}</span>
        <span className="mt-1 flex gap-1">
          <button onClick={onContinue} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-on-primary">Continuar</button>
          <button onClick={onDismiss} className="rounded-full px-3 py-1 text-xs font-medium text-text-2 hover:bg-text/8">Más tarde</button>
        </span>
      </span>
    </div>
  )
}

/** Procesos en segundo plano (publicación en grupos y extracción de comentarios): siguen en curso y se pueden traer
 *  de vuelta a primer plano con un toque. */
export function BackgroundTasks() {
  const { runs, front } = useRun()
  const history = usePublisher((s) => s.history)
  const { runs: trRuns, bgIds, tracks } = useTR()
  // actualización de un análisis de competencia en segundo plano
  const comp = useCompRun()
  const compAn = useCompetition((s) => s.analyses.find((a) => a.id === comp.active))
  const compBg = !!comp.step && comp.bg
  const nav = useNavigate()
  const { pathname } = useLocation()

  // publicaciones en curso que no están en pantalla (en segundo plano o detrás de otra)
  const entry = (id: string) => history.find((h) => h.id === id)
  const isDone = (r: RunState) => { const e = entry(r.entryId); return !!e && r.idx >= e.items.length }
  const bgRuns = runs.filter((r) => entry(r.entryId) && (r.bg || r.entryId !== front))
  // seguimientos en curso en segundo plano (el de la ventana flotante ya está a la vista)
  const trBg = trRuns.map((id) => tracks.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x && bgIds.includes(x.id))

  // Procesos interrumpidos por recargar o cerrar la página (su avance está guardado)
  const runIds = usePublisher((s) => s.runIds)
  const [hidden, setHidden] = useState<string[]>([])
  const pubInts = pathname === '/publicar' ? [] // en Publicar ya se ofrece reanudar en un aviso
    : runIds.filter((id) => !runs.some((r) => r.entryId === id) && !hidden.includes(id)).map(entry).filter((h): h is NonNullable<typeof h> => !!h && h.items.some((i) => i.status === 'pending'))
  const trInt = tracks.filter((x) => x.interrupted && x.status === 'paused' && !trRuns.includes(x.id))

  // Recargar o cerrar la página durante una operación en curso: el navegador pide confirmación
  const busy = runs.some((r) => !isDone(r)) || trRuns.length > 0 || !!comp.step
  useEffect(() => {
    if (!busy) return
    const h = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [busy])

  // Aviso cuando termina una publicación que estaba en segundo plano
  const notified = useRef(new Set<string>())
  useEffect(() => {
    bgRuns.forEach((r) => {
      const e = entry(r.entryId)
      if (e && isDone(r) && !notified.current.has(r.entryId)) {
        notified.current.add(r.entryId)
        toast(`Terminó la publicación «${entryTitle(e).slice(0, 60)}»`, 'task_alt', { label: 'Ver resumen', onClick: () => showRun(r.entryId) })
      }
    })
  })

  if (!bgRuns.length && !trBg.length && !compBg && !pubInts.length && !trInt.length) return null
  const pubs = bgRuns.map((R) => {
    const e = entry(R.entryId)!
    const n = e.items.length, d = e.items.filter((i) => i.status !== 'pending').length
    const it = e.items[R.idx], done = isDone(R)
    const mode = R.auto ? 'Automática' : 'Asistida'
    const sub = done ? `${mode} · terminada · toca para ver el resumen`
      : R.auto ? (R.autoRunning && !R.stop ? `${mode} · ${d} de ${n} · ${R.phase === 'wait' ? (R.step.startsWith('Esperando turno') ? 'esperando turno' : 'pausa de seguridad') : it ? it.name : 'preparando'}` : `${mode} · ${d} de ${n} · en pausa`)
      : `${mode} · ${d} de ${n} · esperando tu acción en «${it?.name || ''}»`
    return <Task key={R.entryId} icon="campaign" title={entryTitle(e)} sub={sub} pct={done ? 100 : R.auto ? autoPct(R, e) : Math.round((d / n) * 100)} done={done} onOpen={() => showRun(R.entryId)} />
  })
  const tr = trBg.map((t) => {
    const pr = trackProgress(t)
    const cur = t.postIds.map((id) => t.items[id]).find((i) => i?.status === 'running')
    const st = cur?.phase === 'retry' ? ' · reintentando' : cur?.note?.startsWith('Esperando turno') ? ' · esperando turno' : ''
    return <Task key={t.id} icon="forum" title={`Extrayendo comentarios · ${t.name}`} sub={`${pr.done} de ${pr.n} publicaciones · ${pr.comments.toLocaleString('es')} comentarios${st}`} pct={pr.pct}
      onOpen={() => setTrackBg(t.id, false)} />
  })
  return (
    <div className="fixed top-[68px] right-3 left-3 z-30 flex max-h-[calc(100dvh-90px)] flex-col items-end gap-2 overflow-y-auto sm:left-auto md:right-4" aria-label="Procesos en segundo plano">
      {pubs}{tr}
      {compBg && <Task icon="radar" title={`Análisis de la competencia · ${analysisName(compAn?.provinces || [])}`} sub={comp.step || 'Actualizando…'} pct={comp.pct} onOpen={() => setCompRun({ bg: false })} />}
      {pubInts.map((h) => { const d = h.items.filter((i) => i.status !== 'pending').length; return (
        <Interrupted key={h.id} icon="campaign" title={entryTitle(h)} sub={`Publicación interrumpida · ${d} de ${h.items.length} grupos`} pct={Math.round((d / h.items.length) * 100)}
          onContinue={() => startRun(h.id)} onDismiss={() => { setHidden((x) => [...x, h.id]); toast('Puedes continuarla desde Publicar o el Historial') }} />
      ) })}
      {trInt.map((x) => { const pr = trackProgress(x); return (
        <Interrupted key={x.id} icon="forum" title={x.name} sub={`Extracción interrumpida · ${pr.done} de ${pr.n} · ${pr.comments.toLocaleString('es')} comentarios guardados`} pct={pr.pct}
          onContinue={() => { nav('/comentarios'); runTracking(x.id) }} onDismiss={() => { delete x.interrupted; void putTracking(x); toast('Puedes continuarla desde Comentarios › Seguimiento') }} />
      ) })}
    </div>
  )
}
