/**
 * Panel de análisis de la competencia (solo en pantalla: los informes exportados no llevan gráficos).
 * Color con significado: la marca en el azul de la paleta validada y la competencia en gris neutro (validado:
 * ΔE ≥ 14 con daltonismo y contraste ≥ 3:1 en claro y oscuro); los «por confirmar», con contorno discontinuo.
 * Cada gráfico tiene información al pasar el ratón y una vista de tabla.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui'
import { DataTable, SegmentedBar, ViewToggle } from '@/components/charts/Charts'
import { cn } from '@/lib/cn'
import { PROVINCES } from './data'
import type { CompModel, CompRow } from './analyze'

type Kind = CompRow['kind']
const fill = (k: Kind) => (k === 'marca' ? 'var(--viz-1)' : k === 'competidor' ? 'var(--viz-rival)' : 'transparent')
const stroke = (k: Kind) => (k === 'marca' ? 'var(--viz-surface)' : k === 'competidor' ? 'var(--viz-surface)' : 'var(--viz-rival)')
const hrs = (h: number) => (h <= 48 ? `${h} h` : `${Math.round(h / 24)} días`)
const usd = (v: number) => `${v % 1 ? v.toFixed(2) : v} USD`
const short = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const nice = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) || v }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  // 0 hasta medir: los gráficos no se dibujan con un ancho supuesto (en móvil desbordaría la pantalla)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    setW(Math.round(ref.current.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Información al pasar el ratón (posicionada dentro de la tarjeta). */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  const box = tip && (
    <div role="tooltip" className="pointer-events-none absolute z-10 max-w-64 rounded-xl bg-[var(--viz-ink)] px-3 py-2 text-xs leading-5 text-[var(--viz-surface)] shadow-3"
      style={{ left: Math.max(4, tip.x + 12), top: Math.max(4, tip.y - 8), transform: tip.x > 380 ? 'translateX(calc(-100% - 24px))' : undefined }}>{tip.body}</div>
  )
  return [box, setTip] as const
}

