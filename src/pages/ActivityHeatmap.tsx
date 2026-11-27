import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHead, Chip, Icon } from '@/components/ui'
import { DataTable } from '@/components/charts/Charts'
import { cn } from '@/lib/cn'
import { fmtNum } from '@/lib/util'

import { GOALS, goalStatus, type DayAct, type Goal } from './workGoals'
export type { DayAct }
const total = (d?: DayAct) => (d ? d.shares + d.extractions + d.reports : 0)

const ymdL = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WD_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']

/* Escala secuencial azul (un solo tono): 0 = sin actividad (gris de la rejilla), 1–4 de menos a más.
   En oscuro el orden se invierte para que «más» destaque más sobre el fondo oscuro. */
const LEVEL = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

/** Umbrales a partir de los días activos (cuartiles), para que la escala se adapte al volumen de trabajo. */
function thresholds(vals: number[]) {
  const v = vals.filter((x) => x > 0).sort((a, b) => a - b)
  if (!v.length) return [1, 2, 3]
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]
  const t = [q(0.25), q(0.5), q(0.75)]
  for (let i = 1; i < 3; i++) if (t[i] <= t[i - 1]) t[i] = t[i - 1] + 1
  return t
}
const levelOf = (n: number, t: number[]) => (n <= 0 ? 0 : n <= t[0] ? 1 : n <= t[1] ? 2 : n <= t[2] ? 3 : 4)

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Mapa de calor de la actividad diaria: semanas en columnas, días de la semana en filas. */
export function ActivityHeatmap({ byDay, className }: { byDay: Map<string, DayAct>; className?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<{ x: number; y: number; d: string } | null>(null)
  const [table, setTable] = useState(false)
  // número de semanas según el ancho (celdas de ~20 px)
  const weeks = Math.max(10, Math.min(53, Math.floor((w - 24) / 18) || 0))

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const dow = (today.getDay() + 6) % 7 // 0 = lunes
  const start = new Date(today); start.setDate(start.getDate() - dow - (weeks - 1) * 7)
  const days: { d: string; date: Date; future: boolean }[] = []
  for (let i = 0; i < weeks * 7; i++) { const x = new Date(start); x.setDate(start.getDate() + i); days.push({ d: ymdL(x), date: x, future: x > today }) }
  const past = days.filter((x) => !x.future)
  const vals = past.map((x) => total(byDay.get(x.d)))
  const t = thresholds(vals)

  // Ritmo: días activos, rachas, promedio y día de la semana más activo
  const active = vals.filter((v) => v > 0).length
  let cur = 0; for (let i = vals.length - 1; i >= 0 && vals[i] > 0; i--) cur++
  if (!cur && vals.length > 1 && vals[vals.length - 1] === 0) { for (let i = vals.length - 2; i >= 0 && vals[i] > 0; i--) cur++ } // hoy aún sin actividad: cuenta la racha hasta ayer
  let best = 0, run = 0; vals.forEach((v) => { run = v > 0 ? run + 1 : 0; best = Math.max(best, run) })
  const sum = vals.reduce((s, v) => s + v, 0)
  const byWd = Array(7).fill(0); past.forEach((x, i) => { byWd[(x.date.getDay() + 6) % 7] += vals[i] })
  const topWd = sum ? byWd.indexOf(Math.max(...byWd)) : -1
  const last7 = vals.slice(-7).filter((v) => v > 0).length

  // Meses encima de la primera semana en que empiezan
  const months: { col: number; label: string }[] = []
  for (let c = 0; c < weeks; c++) {
    const first = days[c * 7].date, prev = c ? days[(c - 1) * 7].date : null
    if (!prev || first.getMonth() !== prev.getMonth()) months.push({ col: c, label: first.toLocaleDateString('es', { month: 'short' }).replace('.', '') })
  }
  // si el primer mes apenas asoma, su etiqueta chocaría con la del siguiente
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift()
  const cell = w ? Math.min(16, (w - 24 - (weeks - 1) * 3) / weeks) : 0
  const tipDay = tip ? byDay.get(tip.d) : undefined

  return (
    <Card className={className}>
      <CardHead title="Ritmo de trabajo" sub="Metas de trabajo y actividad de cada día"
        actions={<Chip selected={table} onClick={() => setTable(!table)}>{table ? 'Ver gráfico' : 'Ver tabla'}</Chip>} />
      <div className="mb-3 grid gap-2 md:grid-cols-3">
        {GOALS.map((g) => <GoalCard key={g.key} g={g} byDay={byDay} />)}
      </div>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-2">
        <span>Días activos: <b className="text-text tabular-nums">{active}</b> de {past.length} ({past.length ? Math.round((active / past.length) * 100) : 0} %) · {last7} de los últimos 7</span>
        <span>Racha: <b className="text-text">{dayTxt(cur)}</b> (mejor: {dayTxt(best)})</span>
        <span>Promedio por día activo: <b className="text-text tabular-nums">{active ? fmtNum(Math.round((sum / active) * 10) / 10) : '0'}</b> acciones</span>
        <span>Día más activo: <b className="text-text">{topWd >= 0 ? WD_LONG[topWd] : '—'}</b></span>
      </div>
      <div ref={ref} className="relative min-w-0" onMouseLeave={() => setTip(null)}>
        {table ? (
          <DataTable head={['Día', 'Grupos', 'Extracciones', 'Informes', 'Total']}
            rows={past.filter((_, i) => vals[i] > 0).reverse().map((x) => { const a = byDay.get(x.d)!; return [x.date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }), a.shares, a.extractions, a.reports, total(a)] })} />
        ) : w > 0 && (
          <>
            <div className="mb-1 flex text-[11px] text-text-2" style={{ paddingLeft: 24 }}>
              <div className="relative h-4 w-full">{months.map((m) => <span key={m.col} className="absolute" style={{ left: m.col * (cell + 3) }}>{m.label}</span>)}</div>
            </div>
            <div className="flex gap-1">
              <div className="grid w-5 shrink-0 text-[11px] text-text-2" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: 3 }}>
                {WD.map((d, i) => <span key={d} className="leading-none" style={{ alignSelf: 'center', visibility: i % 2 ? 'hidden' : 'visible' }}>{d}</span>)}
              </div>
              <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoColumns: `${cell}px`, gap: 3 }} role="img"
                aria-label={`Actividad diaria de las últimas ${weeks} semanas: ${active} días con actividad`}>
                {days.map((x, i) => {
                  const n = total(byDay.get(x.d))
                  return (
                    <span key={x.d} className={cn('rounded-[4px]', x.d === ymdL(today) && 'ring-2 ring-[var(--viz-ink-2)] ring-offset-1 ring-offset-[var(--viz-surface)]')}
                      style={{ background: x.future ? 'transparent' : LEVEL[levelOf(n, t)] }}
                      onMouseEnter={(e) => { if (x.future) return; const r = (e.target as HTMLElement).getBoundingClientRect(), p = ref.current!.getBoundingClientRect(); setTip({ x: r.left - p.left + r.width / 2, y: r.top - p.top, d: x.d }) }}
                      data-i={i} />
                  )
                })}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-text-2">
              <span className="mr-1">Menos</span>{LEVEL.map((c, i) => <span key={i} className="size-3 rounded-[3px]" style={{ background: c }} />)}<span className="ml-1">Más</span>
            </div>
            {tip && (
              <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-surface-3 px-3 py-2 text-xs shadow-3 ring-1 ring-outline-2" style={{ left: tip.x, top: tip.y - 6 }}>
                <div className="mb-1 font-medium whitespace-nowrap">{new Date(tip.d + 'T12:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                {total(tipDay) ? (
                  <div className="space-y-0.5 whitespace-nowrap tabular-nums">
                    {!!tipDay!.shares && <div><b>{tipDay!.shares}</b> {tipDay!.shares === 1 ? 'grupo' : 'grupos'} con la publicación</div>}
                    {!!tipDay!.extractions && <div><b>{tipDay!.extractions}</b> {tipDay!.extractions === 1 ? 'extracción' : 'extracciones'} de comentarios</div>}
                    {!!tipDay!.reports && <div><b>{tipDay!.reports}</b> {tipDay!.reports === 1 ? 'informe' : 'informes'} de la competencia</div>}
                  </div>
                ) : <div className="text-text-2">Sin actividad</div>}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}


const dayTxt = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
/** Meta de ritmo: estado (al día, toca hoy, atrasado), última vez, próxima fecha límite y cumplimiento. */
function GoalCard({ g, byDay }: { g: Goal; byDay: Map<string, DayAct> }) {
  const st = goalStatus(byDay, g)
  const [icon, label, cls] = st.state === 'ok' ? ['check_circle', 'Al día', 'bg-success-container text-success']
    : st.state === 'today' ? ['schedule', 'Toca hoy', 'bg-warn-container text-warn']
    : ['error', st.since == null ? 'Sin registro' : `Atrasado ${dayTxt(-st.left)}`, 'bg-error-container text-error']
  const last = st.since == null ? 'Nunca' : st.since === 0 ? 'Hoy' : st.since === 1 ? 'Ayer' : `Hace ${dayTxt(st.since)}`
  const next = st.state === 'ok' ? `Próxima: antes del ${st.due.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Próxima: ahora'
  const pct = Math.round((st.done / st.of) * 100)
  return (
    <div className="min-w-0 rounded-2xl border border-outline-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon name={g.icon} className="!text-[18px] text-primary" />
        <span className="min-w-0 flex-1 text-sm leading-5 font-medium">{g.label}</span>
      </div>
      <div className="my-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium', cls)}><Icon name={icon} className="!text-[14px]" />{label}</span>
        <span className="text-xs text-text-2">{g.rule.replace(/^Al menos /, '')}</span>
      </div>
      <div className="text-xs text-text-2">Última: {last} · {next.replace('Próxima: ', 'próxima: ')}</div>
      <div className="my-1 h-1.5 overflow-hidden rounded-full bg-[var(--heat-0)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Cumplimiento de ${g.label}`}>
        <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-text-2">
        <span>{st.unit === 'meses' ? `${st.done} de ${st.of} meses` : `${st.done} de ${st.of} días (${pct} %)`}</span>
        {st.state !== 'ok' && <Link to={g.to} className="font-medium">Hacerlo ahora</Link>}
      </div>
    </div>
  )
}
