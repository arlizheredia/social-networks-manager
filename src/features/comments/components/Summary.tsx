import { useMemo, useState } from 'react'
import { Card, Chip, Icon } from '@/components/ui'
import { ColumnChart, DataTable, DivergingChart, Legend, RankBars, SegmentedBar, ViewToggle } from '@/components/charts/Charts'
import { fmtNum } from '@/lib/util'
import { activity, computeStats } from '../analysis'
import { PLATFORMS } from '../text'
import { ImpactSection } from './ImpactSection'
import type { Comment, Platform } from '../types'

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-outline-2 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-text-2"><Icon name={icon} className="!text-[18px]" />{label}</div>
      <div className="mt-1 font-display text-[28px] leading-9 text-text">{value}</div>
      {sub && <div className="text-xs text-text-2">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, sub, children, className, badge, table }: { title: string; sub?: string; children: React.ReactNode; className?: string; badge?: React.ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Card className={className}>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><h3 className="text-base text-text">{title}</h3>{sub && <p className="text-xs text-text-2">{sub}</p>}</div>
        {!asTable && badge}
        {table && <ViewToggle table={asTable} onChange={setAsTable} />}
      </div>
      {asTable && table ? <DataTable inline head={table.head} rows={table.rows} /> : children}
    </Card>
  )
}