/** Tarjeta del panel con título, subtítulo y conmutador «Gráfico / Tabla». */
function Panel({ title, sub, table, children, className, tableFirst }: { title: string; sub?: string; table?: { head: string[]; rows: (string | number)[][] }; children: ReactNode; className?: string; tableFirst?: boolean }) {
  // vista inicial: el gráfico (o la tabla, si se pide con tableFirst)
  const [asTable, setAsTable] = useState(!!table && !!tableFirst)
  return (
    <section className={cn('relative min-w-0 rounded-3xl border border-outline-2 bg-surface p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1"><h3 className="text-[15px] font-medium text-text">{title}</h3>{sub && <p className="text-xs text-text-2">{sub}</p>}</div>
        {table && <ViewToggle table={asTable} onChange={setAsTable} />}
      </div>
      {asTable && table ? <DataTable inline head={table.head} rows={table.rows} /> : children}
    </section>
  )
}

/* ---------- Indicadores ---------- */
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-4 py-3">
      <div className="text-xs text-text-2">{label}</div>
      <div className="mt-0.5 text-2xl leading-8 font-medium text-text tabular-nums">{value}</div>
      {sub && <div className={cn('text-xs', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-error' : 'text-text-2')}>{tone && <Icon name={tone === 'good' ? 'arrow_downward' : 'arrow_upward'} className="!text-[14px] align-[-2px]" />}{sub}</div>}
    </div>
  )
}

/* ---------- Mapa de posicionamiento: precio de entrada × plazo de entrega ---------- */
function PositionMap({ rows }: { rows: CompRow[] }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [tipBox, setTip] = useTip()
  const [hover, setHover] = useState<string | null>(null)
  const pts = rows.filter((r) => r.minPrice?.currency === 'USD' && r.hours > 0)
  if (pts.length < 2) return <p className="py-6 text-center text-sm text-text-2">Hacen falta al menos dos con precio de combo y plazo de entrega conocidos.</p>
  const H = 300, L = 52, R = 16, T = 18, B = 38, w = W - L - R, h = H - T - B
  const maxX = nice(Math.max(...pts.map((p) => p.minPrice!.value)) * 1.12), maxY = nice(Math.max(...pts.map((p) => p.hours)) * 1.1)
  const x = (v: number) => L + (v / maxX) * w, y = (v: number) => T + (v / maxY) * h // arriba = más rápido
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] }
  const mx = med(pts.map((p) => p.minPrice!.value)), my = med(pts.map((p) => p.hours))
  const r = (p: CompRow) => Math.min(14, 6 + p.provinces * 1.6)
  const ticksX = (W < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => f * maxX), ticksY = [0, 0.5, 1].map((f) => f * maxY)
  // etiquetas sin solaparse: primero la marca y los de más amenaza; las que no caben quedan en la información y la tabla
  // los puntos también son obstáculos; si un lado está ocupado se prueba el otro
  const boxes: [number, number, number, number][] = pts.map((p) => { const cx = x(p.minPrice!.value), cy = y(p.hours), rr = r(p); return [cx - rr, cy - rr, cx + rr, cy + rr] })
  const side = new Map<string, 'L' | 'R'>()
  const hit = (b: [number, number, number, number]) => b[0] < L || b[2] > L + w || boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  ;[...pts].sort((a, b) => Number(b.kind === 'marca') - Number(a.kind === 'marca') || (b.threat || 0) - (a.threat || 0)).forEach((p) => {
    const cx = x(p.minPrice!.value), cy = y(p.hours), rr = r(p), tw = Math.min(18, p.name.length) * 6.2
    const R_: [number, number, number, number] = [cx + rr + 4, cy - 7, cx + rr + 4 + tw, cy + 7], L_: [number, number, number, number] = [cx - rr - 4 - tw, cy - 7, cx - rr - 4, cy + 7]
    const pref = cx > L + w - 110 ? ['L', 'R'] as const : ['R', 'L'] as const
    for (const sd of pref) { const b = sd === 'R' ? R_ : L_; if (!hit(b)) { boxes.push(b); side.set(p.name, sd); break } }
  })
  const showLabel = new Set(side.keys())
  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ minHeight: H }} onMouseLeave={() => { setTip(null); setHover(null) }}>
      {W > 0 && <svg width={W} height={H} role="img" aria-label="Mapa de posicionamiento: precio del combo de entrada frente al plazo de entrega">
        {/* cuadrante ideal (barato y rápido) */}
        <rect x={L} y={T} width={x(mx) - L} height={y(my) - T} fill="var(--viz-1-wash)" />
        {ticksX.map((t, i) => <g key={'x' + t}><line x1={x(t)} x2={x(t)} y1={T} y2={T + h} stroke="var(--viz-grid)" /><text x={x(t)} y={H - 20} textAnchor={i === ticksX.length - 1 ? 'end' : 'middle'} className="fill-[var(--viz-ink-2)] text-[11px]">{Math.round(t)}</text></g>)}
        {ticksY.map((t) => <g key={'y' + t}><line x1={L} x2={L + w} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--viz-ink-2)] text-[11px]">{t ? hrs(Math.round(t)) : '0'}</text></g>)}
        <line x1={x(mx)} x2={x(mx)} y1={T} y2={T + h} stroke="var(--viz-axis)" strokeDasharray="4 4" />
        <line x1={L} x2={L + w} y1={y(my)} y2={y(my)} stroke="var(--viz-axis)" strokeDasharray="4 4" />
        <text x={L + 6} y={T + 14} className="fill-[var(--viz-1)] text-[11px] font-medium">Barato y rápido</text>
        <text x={L + w - 6} y={T + 14} textAnchor="end" className="fill-[var(--viz-ink-2)] text-[11px]">Caro y rápido</text>
        <text x={L + 6} y={T + h - 6} className="fill-[var(--viz-ink-2)] text-[11px]">Barato y lento</text>
        <text x={L + w - 6} y={T + h - 6} textAnchor="end" className="fill-[var(--viz-ink-2)] text-[11px]">Caro y lento</text>
        <text x={L + w / 2} y={H - 4} textAnchor="middle" className="fill-[var(--viz-ink-2)] text-[11px]">Combo de entrada (USD) →</text>
        <text transform={`translate(12 ${T + h / 2}) rotate(-90)`} textAnchor="middle" className="fill-[var(--viz-ink-2)] text-[11px]">↑ Entrega más rápida</text>
        {/* la marca encima de todos */}
        {[...pts].sort((a, b) => Number(a.kind === 'marca') - Number(b.kind === 'marca')).map((p) => {
          const cx = x(p.minPrice!.value), cy = y(p.hours), rr = r(p) + (hover === p.name ? 2 : 0), right = side.get(p.name) === 'L'
          return (
            <g key={p.name} onMouseMove={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover(p.name); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, body: <><b>{p.name}</b>{p.kind === 'por confirmar' && ' · por confirmar'}<br />Combo de entrada: {usd(p.minPrice!.value)}<br />«{short(p.minPrice!.product, 34)}»<br />Entrega: {hrs(p.hours)} · {p.provinces} provincia{p.provinces === 1 ? '' : 's'}{p.threat != null ? <><br />Amenaza: {p.threat}</> : null}</> }) }}>
              <circle cx={cx} cy={cy} r={rr + 8} fill="transparent" />
              <circle cx={cx} cy={cy} r={rr} fill={fill(p.kind)} stroke={stroke(p.kind)} strokeWidth={2} strokeDasharray={p.kind === 'por confirmar' ? '3 2' : undefined} fillOpacity={p.kind === 'competidor' ? 0.85 : 1} />
              {showLabel.has(p.name) && <text x={right ? cx - rr - 4 : cx + rr + 4} y={cy + 4} textAnchor={right ? 'end' : 'start'} className={cn('text-[11px]', p.kind === 'marca' ? 'fill-[var(--viz-ink)] font-medium' : 'fill-[var(--viz-ink-2)]')}>{short(p.name)}</text>}
            </g>
          )
        })}
      </svg>}
      {tipBox}
      <p className="mt-1 text-xs text-text-2">El tamaño del punto indica en cuántas provincias tiene presencia. Las líneas discontinuas marcan las medianas ({usd(mx)} · {hrs(my)}).</p>
    </div>
  )
}

