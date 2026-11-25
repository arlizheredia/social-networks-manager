/**
 * Gráficos de la app en SVG/HTML, sin librerías. Siguen la guía de visualización:
 * marcas finas (columnas ≤ 24 px con extremo redondeado de 4 px), separación de 2 px, cuadrícula tenue,
 * etiquetas selectivas, tooltip al pasar el ratón o enfocar con el teclado y tabla de datos para cada gráfico.
 * Los colores son variables del tema validadas (--viz-*), con sus valores para claro y oscuro.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

const fmt = (n: number) => n.toLocaleString('es')
/** Marcas redondas para el eje: 0, 5, 10… o 0, 20, 40… */
function niceMax(v: number) {
  if (v <= 4) return Math.max(1, Math.ceil(v))
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
/** Marcas del eje en números enteros (son conteos): 0…max de uno en uno si caben; si no, 0, mitad y máximo. */
const ticks = (max: number) => (max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max])

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/* ---------- Tooltip ---------- */
interface Tip { x: number; y: number; title: string; rows: { key?: string; color?: string; value: string; label: string }[] }
function TooltipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div role="status" className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-xl bg-surface-3 px-3 py-2 text-xs shadow-2" style={{ left: tip.x, top: tip.y - 10 }}>
      <div className="mb-1 font-medium text-text-2">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.color && <span className="h-0.5 w-3 rounded" style={{ background: r.color }} />}
          <b className="font-medium text-text tabular-nums">{r.value}</b>
          <span className="text-text-2">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Tabla de datos del gráfico (accesible y sin depender del color ni del ratón). */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-primary select-none">Ver datos</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-outline-2">
        <table className="w-full tabular-nums">
          <thead className="sticky top-0 bg-surface-2"><tr>{head.map((h) => <th key={h} className="px-2 py-1 text-left font-medium text-text-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-outline-2">{r.map((c, j) => <td key={j} className={cn('px-2 py-1', j && 'text-right')}>{typeof c === 'number' ? fmt(c) : c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
      {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className={i.line ? 'h-0.5 w-4 rounded' : 'size-2.5 rounded-sm'} style={{ background: i.color }} />{i.label}</span>)}
    </div>
  )
}

/* ---------- Columnas en el tiempo, con línea de tendencia (media móvil) ---------- */
export interface Col { label: string; value: number; line?: number; extra?: { label: string; value: string }[] }
export function ColumnChart({ data, height = 200, lineLabel, valueLabel, onSelect }: { data: Col[]; height?: number; lineLabel?: string; valueLabel: string; onSelect?: (i: number) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState(-1)
  const padL = 36, padR = 8, padT = 10, padB = 24
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.value, d.line ?? 0))))
  const iw = w - padL - padR, ih = height - padT - padB
  const band = iw / Math.max(1, data.length), bw = Math.max(2, Math.min(24, band - 2))
  const y = (v: number) => padT + ih - (v / max) * ih
  const x = (i: number) => padL + band * i + band / 2
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))))
  const show = (i: number) => {
    const d = data[i]
    setHover(i)
    setTip({ x: x(i), y: y(Math.max(d.value, d.line ?? 0)), title: d.label, rows: [{ value: fmt(d.value), label: valueLabel }, ...(d.line != null && lineLabel ? [{ value: d.line.toLocaleString('es', { maximumFractionDigits: 1 }), label: lineLabel, color: 'var(--viz-ink-2)' }] : []), ...(d.extra ?? []).map((e) => ({ value: e.value, label: e.label }))] })
  }
  const path = data.some((d) => d.line != null) ? data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.line ?? 0).toFixed(1)}`).join(' ') : ''
  return (
    <div ref={ref} className="relative" onMouseLeave={() => { setTip(null); setHover(-1) }}>
      <svg width={w} height={height} role="img" aria-label={`${valueLabel}: ${data.length} periodos`} className="block overflow-visible">
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t ? 'var(--viz-grid)' : 'var(--viz-axis)'} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--viz-ink-2)] text-[11px] tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = y(0) - y(d.value), r = Math.min(4, h, bw / 2)
          const x0 = x(i) - bw / 2, top = y(d.value)
          return (
            <g key={i}>
              {h > 0 && <path d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${y(0)} Z`} fill="var(--viz-1)" opacity={hover === -1 || hover === i ? 1 : 0.45} />}
              {/* zona de selección más grande que la columna */}
              <rect x={padL + band * i} y={padT} width={band} height={ih} fill="transparent" tabIndex={0} aria-label={`${d.label}: ${d.value} ${valueLabel}`}
                onMouseMove={() => show(i)} onFocus={() => show(i)} onBlur={() => { setTip(null); setHover(-1) }} onClick={() => onSelect?.(i)} className={cn('outline-none', onSelect && 'cursor-pointer')} />
              {i % labelEvery === 0 && <text x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--viz-ink-2)] text-[11px]">{d.label}</text>}
            </g>
          )
        })}
        {path && <path d={path} fill="none" stroke="var(--viz-ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
      </svg>
      <TooltipBox tip={tip} />
    </div>
  )
}

