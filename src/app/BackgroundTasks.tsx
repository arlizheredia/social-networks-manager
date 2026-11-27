import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { setRunBg, useRun } from '@/features/publisher/run'
import { usePublisher } from '@/features/publisher/store'
import { entryTitle } from '@/features/publisher/logic'
import { autoPct } from '@/features/publisher/components/RunDialog'
import { trackProgress, useTR } from '@/features/comments/tracking'

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
    <button onClick={onOpen} title="Volver a primer plano" className="flex w-full items-center gap-3 rounded-2xl bg-surface-3 px-3 py-2 text-left shadow-3 ring-1 ring-outline-2 transition-colors hover:bg-surface-2 sm:w-80">
      {done ? <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-container text-success"><Icon name="task_alt" /></span> : <Ring pct={pct} spin />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium"><Icon name={icon} className="!text-[16px] text-primary" /><span className="truncate">{title}</span></span>
        <span className="block truncate text-xs text-text-2">{sub}</span>
      </span>
      <Icon name="open_in_full" className="!text-[18px] text-text-2" />
    </button>
  )
}

/** Procesos en segundo plano (publicación en grupos y extracción de comentarios): siguen en curso y se pueden traer
 *  de vuelta a primer plano con un toque. */
export function BackgroundTasks() {
  const R = useRun((s) => s.run)
  const history = usePublisher((s) => s.history)
  const { running, bg, tracks } = useTR()
  const nav = useNavigate()
  const { pathname } = useLocation()

  const e = R ? history.find((h) => h.id === R.entryId) : undefined
  const pubBg = !!(R && e && R.bg)
  const pubDone = !!(R && e && R.idx >= e.items.length)
  const t = running ? tracks.find((x) => x.id === running) : undefined
  const onTracking = pathname === '/comentarios' || pathname === '/comentarios/'
  const trShow = !!t && (bg || !onTracking)

  // Aviso cuando termina una publicación que estaba en segundo plano
  const notified = useRef<string | null>(null)
  useEffect(() => {
    if (pubBg && pubDone && e && notified.current !== e.id) {
      notified.current = e.id
      toast('La publicación en grupos terminó', 'task_alt', { label: 'Ver resumen', onClick: () => setRunBg(false) })
    }
  }, [pubBg, pubDone, e])

  if (!pubBg && !trShow) return null
  let pub = null
  if (pubBg && R && e) {
    const n = e.items.length, d = e.items.filter((i) => i.status !== 'pending').length
    const it = e.items[R.idx]
    const mode = R.auto ? 'Automática' : 'Asistida'
    const sub = pubDone ? `${mode} · terminada · toca para ver el resumen`
      : R.auto ? (R.autoRunning && !R.stop ? `${mode} · ${d} de ${n} · ${R.phase === 'wait' ? 'pausa de seguridad' : it ? it.name : 'preparando'}` : `${mode} · ${d} de ${n} · en pausa`)
      : `${mode} · ${d} de ${n} · esperando tu acción en «${it?.name || ''}»`
    pub = <Task icon="campaign" title={entryTitle(e)} sub={sub} pct={pubDone ? 100 : R.auto ? autoPct(R, e) : Math.round((d / n) * 100)} done={pubDone} onOpen={() => setRunBg(false)} />
  }
  let tr = null
  if (trShow && t) {
    const pr = trackProgress(t)
    const cur = t.postIds.map((id) => t.items[id]).find((i) => i?.status === 'running')
    tr = <Task icon="forum" title={`Extrayendo comentarios · ${t.name}`} sub={`${pr.done} de ${pr.n} publicaciones · ${pr.comments.toLocaleString('es')} comentarios${cur?.phase === 'retry' ? ' · reintentando' : ''}`} pct={pr.pct}
      onOpen={() => { useTR.setState({ bg: false }); nav('/comentarios') }} />
  }
  return (
    <div className="fixed top-[68px] right-3 left-3 z-30 flex flex-col items-end gap-2 sm:left-auto md:right-4" aria-label="Procesos en segundo plano">
      {pub}{tr}
    </div>
  )
}