/** Resumen del análisis: indicadores, tendencias y gráficos estadísticos. */
export function Summary({ list, platform, onSearch }: { list: Comment[]; platform: Platform; onSearch: (q: string) => void }) {
  const st = useMemo(() => computeStats(list), [list])
  const act = useMemo(() => activity(list), [list])
  const [cum, setCum] = useState(false)
  const T = Math.max(1, st.total)
  const posts = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    list.forEach((c) => { const k = c._ref?.postId; if (!k) return; const e = m.get(k) || { label: c._post || k, n: 0 }; e.n++; m.set(k, e) })
    return [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  }, [list])

  // Serie de actividad: por periodo (con media móvil) o acumulada
  let run = 0
  const series = act.buckets.map((b) => {
    run += b.n
    return { label: b.label, value: cum ? run : b.n, line: cum ? undefined : +b.avg.toFixed(2), extra: [{ label: 'positivos', value: fmtNum(b.pos) }, { label: 'negativos', value: fmtNum(b.neg) }] }
  })
  const trendTxt = act.trend
    ? act.trend.dir === 'up' ? `Tendencia al alza: +${act.trend.pct} % al final del periodo frente al inicio.`
      : act.trend.dir === 'down' ? `Tendencia a la baja: ${act.trend.pct} % al final del periodo frente al inicio.`
        : 'Actividad estable a lo largo del periodo.'
    : ''
  const hasHours = act.byHour.some(Boolean)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon="forum" label="Comentarios revisados" value={fmtNum(st.total)} sub={`${fmtNum(st.comments)} ${st.comments === 1 ? 'comentario' : 'comentarios'} · ${fmtNum(st.replies)} ${st.replies === 1 ? 'respuesta' : 'respuestas'}`} />
        <Kpi icon="group" label="Personas que comentan" value={fmtNum(st.uniqueAuthors)} sub={st.uniqueAuthors ? `${(st.total / st.uniqueAuthors).toLocaleString('es', { maximumFractionDigits: 1 })} ${st.total === st.uniqueAuthors ? 'comentario' : 'comentarios'} por persona` : undefined} />
        <Kpi icon="favorite" label={PLATFORMS[platform]?.reactLabel ?? 'Reacciones'} value={fmtNum(st.reacts)} sub={`${(st.total ? st.reacts / st.total : 0).toLocaleString('es', { maximumFractionDigits: 1 })} de media por comentario`} />
        <Kpi icon="help" label="Preguntas" value={fmtNum(st.q)} sub={`${pct(st.q, st.total)} % de los comentarios`} />
      </div>

      {act.buckets.length > 0 && (
        <ChartCard table={{ head: ['Periodo', 'Comentarios', 'Positivos', 'Negativos'], rows: act.buckets.map((b) => [b.label, b.n, b.pos, b.neg]) }}
          title={`Actividad por ${act.per}`}
          sub={[act.peak && act.peak.n ? `Pico: ${act.peak.label} con ${fmtNum(act.peak.n)} ${act.peak.n === 1 ? 'comentario' : 'comentarios'}.` : '', trendTxt].filter(Boolean).join(' ')}
          badge={<div className="flex flex-wrap items-center gap-2">
            {act.approx && <span className="rounded-md bg-warn-container px-1.5 py-0.5 text-[11px] text-warn" title="Algunas fechas se calculan a partir de tiempos relativos («hace 2 h»)">≈ fechas aproximadas</span>}
            <Chip selected={!cum} onClick={() => setCum(false)}>Por {act.per}</Chip>
            <Chip selected={cum} onClick={() => setCum(true)}>Acumulado</Chip>
          </div>}
        >
          <ColumnChart data={series} valueLabel={cum ? 'comentarios acumulados' : 'comentarios'} lineLabel={cum ? undefined : 'media móvil'} height={220} />
          {!cum && <div className="mt-2"><Legend items={[{ label: 'Comentarios', color: 'var(--viz-1)' }, { label: 'Tendencia (media móvil)', color: 'var(--viz-ink-2)', line: true }]} /></div>}
        </ChartCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard table={{ head: ['Sentimiento', 'Comentarios', '%'], rows: [['Positivos', st.pos, `${pct(st.pos, T)} %`], ['Neutrales', st.neu, `${pct(st.neu, T)} %`], ['Negativos', st.neg, `${pct(st.neg, T)} %`]] }} title="Sentimiento estimado" sub="Orientativo: se estima con un diccionario de palabras y emojis. Puedes corregir cada comentario.">
          <SegmentedBar parts={[
            { label: 'Positivos', value: st.pos, color: 'var(--viz-pos)', ink: 'var(--viz-on-fill)' },
            { label: 'Neutrales', value: st.neu, color: 'var(--viz-neu)', ink: 'var(--viz-on-neu)' },
            { label: 'Negativos', value: st.neg, color: 'var(--viz-neg)', ink: 'var(--viz-on-fill)' },
          ]} />
          <div className="mt-3"><Legend items={[{ label: `Positivos · ${fmtNum(st.pos)}`, color: 'var(--viz-pos)' }, { label: `Neutrales · ${fmtNum(st.neu)}`, color: 'var(--viz-neu)' }, { label: `Negativos · ${fmtNum(st.neg)}`, color: 'var(--viz-neg)' }]} /></div>
          <p className="mt-3 text-sm text-text-2">
            {st.pos > st.neg * 2 ? 'La conversación es mayoritariamente favorable.' : st.neg > st.pos ? 'Predominan los comentarios negativos.' : 'Positivos y negativos están equilibrados.'}{' '}
            Índice neto: <b className="font-medium text-text">{pct(st.pos, T) - pct(st.neg, T) > 0 ? '+' : ''}{pct(st.pos, T) - pct(st.neg, T)}</b> (positivos menos negativos, sobre 100).
          </p>
        </ChartCard>

        {act.buckets.length > 1 ? (
          <ChartCard table={{ head: ['Periodo', 'Positivos', 'Neutrales', 'Negativos'], rows: act.buckets.map((b) => [b.label, b.pos, b.neu, b.neg]) }} title={`Sentimiento por ${act.per}`} sub="Positivos hacia arriba y negativos hacia abajo: muestra cuándo crecen las críticas.">
            <DivergingChart data={act.buckets.map((b) => ({ label: b.label, pos: b.pos, neg: b.neg, neu: b.neu }))} />
            <div className="mt-2"><Legend items={[{ label: 'Positivos', color: 'var(--viz-pos)' }, { label: 'Negativos', color: 'var(--viz-neg)' }]} /></div>
          </ChartCard>
        ) : (
          <ChartCard title="Autores más activos" sub="Pulsa un nombre para ver sus comentarios.">
            <RankBars unit="comentarios" rows={st.authors.slice(0, 8).map((a) => ({ key: a.name, label: a.name, value: a.count }))} onClick={(k) => onSearch('@' + k)} />
          </ChartCard>
        )}
      </div>

      {/* Primero los positivos y luego los negativos de mayor impacto, con quién más comenta de cada tipo */}
      <ImpactSection list={list} sent="positivo" onPerson={(n) => onSearch('@' + n)} />
      <ImpactSection list={list} sent="negativo" onPerson={(n) => onSearch('@' + n)} />

      {(hasHours || act.byWeekday.some(Boolean)) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {hasHours && (
            <ChartCard table={{ head: ['Hora', 'Comentarios'], rows: act.byHour.map((n, h) => [`${h}:00`, n]) }} title="Actividad por hora del día" sub={(() => { const h = act.byHour.indexOf(Math.max(...act.byHour)); return `Hora con más comentarios: ${h}:00 – ${h + 1}:00.` })()}>
              <ColumnChart data={act.byHour.map((n, h) => ({ label: `${h} h`, value: n }))} valueLabel="comentarios" height={180} />
            </ChartCard>
          )}
          {act.byWeekday.some(Boolean) && (
            <ChartCard table={{ head: ['Día', 'Comentarios'], rows: act.byWeekday.map((n, d) => [DAYS[d], n]) }} title="Actividad por día de la semana" sub={`Día con más comentarios: ${DAYS[act.byWeekday.indexOf(Math.max(...act.byWeekday))].toLowerCase()}.`}>
              <ColumnChart data={act.byWeekday.map((n, d) => ({ label: DAYS[d].slice(0, 3), value: n }))} valueLabel="comentarios" height={180} />
            </ChartCard>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {act.buckets.length > 1 && (
          <ChartCard title="Autores más activos" sub="Pulsa un nombre para ver sus comentarios.">
            <RankBars unit="comentarios" rows={st.authors.slice(0, 8).map((a) => ({ key: a.name, label: a.name, value: a.count }))} onClick={(k) => onSearch('@' + k)} />
          </ChartCard>
        )}
        <ChartCard title="Palabras más frecuentes">
          <RankBars unit="veces" rows={st.words.slice(0, 10).map(([w, n]) => ({ key: w, label: w, value: n }))} />
          {st.words.length > 10 && <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-text-2">Otras: {st.words.slice(10, 26).map(([w, n]) => <span key={w} className="rounded-md bg-surface-2 px-1.5">{w} {n}</span>)}</div>}
        </ChartCard>
        {posts.length > 1 && (
          <ChartCard title="Comentarios por publicación">
            <RankBars unit="comentarios" rows={posts.map(([k, p]) => ({ key: k, label: p.label, value: p.n }))} />
          </ChartCard>
        )}
      </div>

      {(st.emojis.length > 0 || st.hashtags.length > 0 || st.mentions.length > 0) && (
        <Card>
          {st.emojis.length > 0 && <><h3 className="mb-2 text-base">Emojis más usados</h3><div className="mb-4 flex flex-wrap gap-3 text-xl">{st.emojis.slice(0, 14).map(([e, n]) => <span key={e} title={`${n} veces`}>{e}<sub className="ml-0.5 text-xs text-text-2">{n}</sub></span>)}</div></>}
          <div className="grid gap-4 sm:grid-cols-2">
            {st.hashtags.length > 0 && <div><h3 className="mb-2 text-base">Hashtags</h3><div className="flex flex-wrap gap-1.5">{st.hashtags.map(([w, n]) => <span key={w} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">{w} <b className="font-medium text-text-2">{n}</b></span>)}</div></div>}
            {st.mentions.length > 0 && <div><h3 className="mb-2 text-base">Menciones</h3><div className="flex flex-wrap gap-1.5">{st.mentions.map(([w, n]) => <span key={w} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">@{w} <b className="font-medium text-text-2">{n}</b></span>)}</div></div>}
          </div>
        </Card>
      )}
    </div>
  )
}