/* ---------- Escalera de precios: todos los combos de cada uno ---------- */
function PriceLadder({ ladder, median }: { ladder: NonNullable<NonNullable<CompModel['combos']>['ladder']>; median: number | null }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [tipBox, setTip] = useTip()
  const rows = [...ladder].sort((a, b) => Number(b.kind === 'marca') - Number(a.kind === 'marca') || Math.min(...a.combos.map((c) => c.price)) - Math.min(...b.combos.map((c) => c.price))).slice(0, 10)
  const L = W < 480 ? 96 : Math.min(150, Math.max(100, W * 0.22)), R = 16, rowH = 30, T = 8, H = T + rows.length * rowH + 26, w = W - L - R
  const max = nice(Math.max(...rows.flatMap((r) => r.combos.map((c) => c.price))) * 1.05)
  const x = (v: number) => L + (v / max) * w
  const narrow = W < 480
  const ticks = (narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => f * max)
  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ minHeight: H }} onMouseLeave={() => setTip(null)}>
      {W > 0 && <svg width={W} height={H} role="img" aria-label="Escalera de precios de los combos">
        {ticks.map((t, i) => <g key={t}><line x1={x(t)} x2={x(t)} y1={T} y2={H - 22} stroke="var(--viz-grid)" /><text x={x(t)} y={H - 6} textAnchor={i === ticks.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-[var(--viz-ink-2)] text-[11px]">{Math.round(t)} USD</text></g>)}
        {median != null && <g><line x1={x(median)} x2={x(median)} y1={T} y2={H - 22} stroke="var(--viz-axis)" strokeDasharray="4 4" /><text x={x(median) + 4} y={T + 10} className="fill-[var(--viz-ink-2)] text-[10px]">mediana {usd(median)}</text></g>}
        {rows.map((r, i) => {
          const cy = T + i * rowH + rowH / 2, ps = r.combos.map((c) => c.price), lo = Math.min(...ps), hi = Math.max(...ps)
          return (
            <g key={r.who}>
              <text x={L - 10} y={cy + 4} textAnchor="end" className={cn('text-[12px]', r.kind === 'marca' ? 'fill-[var(--viz-ink)] font-medium' : 'fill-[var(--viz-ink-2)]')}>{short(r.who, W < 480 ? 13 : 20)}</text>
              <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={r.kind === 'marca' ? 'var(--viz-1)' : 'var(--viz-rival)'} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
              {r.combos.map((c, k) => (
                <g key={k} onMouseMove={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, body: <><b>{r.who}</b><br />«{short(c.name, 34)}»<br />{usd(c.price)}{c.weightLb ? ` · ${c.weightLb} lb` : ''}{c.perLb != null ? ` · ${c.perLb} USD/lb` : ''}</> }) }}>
                  <circle cx={x(c.price)} cy={cy} r={12} fill="transparent" />
                  <circle cx={x(c.price)} cy={cy} r={5} fill={fill(r.kind)} stroke={r.kind === 'por confirmar' ? 'var(--viz-rival)' : 'var(--viz-surface)'} strokeWidth={2} strokeDasharray={r.kind === 'por confirmar' ? '2 2' : undefined} />
                </g>
              ))}
            </g>
          )
        })}
      </svg>}
      {tipBox}
    </div>
  )
}

