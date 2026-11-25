import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Icon, IconButton, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText, download } from '@/lib/util'
import { beep } from '@/lib/timers'
import { initials, parseFbUrl } from '../fb'
import { useMedia, copyImage } from '../media'
import { usePublisher } from '../store'
import { cleanErr, failedItems, gate, hhmm, reasonOf } from '../logic'
import { clearForm, closeRun, confirmTestOk, continueAuto, jumpTo, mark, panicStop, retryFailed, retryNow, runText, stepOpen, stopAfterCurrent, useRun, type RunState } from '../run'
import type { HistoryEntry } from '../types'

const STEP_P: [RegExp, number][] = [[/Comprobando/, 0.03], [/Preparando/, 0.05], [/Abriendo el grupo/, 0.1], [/Esperando a que cargue/, 0.2], [/cuadro de publicación/, 0.35], [/Escribiendo/, 0.5], [/Adjuntando/, 0.62], [/vista previa/, 0.72], [/«Publicar» esté/, 0.8], [/Publicando/, 0.9]]
function autoPct(R: RunState, e: HistoryEntry) {
  const n = e.items.length || 1, done = e.items.filter((i) => i.status !== 'pending').length
  let f = 0
  if (R.autoRunning && !R.stop && R.phase === 'posting') for (const [rx, v] of STEP_P) if (rx.test(R.step || '')) f = v
  return Math.min(100, Math.round(((done + f) / n) * 100))
}
const fmtLeft = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.ceil((sec % 3600) / 60)} min` : sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec))

function useNow(ms = 1000) { const [n, set] = useState(Date.now()); useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t) }, [ms]); return n }

function Cooldown({ R, e }: { R: RunState; e: HistoryEntry }) {
  const state = usePublisher()
  const now = useNow()
  const G = gate(state)
  const [done, setDone] = useState(false)
  useEffect(() => { if (!G.ok && G.until - now <= 0 && !done) { setDone(true); if (state.settings.sound) beep() } }, [G, now, done, state.settings.sound])
  if (G.ok) return null
  const left = Math.max(0, Math.ceil((G.until - now) / 1000)), total = G.total || Math.max(1, (G.until - (now - 1000)) / 1000)
  const C = 2 * Math.PI * 62
  const MSG = { pause: ['Pausa de seguridad', 'Espaciar las publicaciones evita que Facebook las considere spam. La pausa no se puede saltar.'], day: [`Límite diario alcanzado (${state.settings.dayCap})`, 'Has llegado al máximo de grupos en 24 horas. Tu progreso queda guardado y podrás reanudar desde el Historial.'], lock: ['Publicación bloqueada por seguridad', 'Facebook mostró un aviso. Deja descansar la cuenta antes de continuar.'] }[G.reason]
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="relative size-36">
        <svg viewBox="0 0 140 140" className="size-36 -rotate-90"><circle cx="70" cy="70" r="62" className="fill-none stroke-primary-container" strokeWidth="8" /><circle cx="70" cy="70" r="62" className="fill-none stroke-primary transition-[stroke-dashoffset]" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / total))} /></svg>
        <b className="absolute inset-0 grid place-items-center font-display text-3xl tabular-nums">{fmtLeft(left)}</b>
      </div>
      <h3 className="text-xl">{MSG[0]}</h3>
      <p className="max-w-md text-text-2">{MSG[1]}</p>
      {G.reason !== 'pause' && <p>Podrás continuar: <b>{hhmm(G.until)}</b></p>}
      <p>Siguiente: <b>{e.items[R.idx]?.name}</b></p>
      <div className="flex flex-wrap justify-center gap-2">
        {G.reason !== 'pause' && <Button variant="outlined" icon="schedule" onClick={() => closeRun(true)}>Continuar más tarde</Button>}
        <Button variant="text" className="!text-error" icon="report" onClick={panicStop}>Facebook me mostró un aviso</Button>
      </div>
    </div>
  )
}

function Assisted({ R, e }: { R: RunState; e: HistoryEntry }) {
  const state = usePublisher()
  const media = useMedia((s) => s.items)
  const it = e.items[R.idx]
  const mode = state.settings.mode
  const txt = runText(e, it)
  const approval = !!state.groups.find((g) => g.id === it.gid)?.approval
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test((ev.target as HTMLElement).tagName)) return
      if (document.querySelectorAll('dialog[open]').length > 1 || !gate().ok) return
      const k = ev.key.toLowerCase()
      if (k === 'enter') { ev.preventDefault(); stepOpen() }
      else if (k === 'p') { ev.preventDefault(); mark('done') }
      else if (k === 'a') { ev.preventDefault(); mark('done', 'awaiting') }
      else if (k === 's') { ev.preventDefault(); mark('skipped') }
      else if (k === 'c') { ev.preventDefault(); copyText(txt).then((ok) => toast(ok ? 'Texto copiado' : 'No se pudo copiar')) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [txt])
  const Step = ({ n, ok, title, children }: { n: number; ok?: boolean; title: string; children: React.ReactNode }) => (
    <div className="flex gap-4">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium', ok ? 'bg-success-container text-success' : 'bg-primary-container text-on-primary-container')}>{ok ? '✓' : n}</span>
      <div className="min-w-0 flex-1 pb-5"><h4 className="mb-1 text-base">{title}</h4>{children}</div>
    </div>
  )
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-container font-medium text-on-primary-container">{initials(it.name)}</div>
        <div className="min-w-0"><div className="text-xs text-text-2">Grupo {R.idx + 1} de {e.items.length}</div><h3 className="truncate text-xl">{it.name}</h3><a className="text-xs" href={it.url} target="_blank" rel="noopener">{it.url.replace('https://www.', '')}</a></div>
      </div>
      {it.notes && <div className="mb-4 flex gap-2 rounded-xl bg-warn-container p-3 text-warn"><Icon name="gavel" /><div><b>Normas del grupo:</b> {it.notes}</div></div>}
      <Step n={1} ok={R.opened} title={mode === 'share' && e.url ? 'Copiar texto y abrir «Compartir»' : 'Copiar texto y abrir el grupo'}>
        <p className="mb-2 text-text-2">{mode === 'share' && e.url ? `Se abrirá el diálogo de Facebook. Elige «Compartir en un grupo» y busca «${it.name}».` : mode === 'side' ? 'El grupo se abrirá en una ventana al lado de esta.' : 'El grupo se abrirá en una pestaña nueva.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={R.opened ? 'tonal' : 'filled'} icon={R.opened ? 'refresh' : 'open_in_new'} onClick={stepOpen}>{R.opened ? 'Volver a abrir' : 'Copiar y abrir'} <kbd>Enter</kbd></Button>
          <Button variant="text" icon="content_copy" onClick={async () => toast((await copyText(txt)) ? 'Texto copiado' : 'No se pudo copiar')}>Copiar texto <kbd>C</kbd></Button>
        </div>
      </Step>
      <Step n={2} title="Pegar y publicar en Facebook">
        <p className="text-text-2">Haz clic en <b>«Escribe algo…»</b>, pega con <kbd>Ctrl</kbd>+<kbd>V</kbd>{e.url && mode !== 'share' ? ' y espera a que aparezca la vista previa del enlace' : ''}. Después pulsa <b>Publicar</b>.</p>
        <details className="mt-2"><summary className="cursor-pointer text-sm text-primary">Ver el texto que se pegará</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{txt || '(sin texto)'}</pre></details>
        {media.some((m) => m.type !== 'audio') && (
          <div className="mt-2 flex flex-wrap gap-2">
            {media.filter((m) => m.type === 'image').map((m, i) => <Button key={m.id} variant="outlined" size="sm" icon="image" onClick={() => copyImage(m).then(() => toast('Imagen copiada. Pégala con Ctrl+V'), () => toast('No se pudo copiar la imagen'))}>Copiar imagen {i + 1}</Button>)}
            {media.filter((m) => m.type === 'video').map((m) => <Button key={m.id} variant="outlined" size="sm" icon="download" onClick={() => download(m.name, m.file)}>{m.name.slice(0, 24)}</Button>)}
          </div>
        )}
        {e.mediaCount > 0 && !media.length && <p className="mt-2 text-xs text-warn">Esta publicación tenía {e.mediaCount} archivo(s) que ya no están en el formulario.</p>}
      </Step>
      <Step n={3} title="Confirmar">
        <p className="mb-2 text-text-2">Marca el resultado para pasar al siguiente grupo. Si Facebook dice que tu publicación <b>está pendiente</b> de aprobación, elige «Enviado a aprobación».</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={approval ? 'outlined' : 'filled'} icon="check" onClick={() => mark('done')}>Publicado <kbd>P</kbd></Button>
          <Button variant={approval ? 'filled' : 'tonal'} icon="pending" onClick={() => mark('done', 'awaiting')}>Enviado a aprobación <kbd>A</kbd></Button>
          <Button variant="outlined" icon="skip_next" onClick={() => mark('skipped')}>Omitir <kbd>S</kbd></Button>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 text-xs text-error" onClick={panicStop}><Icon name="report" className="!text-[16px]" />¿Facebook te muestra un aviso? Detener y proteger mi cuenta</button>
      </Step>
    </div>
  )
}

function Auto({ R, e }: { R: RunState; e: HistoryEntry }) {
  const p = autoPct(R, e)
  const now = useNow()
  const it = e.items[R.idx]
  const errs = e.items.filter((i) => i.error)
  const pending = e.items.some((i) => i.status === 'pending')
  const G = gate()
  if (!R.autoRunning || R.stop) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className={cn('grid size-16 place-items-center rounded-full', R.testDone ? 'bg-primary-container text-primary' : 'bg-warn-container text-warn')}><Icon name={R.testDone ? 'science' : 'pause_circle'} size={32} /></div>
        <h3 className="text-xl">{R.testDone ? 'Modo prueba completado' : 'Publicación automática detenida'}</h3>
        <p className="max-w-lg text-text-2">{R.stopMsg || 'La has detenido. Tu progreso está guardado.'}</p>
        {!!errs.length && <details className="max-w-lg text-left"><summary className="cursor-pointer text-primary">Ver incidencias</summary><ul className="mt-2 list-disc pl-5 text-sm">{errs.map((i) => <li key={i.gid}><b>{i.name}:</b> {i.error}</li>)}</ul></details>}
        <div className="flex flex-wrap justify-center gap-2">
          {R.testDone ? <Button icon="bolt" onClick={confirmTestOk}>Todo bien: publicar de verdad</Button> : !G.ok && G.reason !== 'pause' ? null : <Button icon="play_arrow" onClick={continueAuto}>Continuar</Button>}
          <Button variant="outlined" onClick={() => closeRun(true)}>{R.testDone || !pending ? 'Cerrar' : 'Continuar más tarde'}</Button>
        </div>
      </div>
    )
  }
  const C = 2 * Math.PI * 34
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-container font-medium text-on-primary-container">{initials(it?.name || '')}</div>
        <div className="min-w-0"><div className="text-xs text-text-2">Grupo {R.idx + 1} de {e.items.length} · {usePublisher.getState().settings.autoTest ? <b>modo prueba</b> : 'publicación automática'}</div><h3 className="truncate text-xl">{it?.name}</h3></div>
      </div>
      {R.retry && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-warn-container p-3 text-warn">
          <Icon name="autorenew" />
          <div className="flex-1"><b>{R.retry.reason}</b><div className="text-xs">Reintento {R.retry.n} de {R.retry.max} en {Math.max(0, Math.ceil((R.retry.until - now) / 1000))} s. Si no se resuelve, se detendrá por completo.</div></div>
          <Button size="sm" variant="tonal" icon="refresh" onClick={retryNow}>Reintentar ahora</Button>
        </div>
      )}
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface-2 p-4 sm:flex-row">
        <div className="relative size-22 shrink-0" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
          <svg viewBox="0 0 80 80" className="size-22 -rotate-90"><circle cx="40" cy="40" r="34" className="fill-none stroke-primary-container" strokeWidth="7" /><circle cx="40" cy="40" r="34" className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} /></svg>
          <b className="absolute inset-0 grid place-items-center font-display text-lg tabular-nums">{p} %</b>
        </div>
        <div className="min-w-0 flex-1">
          <h4 aria-live="polite" className="mb-1 text-base">{R.phase === 'wait' ? 'Pausa de seguridad…' : R.step || 'Preparando…'}</h4>
          <p className="text-xs text-text-2">La extensión trabaja en la ventana de Facebook. No la cierres ni cierres esta pestaña; puedes seguir usando otras aplicaciones.</p>
          {!!R.log.length && <ol className="mt-2 list-decimal pl-5 text-xs text-text-2">{R.log.slice(-5).map((x, i) => <li key={i}>{x}</li>)}</ol>}
        </div>
      </div>
      {!!R.msgs.length && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-text-2">Mensajes de Facebook ({R.msgs.length})</div>
          {R.msgs.slice(0, 5).map((m, i) => <div key={i} className={cn('rounded-xl p-2 text-sm', m.lv === 'err' ? 'bg-error-container text-error' : 'bg-surface-2')}><b>{m.g}</b> · «{m.t}»</div>)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outlined" icon="stop_circle" onClick={stopAfterCurrent}>Detener después de este grupo</Button>
        <Button variant="text" className="!text-error" icon="report" onClick={panicStop}>Facebook me mostró un aviso</Button>
      </div>
    </div>
  )
}

function Summary({ e }: { e: HistoryEntry }) {
  const nav = useNavigate()
  const st = usePublisher((s) => s.settings)
  const draft = usePublisher((s) => s.draft)
  const [asked, setAsked] = useState(false)
  const aw = e.items.filter((i) => i.status === 'done' && i.review === 'awaiting').length
  const d = e.items.filter((i) => i.status === 'done').length - aw
  const s = e.items.filter((i) => i.status === 'skipped').length
  const F = failedItems(e)
  const same = !!(draft.text || draft.url) && draft.text === e.text && (parseFbUrl(draft.url).url || '') === e.url
  useEffect(() => { if (same && st.clearAfter === 'always') clearForm() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Social Networks Manager' }, [])
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className={cn('grid size-16 place-items-center rounded-full', F.length ? 'bg-warn-container text-warn' : 'bg-success-container text-success')}><Icon name={F.length ? 'warning' : 'task_alt'} size={32} /></div>
      <h2 className="text-2xl">{F.length ? 'Publicación terminada con incidencias' : '¡Listo! Se publicó en todos los grupos'}</h2>
      <p className="text-text-2">{F.length ? `Se publicó en ${d + aw} de ${e.items.length} grupos. No se pudo publicar en:` : 'Todo queda registrado en el Historial.'}</p>
      {!!F.length && <div className="w-full max-w-lg space-y-2 text-left">{F.map((i) => <div key={i.gid} className="rounded-xl bg-error-container p-2 text-sm text-error"><b>{i.name}</b> — {reasonOf(i.error)}{reasonOf(i.error) === 'incidencia técnica al publicar' && cleanErr(i.error) ? ` · ${cleanErr(i.error)}` : ''}</div>)}</div>}
      <div className="my-2 flex gap-6">
        <div><div className="text-xs text-text-2">Publicados</div><div className="font-display text-3xl text-success">{d}</div></div>
        {!!aw && <div><div className="text-xs text-text-2">En aprobación</div><div className="font-display text-3xl text-primary">{aw}</div></div>}
        <div><div className="text-xs text-text-2">Omitidos</div><div className="font-display text-3xl">{s}</div></div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {!!F.length && <Button icon="refresh" onClick={async () => { await closeRun(true); retryFailed(e.id) }}>Reintentar {F.length === 1 ? 'el fallido' : `los ${F.length} fallidos`}</Button>}
        <Button variant="outlined" icon="history" onClick={async () => { await closeRun(true); nav('/historial') }}>Ver historial</Button>
        <Button variant={F.length ? 'text' : 'filled'} onClick={() => closeRun(true)}>Cerrar</Button>
      </div>
      {same && st.clearAfter === 'ask' && !asked && (
        <div className="mt-3 flex max-w-lg flex-wrap items-center gap-2 rounded-2xl bg-primary-container p-3 text-left text-on-primary-container">
          <Icon name="note_add" /><span className="flex-1">¿Vaciar el formulario para empezar una nueva publicación?</span>
          <Button size="sm" variant="tonal" onClick={() => { clearForm(); setAsked(true); toast('Formulario vacío') }}>Vaciar</Button>
          <Button size="sm" variant="text" onClick={() => setAsked(true)}>Conservar</Button>
        </div>
      )}
    </div>
  )
}

/** Pantalla de publicación (asistida o automática) a pantalla casi completa. */
export function RunDialog() {
  const R = useRun((s) => s.run)
  const history = usePublisher((s) => s.history)
  const state = usePublisher()
  const e = R ? history.find((h) => h.id === R.entryId) : undefined
  useEffect(() => {
    if (!R || !e) return
    const it = e.items[R.idx]
    document.title = R.auto && R.autoRunning ? `${autoPct(R, e)} % · Publicando · Social Networks Manager` : it ? `▶ ${it.name} · Social Networks Manager` : 'Social Networks Manager'
  }, [R, e])
  if (!R || !e) return null
  const done = e.items.filter((i) => i.status !== 'pending').length
  const finished = R.idx >= e.items.length
  const gated = !finished && !gate(state).ok && !(R.auto && (!R.autoRunning || R.stop))
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-scrim p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={R.auto ? 'Publicación automática' : 'Publicación asistida'}
      onKeyDown={(ev) => { if (ev.key === 'Escape') closeRun() }}>
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-surface shadow-3 sm:rounded-[28px]">
        <div className="flex items-center gap-3 border-b border-outline-2 px-5 py-3">
          <h2 className="text-lg">{R.auto ? 'Publicación automática' : 'Publicación asistida'}</h2>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-container"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${R.auto ? autoPct(R, e) : (done / e.items.length) * 100}%` }} /></div>
          <span className="text-sm whitespace-nowrap text-text-2 tabular-nums">{done} de {e.items.length}</span>
          <IconButton icon="close" label="Cerrar" onClick={() => closeRun()} />
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-outline-2 p-2 md:block">
            {e.items.map((it, i) => (
              <button key={i} onClick={() => jumpTo(i)} className={cn('flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm', i === R.idx ? 'bg-secondary-container text-on-secondary-container' : 'hover:bg-text/8')} title={it.error || ''}>
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[12px]', it.status === 'done' ? 'bg-success text-on-primary' : it.status === 'skipped' ? 'bg-outline text-on-primary' : 'border border-outline')}>{it.status === 'done' ? '✓' : it.status === 'skipped' ? '×' : ''}</span>
                <span className="truncate">{it.name}</span>
                {it.error && <Icon name="error" className="!text-[16px] text-error" />}
              </button>
            ))}
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {finished ? <Summary e={e} /> : gated ? <Cooldown R={R} e={e} /> : R.auto ? <Auto R={R} e={e} /> : <Assisted R={R} e={e} />}
          </main>
        </div>
      </div>
    </div>
  )
}
