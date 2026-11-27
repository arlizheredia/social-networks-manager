import { Link } from 'react-router-dom'
import { Card, CardHead, Icon } from '@/components/ui'
import { cn } from '@/lib/cn'
import { fmtNum } from '@/lib/util'
import { GOALS, goalStatus, type DayAct, type Goal } from './workGoals'
export type { DayAct }

const total = (d?: DayAct) => (d ? d.shares + d.extractions + d.reports : 0)
const ymdL = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const WD_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
const dayTxt = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const PERIOD = 90

/** Ritmo de trabajo: una fila por meta y, debajo, los indicadores de los últimos 90 días. */
export function WorkRhythm({ byDay, className }: { byDay: Map<string, DayAct>; className?: string }) {
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const days = Array.from({ length: PERIOD }, (_, k) => { const d = new Date(today); d.setDate(d.getDate() - (PERIOD - 1 - k)); return d })
  const vals = days.map((d) => total(byDay.get(ymdL(d))))

  const active = vals.filter((v) => v > 0).length
  let cur = 0; for (let i = vals.length - 1; i >= 0 && vals[i] > 0; i--) cur++
  if (!cur && vals[vals.length - 1] === 0) for (let i = vals.length - 2; i >= 0 && vals[i] > 0; i--) cur++ // hoy aún sin actividad: la racha cuenta hasta ayer
  let best = 0, run = 0; vals.forEach((v) => { run = v > 0 ? run + 1 : 0; best = Math.max(best, run) })
  const sum = vals.reduce((s, v) => s + v, 0)
  const byWd = Array(7).fill(0); days.forEach((d, i) => { byWd[(d.getDay() + 6) % 7] += vals[i] })
  const topWd = sum ? byWd.indexOf(Math.max(...byWd)) : -1
  const last7 = vals.slice(-7).filter((v) => v > 0).length

  return (
    <Card className={className}>
      <CardHead title="Ritmo de trabajo" sub="Metas de trabajo y cómo se van cumpliendo" />
      <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2">
        {GOALS.map((g) => <GoalRow key={g.key} g={g} byDay={byDay} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-2">
        <span>Últimos {PERIOD} días · días activos: <b className="text-text tabular-nums">{active}</b> ({Math.round((active / PERIOD) * 100)} %) · {last7} de los últimos 7</span>
        <span>Racha: <b className="text-text">{dayTxt(cur)}</b> (mejor: {dayTxt(best)})</span>
        <span>Promedio por día activo: <b className="text-text tabular-nums">{active ? fmtNum(Math.round((sum / active) * 10) / 10) : '0'}</b> acciones</span>
        <span>Día más activo: <b className="text-text">{topWd >= 0 ? WD_LONG[topWd] : '—'}</b></span>
      </div>
    </Card>
  )
}

/** Una meta en tres líneas: nombre y estado · regla, última y próxima vez · barra de cumplimiento y acción. */
function GoalRow({ g, byDay }: { g: Goal; byDay: Map<string, DayAct> }) {
  const st = goalStatus(byDay, g)
  const [icon, label, cls] = st.state === 'ok' ? ['check_circle', 'Al día', 'bg-success-container text-success']
    : st.state === 'today' ? ['schedule', 'Toca hoy', 'bg-warn-container text-warn']
    : ['error', st.since == null ? 'Sin registro' : `Atrasado ${dayTxt(-st.left)}`, 'bg-error-container text-error']
  const last = st.since == null ? 'nunca' : st.since === 0 ? 'hoy' : st.since === 1 ? 'ayer' : `hace ${dayTxt(st.since)}`
  const next = st.state === 'ok' ? `antes del ${st.due.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'ahora'
  const pct = Math.round((st.done / st.of) * 100)
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon name={g.icon} className="!text-[18px] text-primary" />
        <span className="min-w-0 flex-1 text-sm font-medium">{g.label}</span>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium whitespace-nowrap', cls, st.state !== 'ok' && 'anim-attn')}><Icon name={icon} className="!text-[14px]" />{label}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 pl-[26px] text-xs text-text-2">
        <span>{g.rule}</span><span>Última: <b className="font-medium text-text">{last}</b></span><span>Próxima: <b className="font-medium text-text">{next}</b></span>
      </div>
      <div className="mt-1.5 flex items-center gap-3 pl-[26px]">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--heat-0)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Cumplimiento de ${g.label}`}>
          <div className="anim-fill h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs text-text-2 tabular-nums">{st.unit === 'meses' ? `${st.done} de ${st.of} meses` : `${st.done} de ${st.of} días (${pct} %)`}</span>
        {st.state !== 'ok' && <Link to={g.to} className="shrink-0 text-xs font-medium">Hacerlo ahora</Link>}
      </div>
    </div>
  )
}