/* ---------- Barras horizontales con la marca destacada ---------- */
function HBars({ rows, unit, note }: { rows: { label: string; value: number; kind: Kind; shown?: string }[]; unit: string; note?: string }) {
  const [tipBox, setTip] = useTip()
  const ref = useRef<HTMLDivElement>(null)
  if (!rows.length) return <p className="py-4 text-center text-sm text-text-2">Sin datos.</p>
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <div ref={ref} className="relative space-y-1.5" onMouseLeave={() => setTip(null)}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(80px,38%)_1fr_auto] items-center gap-2 text-[13px]"
          onMouseMove={(e) => { const b = ref.current!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, body: <><b>{r.label}</b>{r.kind === 'por confirmar' && ' · por confirmar'}<br />{r.shown ?? r.value} {unit}</> }) }}>
          <span className={cn('truncate', r.kind === 'marca' ? 'font-medium text-text' : 'text-text-2')} title={r.label}>{r.label}</span>
          <span className="anim-fill h-3 rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: fill(r.kind) === 'transparent' ? 'transparent' : fill(r.kind), border: r.kind === 'por confirmar' ? '2px dashed var(--viz-rival)' : undefined }} />
          <span className="text-xs text-text-2 tabular-nums">{r.shown ?? r.value}</span>
        </div>
      ))}
      {note && <p className="pt-1 text-xs text-text-2">{note}</p>}
      {tipBox}
    </div>
  )
}

/* ---------- Matriz de capacidades ---------- */
const ABBR: Record<string, string> = { 'Las Tunas': 'LT', Granma: 'GR', Holguín: 'HO', 'Santiago de Cuba': 'SC', Guantánamo: 'GT' }
const CAPS: { key: string; label: string; test: (r: CompRow) => boolean }[] = [
  ...PROVINCES.map((p) => ({ key: p, label: ABBR[p], test: (r: CompRow) => !!r.provList?.includes(p) })),
  { key: 'Zelle', label: 'Zelle', test: (r) => r.zelle },
  { key: 'Tarjeta', label: 'Tarjeta', test: (r) => r.payments.some((p) => /visa|mastercard|american|tarjeta|paypal/i.test(p)) },
  { key: 'Contra entrega', label: 'C. entrega', test: (r) => r.payments.includes('Pago contra entrega') },
  { key: 'Combos públicos', label: 'Combos', test: (r) => r.publicPrices },
  { key: 'Reseñas', label: 'Reseñas', test: (r) => r.rating != null },
]
function CapMatrix({ rows }: { rows: CompRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-center text-xs">
        <thead><tr><th className="text-left font-normal text-text-2" />{CAPS.map((c) => <th key={c.key} title={c.key} className="px-1 font-medium text-text-2">{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.name}>
            <td className={cn('max-w-36 truncate pr-2 text-left', r.kind === 'marca' ? 'font-medium text-text' : 'text-text-2')} title={r.name}>{r.name}{r.kind === 'por confirmar' && <span className="text-text-3"> ·?</span>}</td>
            {CAPS.map((c) => { const ok = c.test(r); return (
              <td key={c.key} title={`${r.name} · ${c.key}: ${ok ? 'sí' : 'no'}`} className={cn('h-8 min-w-9 rounded-lg', ok ? (r.kind === 'marca' ? 'bg-[var(--viz-1)] text-[var(--viz-on-fill)]' : 'bg-[var(--viz-rival-wash)] text-[var(--viz-ink)]') : 'text-text-3')}>
                {ok ? <Icon name="check" className="!text-[16px]" /> : '—'}
              </td>) })}
          </tr>
        ))}</tbody>
      </table>
      <p className="mt-1 text-xs text-text-2">Provincias: {PROVINCES.map((p) => `${ABBR[p]} ${p}`).join(' · ')}.</p>
    </div>
  )
}