/* ---------- Sentimiento en el tiempo: positivos hacia arriba, negativos hacia abajo ---------- */
export interface Div { label: string; pos: number; neg: number; neu: number }
export function DivergingChart({ data, height = 180 }: { data: Div[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const padL = 36, padR = 8, padT = 8, padB = 22
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.pos, d.neg))))
  const iw = w - padL - padR, ih = height - padT - padB, mid = padT + ih / 2
  const band = iw / Math.max(1, data.length), bw = Math.max(2, Math.min(24, band - 2))
  const h = (v: number) => (v / max) * (ih / 2)
  const x = (i: number) => padL + band * i + band / 2
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))))
  const bar = (cx: number, len: number, up: boolean) => {
    if (len <= 0) return ''
    const r = Math.min(4, len, bw / 2), x0 = cx - bw / 2
    // 1 px de separación respecto al eje a cada lado (2 px entre positivos y negativos)
    return up
      ? `M${x0},${mid - 1} V${mid - 1 - len + r} Q${x0},${mid - 1 - len} ${x0 + r},${mid - 1 - len} H${x0 + bw - r} Q${x0 + bw},${mid - 1 - len} ${x0 + bw},${mid - 1 - len + r} V${mid - 1} Z`
      : `M${x0},${mid + 1} V${mid + 1 + len - r} Q${x0},${mid + 1 + len} ${x0 + r},${mid + 1 + len} H${x0 + bw - r} Q${x0 + bw},${mid + 1 + len} ${x0 + bw},${mid + 1 + len - r} V${mid + 1} Z`
  }
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={height} role="img" aria-label="Comentarios positivos y negativos por periodo" className="block overflow-visible">
        {[max, 0, max].map((t, k) => {
          const yy = k === 0 ? padT : k === 1 ? mid : padT + ih
          return (
            <g key={k}>
              <line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke={k === 1 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
              <text x={padL - 6} y={yy + 4} textAnchor="end" className="fill-[var(--viz-ink-2)] text-[11px] tabular-nums">{k === 1 ? '0' : fmt(t)}</text>
            </g>
          )
        })}
        {data.map((d, i) => (
          <g key={i}>
            <path d={bar(x(i), h(d.pos), true)} fill="var(--viz-pos)" />
            <path d={bar(x(i), h(d.neg), false)} fill="var(--viz-neg)" />
            <rect x={padL + band * i} y={padT} width={band} height={ih} fill="transparent" tabIndex={0} className="outline-none" aria-label={`${d.label}: ${d.pos} positivos, ${d.neg} negativos, ${d.neu} neutrales`}
              onMouseMove={() => setTip({ x: x(i), y: mid - h(d.pos), title: d.label, rows: [{ value: fmt(d.pos), label: 'positivos', color: 'var(--viz-pos)' }, { value: fmt(d.neg), label: 'negativos', color: 'var(--viz-neg)' }, { value: fmt(d.neu), label: 'neutrales' }] })}
              onFocus={() => setTip({ x: x(i), y: mid - h(d.pos), title: d.label, rows: [{ value: fmt(d.pos), label: 'positivos', color: 'var(--viz-pos)' }, { value: fmt(d.neg), label: 'negativos', color: 'var(--viz-neg)' }, { value: fmt(d.neu), label: 'neutrales' }] })}
              onBlur={() => setTip(null)} />
            {i % labelEvery === 0 && <text x={x(i)} y={height - 4} textAnchor="middle" className="fill-[var(--viz-ink-2)] text-[11px]">{d.label}</text>}
          </g>
        ))}
      </svg>
      <TooltipBox tip={tip} />
    </div>
  )
}

/* ---------- Barra segmentada alta: una totalidad dividida en partes ---------- */
export function SegmentedBar({ parts }: { parts: { label: string; value: number; color: string; ink: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const [tip, setTip] = useState<Tip | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="flex h-7 gap-0.5" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)} %)`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => {
          const pct = Math.round((p.value / total) * 100)
          return (
            <div key={p.label} tabIndex={0} className="flex min-w-0 items-center rounded px-2 text-xs font-medium outline-none" style={{ width: `${(p.value / total) * 100}%`, background: p.color, color: p.ink }}
              onMouseMove={(e) => { const b = ref.current!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: 0, title: p.label, rows: [{ value: fmt(p.value), label: `(${pct} %)` }] }) }}
              onFocus={(e) => { const b = ref.current!.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left - b.left + r.width / 2, y: 0, title: p.label, rows: [{ value: fmt(p.value), label: `(${pct} %)` }] }) }}
              onBlur={() => setTip(null)}>
              {/* el porcentaje solo se imprime si cabe */}
              {pct >= 8 && <span className="truncate">{pct} %</span>}
            </div>
          )
        })}
      </div>
      <TooltipBox tip={tip} />
    </div>
  )
}

/* ---------- Barras horizontales ordenadas (ranking) ---------- */
export function RankBars({ rows, onClick, unit, color = 'var(--viz-1)' }: { rows: { label: ReactNode; key: string; value: number; sub?: string }[]; onClick?: (k: string) => void; unit: string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" disabled={!onClick} onClick={() => onClick?.(r.key)} className="group grid w-full grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 rounded-lg px-1 py-0.5 text-left enabled:hover:bg-text/5 sm:grid-cols-[minmax(0,12rem)_1fr]" title={`${r.value} ${unit}${r.sub ? ' · ' + r.sub : ''}`}>
            <span className="truncate text-sm text-text">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3 rounded-r" style={{ width: `${(r.value / max) * 100}%`, minWidth: 3, background: color }} />
              <span className="text-xs font-medium text-text tabular-nums">{fmt(r.value)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
