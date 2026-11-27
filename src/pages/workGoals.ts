/** Metas de ritmo de trabajo: cada cuántos días debe hacerse cada tarea y cómo va su cumplimiento. */
export interface DayAct { shares: number; extractions: number; reports: number }

export interface Goal { key: keyof DayAct; label: string; rule: string; icon: string; every: number; to: string }
export const GOALS: Goal[] = [
  { key: 'shares', label: 'Publicación en grupos', rule: 'Al menos una cada 2 días', icon: 'send', every: 2, to: '/publicar' },
  { key: 'extractions', label: 'Seguimiento de comentarios', rule: 'Al menos uno cada 2 días', icon: 'forum', every: 2, to: '/comentarios' },
  { key: 'reports', label: 'Análisis de la competencia', rule: 'Al menos uno al mes', icon: 'radar', every: 30, to: '/competencia' },
]

const ymdL = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export interface GoalStatus {
  /** Días desde la última vez (0 = hoy); null si nunca se hizo. */
  since: number | null
  /** Días que quedan para cumplir (0 = toca hoy; negativo = atrasado). */
  left: number
  state: 'ok' | 'today' | 'late'
  /** Fecha límite para la próxima vez. */
  due: Date
  /** Cumplimiento: días cubiertos de los últimos 30 (metas cortas) o meses con actividad de los últimos 6 (metas mensuales). */
  done: number
  of: number
  unit: 'días' | 'meses'
}

export function goalStatus(byDay: Map<string, DayAct>, g: Goal, now = new Date()): GoalStatus {
  const today = new Date(now); today.setHours(12, 0, 0, 0)
  const has = (d: Date) => (byDay.get(ymdL(d))?.[g.key] || 0) > 0
  let since: number | null = null
  for (let i = 0; i <= 730; i++) if (has(addDays(today, -i))) { since = i; break }
  const left = since == null ? -1 : g.every - since
  const state = left > 0 ? 'ok' : left === 0 ? 'today' : 'late'
  const due = since == null ? today : addDays(today, left)
  if (g.every >= 28) {
    // meses naturales (incluido el actual) con al menos una vez
    let done = 0
    for (let m = 0; m < 6; m++) {
      const y = today.getFullYear(), mo = today.getMonth() - m
      const first = new Date(y, mo, 1, 12), last = new Date(y, mo + 1, 0, 12)
      for (let d = new Date(first); d <= last && d <= today; d = addDays(d, 1)) if (has(d)) { done++; break }
    }
    return { since, left, state, due, done, of: 6, unit: 'meses' }
  }
  // un día está «cubierto» si la tarea se hizo ese día o en los (cada − 1) días anteriores
  let done = 0
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i)
    for (let k = 0; k < g.every; k++) if (has(addDays(d, -k))) { done++; break }
  }
  return { since, left, state, due, done, of: 30, unit: 'días' }
}