/** Panel completo. */
export function CompDashboard({ m }: { m: CompModel }) {
  const rows = m.comparison || [], C = m.combos, brandRow = rows.find((r) => r.kind === 'marca')
  const rivals = rows.filter((r) => r.kind !== 'marca')
  const bEntry = C?.cheapest.find((x) => x.kind === 'marca')?.combo
  const vsMed = bEntry && C?.medianMin ? Math.round(((bEntry.price - C.medianMin) / C.medianMin) * 100) : null
  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2">
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[var(--viz-1)]" />{m.brand}</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[var(--viz-rival)]" />Competencia</span>
      {rows.some((r) => r.kind === 'por confirmar') && <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border-2 border-dashed border-[var(--viz-rival)]" />Por confirmar</span>}
    </div>
  )
  const perLb = (C?.ladder || []).map((l) => ({ who: l.who, kind: l.kind, v: Math.min(...l.combos.map((c) => c.perLb ?? Infinity)) })).filter((x) => isFinite(x.v)).sort((a, b) => a.v - b.v)
  return (
    <div className="mb-6 min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1"><h2 className="text-xl">Panel de análisis</h2><p className="text-xs text-text-2">Solo en pantalla: el informe que se exporta no lleva gráficos.</p></div>
        {legend}
      </div>
      {/* indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Competidores analizados" value={String(rivals.length)} sub={rivals.some((r) => r.kind === 'por confirmar') ? `${rivals.filter((r) => r.kind === 'por confirmar').length} por confirmar` : undefined} />
        <Kpi label="Combo más barato del mercado" value={C?.floor ? usd(C.floor.combo.price) : '—'} sub={C?.floor ? short(C.floor.who, 22) : undefined} />
        <Kpi label="Mediana del combo de entrada" value={C?.medianMin != null ? usd(C.medianMin) : '—'} sub="de la competencia" />
        <Kpi label="Mejor precio por libra" value={C?.bestPerLb?.combo.perLb != null ? `${C.bestPerLb.combo.perLb} USD/lb` : '—'} sub={C?.bestPerLb ? short(C.bestPerLb.who, 22) : undefined} />
        <Kpi label={`Combo de entrada de ${short(m.brand, 14)}`} value={bEntry ? usd(bEntry.price) : '—'} sub={vsMed != null ? `${vsMed > 0 ? '+' : ''}${vsMed} % frente a la mediana` : bEntry ? undefined : 'sin combos con precio'} tone={vsMed != null ? (vsMed > 0 ? 'bad' : 'good') : undefined} />
        <Kpi label="Opinión positiva" value={m.social.total ? `${m.social.posPct} %` : '—'} sub={m.social.total ? `${m.social.negPct} % en contra · ${m.social.total} coment.` : 'sin seguimientos'} />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Mapa de posicionamiento" sub="Precio del combo de entrada frente al plazo de entrega" className="lg:col-span-2" tableFirst
          table={{ head: ['Marca / competidor', 'Combo de entrada', 'Entrega', 'Provincias', 'Amenaza'], rows: rows.filter((r) => r.minPrice || r.hours).map((r) => [r.name, r.minPrice ? usd(r.minPrice.value) : '—', r.hours ? hrs(r.hours) : '—', r.provinces, r.threat ?? '—']) }}>
          <PositionMap rows={rows} />
        </Panel>
        {!!C?.ladder?.length && (
          <Panel title="Escalera de precios" sub="Cada punto es un combo; la línea, el rango de precios de cada uno" className="lg:col-span-2"
            table={{ head: ['Marca / competidor', 'Combo', 'Precio', 'Peso', 'USD/lb'], rows: C.ladder.flatMap((l) => l.combos.map((c) => [l.who, c.name, usd(c.price), c.weightLb ? `${c.weightLb} lb` : '—', c.perLb != null ? c.perLb.toFixed(2) : '—'])) }}>
            <PriceLadder ladder={C.ladder} median={C.medianMin} />
          </Panel>
        )}
        <Panel title="Nivel de amenaza" sub="Presencia, pago, rapidez, confianza, reputación y menciones" table={{ head: ['Competidor', 'Amenaza'], rows: rivals.map((r) => [r.name, r.threat ?? 0]) }}>
          <HBars unit="puntos" rows={[...rivals].sort((a, b) => (b.threat || 0) - (a.threat || 0)).slice(0, 8).map((r) => ({ label: r.name, value: r.threat || 0, kind: r.kind }))} />
        </Panel>
        <Panel title="Precio por libra" sub="El combo con mejor precio por libra de cada uno · menos es mejor" table={{ head: ['Marca / competidor', 'USD/lb'], rows: perLb.map((p) => [p.who, p.v.toFixed(2)]) }}>
          <HBars unit="USD/lb" note={perLb.length ? undefined : 'Sin combos con peso conocido.'} rows={perLb.slice(0, 8).map((p) => ({ label: p.who, value: p.v, kind: p.kind, shown: `${p.v}` }))} />
        </Panel>
        <Panel title="Matriz de capacidades" sub="Presencia por provincia, formas de pago, oferta pública y reseñas" className="lg:col-span-2"
          table={{ head: ['Marca / competidor', ...CAPS.map((c) => c.key)], rows: rows.map((r) => [r.name, ...CAPS.map((c) => (c.test(r) ? 'Sí' : 'No'))]) }}>
          <CapMatrix rows={rows.slice(0, 10)} />
        </Panel>
        {!!C?.top.length && (
          <Panel title="Qué llevan los combos" sub={`Combos que incluyen cada producto (de ${C.total})`} table={{ head: ['Producto', 'Combos'], rows: C.top.map((t) => [t.product, t.count]) }}>
            <HBars unit={`de ${C.total} combos`} rows={C.top.slice(0, 8).map((t) => ({ label: t.product, value: t.count, kind: 'competidor' as Kind }))} />
          </Panel>
        )}
        {m.social.total > 0 && (
          <Panel title={`Opinión sobre ${m.brand}`} sub={`${m.social.total} comentarios en Facebook`} table={{ head: ['Opinión', 'Comentarios', '%'], rows: [['A favor', m.social.pos, m.social.posPct], ['Neutrales', m.social.neu, 100 - m.social.posPct - m.social.negPct], ['En contra', m.social.neg, m.social.negPct]] }}>
            <SegmentedBar parts={[{ label: 'A favor', value: m.social.pos, color: 'var(--viz-pos)', ink: 'var(--viz-on-fill)' }, { label: 'Neutrales', value: m.social.neu, color: 'var(--viz-neu)', ink: 'var(--viz-on-neu)' }, { label: 'En contra', value: m.social.neg, color: 'var(--viz-neg)', ink: 'var(--viz-on-fill)' }]} />
            {!!C?.demanded.length && <p className="mt-3 text-xs text-text-2">Lo que más piden: {C.demanded.slice(0, 5).map((d) => `${d.product.toLowerCase()} (${d.count})`).join(', ')}.</p>}
          </Panel>
        )}
      </div>
      {!brandRow && null}
    </div>
  )
}
