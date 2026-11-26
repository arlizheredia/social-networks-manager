/** Componentes de la sección Competencia: vista del informe, fichas de competidores, perfil de la marca e historial. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Card, CardHead, Chip, Dialog, Empty, Field, Icon, IconButton, Input, MenuItem, NumberField, Popover, Switch, Textarea, confirmBox, toast } from '@/components/ui'
import { copyRich } from '@/lib/util'
import { cn } from '@/lib/cn'
import { downloadHtml, downloadWord, printPdf } from '@/lib/docexport'
import { reportPlainText } from '@/features/comments/reportHtml'
import { PAYMENTS, PROVINCES, type Province } from './data'
import { clearCompetitors, confirmCompetitor, deleteCompReports, removeCompetitor, deleteCompetitor, loadCompHistory, setComp, setRun, useCompRun, upsertCompetitor, useCompHistory, useCompetition, type Competitor, type PriceRef, type SavedCompReport } from './store'
import { compHtml, compTitle, consolidatedHtml } from './html'
import { CompDashboard } from './Dashboard'
import type { CompModel } from './analyze'
import { researchCompetitor, researchOnWeb } from './websearch'
import { getPrefs } from '@/features/comments/prefs'
import { brandKeys } from '@/features/comments/normalize'
import { useExtension } from '@/features/extension/bridge'

const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** «Informe de la competencia y redes sociales - Kanasta24-26-11-2026 14-35» (fecha y hora en que se generó). */
export const stamp = (t: number | string) => { const d = new Date(t), p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}-${p(d.getMinutes())}` }
export const compFileName = (brand: string, generatedAt: number | string) => `Informe de la competencia y redes sociales - ${brand}-${stamp(generatedAt)}`

/** Vista del informe con copiar y exportar (Word, PDF, HTML). */
export function CompReportView({ html, file, back, dashboard }: { html: string; title?: string; file: string; back?: { label: string; onClick: () => void }; dashboard?: ReactNode }) {
  const [view, setView] = useState<'panel' | 'report'>(dashboard ? 'panel' : 'report')
  return (
    <div>
      {/* una sola línea: volver · pestañas · copiar y exportar (sobre la misma línea divisoria) */}
      <div className="mb-5 flex items-center gap-1 border-b border-outline-2 sm:gap-2">
        {back && <IconButton icon="arrow_back" label={back.label} onClick={back.onClick} className="mb-1 shrink-0" />}
        {dashboard ? (
          <div role="tablist" className="flex min-w-0 overflow-x-auto">
            {([['panel', 'Panel de análisis', 'Panel', 'monitoring'], ['report', 'Informe para exportar', 'Informe', 'description']] as const).map(([id, label, shortL, icon]) => (
              <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={cn('relative inline-flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4', view === id ? 'text-primary' : 'text-text-2 hover:text-text')}>
                <Icon name={icon} className="!text-[20px]" /><span className="sm:hidden">{shortL}</span><span className="hidden sm:inline">{label}</span>
                {view === id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-primary" />}
              </button>
            ))}
          </div>
        ) : back && <span className="py-3 text-sm font-medium text-text-2">{back.label}</span>}
        <span className="flex-1" />
        <div className="mb-1.5 flex shrink-0 gap-1 sm:gap-2">
          {/* en pantalla estrecha, solo iconos (con su texto de ayuda) */}
          <IconButton icon="content_copy" label="Copiar el informe" className="sm:!hidden" onClick={async () => toast((await copyRich(html, reportPlainText(html))) ? 'Informe copiado: pégalo en Word o en un correo' : 'No se pudo copiar')} />
          <Button variant="outlined" size="sm" icon="content_copy" className="max-sm:!hidden" onClick={async () => toast((await copyRich(html, reportPlainText(html))) ? 'Informe copiado: pégalo en Word o en un correo' : 'No se pudo copiar')}>Copiar</Button>
          <Popover align="right" trigger={(o) => <><IconButton icon="download" label="Exportar" className="bg-primary !text-on-primary sm:!hidden" onClick={o} /><Button size="sm" icon="download" className="max-sm:!hidden" onClick={o}>Exportar</Button></>}>
            {(close) => <>
              <MenuItem icon="description" onClick={() => { close(); downloadWord(file, file, html) }}>Word (.doc)</MenuItem>
              <MenuItem icon="picture_as_pdf" onClick={() => { close(); printPdf(file, html) }}>PDF (imprimir)</MenuItem>
              <MenuItem icon="html" onClick={() => { close(); downloadHtml(file, file, html) }}>Página web (.html)</MenuItem>
            </>}
          </Popover>
        </div>
      </div>
      {dashboard && view === 'panel' ? dashboard : <article className="report-view rounded-3xl border border-outline-2 bg-surface p-6 sm:p-10" dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  )
}

/** Selector de provincias del oriente (varias). */
export function ProvincePicker({ value, onChange }: { value: Province[]; onChange: (v: Province[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PROVINCES.map((p) => <Chip key={p} icon={value.includes(p) ? undefined : 'add'} selected={value.includes(p)} onClick={() => onChange(value.includes(p) ? value.filter((x) => x !== p) : PROVINCES.filter((x) => x === p || value.includes(x)))}>{p}</Chip>)}
      <Button size="sm" variant="text" onClick={() => onChange(value.length === PROVINCES.length ? [] : [...PROVINCES])}>{value.length === PROVINCES.length ? 'Ninguna' : 'Todo el oriente'}</Button>
    </div>
  )
}

/* ---------- Fichas de competidores ---------- */
function CompetitorDialog({ c, onClose }: { c: Competitor | null; onClose: () => void }) {
  const [f, setF] = useState<Competitor | null>(c)
  // referencia para saber qué cambió el usuario (lo que rellena la búsqueda no cuenta como corrección)
  const [base, setBase] = useState<Competitor | null>(c)
  const [busy, setBusy] = useState<string | null>(null)
  const ext = useExtension((x) => x.publisher)
  // texto tal como se escribe (con saltos de línea); las direcciones se sacan de él
  const [refText, setRefText] = useState((c?.refUrls || []).join('\n'))
  useEffect(() => { setF(c); setBase(c); setRefText((c?.refUrls || []).join('\n')) }, [c])
  if (!f) return null
  /** Busca de nuevo en Internet con lo escrito ahora (nombre, otros nombres, enlace). */
  const research = async () => {
    if (!f.name.trim()) { toast('Escribe el nombre del competidor'); return }
    setBusy('Buscando…')
    try {
      const FIELDS = ['name', 'aliases', 'url', 'refUrls'] as const
      const typed = base ? FIELDS.filter((k) => JSON.stringify(f[k]) !== JSON.stringify(base[k])) : []
      const cur = { ...f, name: f.name.trim(), manual: [...new Set([...(f.manual || []), ...typed])] }
      const r = await researchCompetitor(cur, (st, p) => setBusy(`${st}${p != null ? ` ${Math.round(p)} %` : ''}`))
      if (r.error && !r.hits && !r.pages) { toast(r.error); return }
      upsertCompetitor(r.competitor); setF(r.competitor); setBase(r.competitor); setRefText((r.competitor.refUrls || []).join('\n'))
      toast(`Ficha actualizada con ${r.hits} resultado${r.hits === 1 ? '' : 's'} de Google${r.pages ? ` y ${r.pages} página${r.pages === 1 ? '' : 's'} de su sitio` : ''}`, 'travel_explore')
    } catch (e) { toast((e as Error).message) } finally { setBusy(null) }
  }
  const up = (x: Partial<Competitor>) => setF({ ...f, ...x })
  const save = () => {
    if (!f.name.trim()) { toast('Escribe el nombre del competidor'); return }
    const out = { ...f, name: f.name.trim(), prices: f.prices.filter((p) => p.product.trim() || p.price) }
    // lo que el usuario cambia queda como corregido: la detección automática ya no lo sobrescribe
    const FIELDS = ['name', 'aliases', 'provinces', 'payments', 'deliveryHours', 'coverage', 'prices', 'rating', 'reputation', 'model', 'url', 'refUrls'] as const
    const changed = base ? FIELDS.filter((k) => JSON.stringify(out[k]) !== JSON.stringify(base[k])) : []
    upsertCompetitor({ ...out, manual: [...new Set([...(f.manual || []), ...changed])] })
    toast(changed.length ? 'Ficha corregida: la IA ya no cambiará esos datos' : 'Ficha guardada'); onClose()
  }
  const setPrice = (i: number, x: Partial<PriceRef>) => up({ prices: f.prices.map((p, k) => (k === i ? { ...p, ...x } : p)) })
  return (
    <Dialog open onClose={onClose} wide title={`Ficha: ${c?.name || ''}`} icon={<Icon name="storefront" className="text-primary" />}
      actions={<>
        <Button variant="tonal" icon={busy ? 'progress_activity' : 'travel_explore'} className="mr-auto" disabled={!!busy || !ext} title={ext ? 'Busca en Google con el nombre, los otros nombres y el enlace escritos ahora' : 'Necesita la extensión de Chrome'} onClick={research}>{busy || 'Buscar de nuevo en Internet'}</Button>
        <Button variant="text" onClick={onClose}>Cancelar</Button><Button disabled={!!busy} onClick={save}>Guardar</Button>
      </>}>
      <p className="mb-3 text-sm text-text-2">{f.source === 'detectado' ? `Creada por la IA${f.detectedAt ? ' el ' + new Date(f.detectedAt).toLocaleDateString('es') : ''} a partir de ${f.mentions || 0} comentario${f.mentions === 1 ? '' : 's'}${f.page ? ' (incluye su propia página)' : ''}. ` : ''}Corrige lo que no sea exacto: lo que cambies ya no lo sobrescribe la detección automática. Si cambias el nombre o los otros nombres, pulsa «Buscar de nuevo en Internet» para completar la ficha con ellos.{f.manual?.length ? ` Corregido: ${f.manual.length} campo${f.manual.length === 1 ? '' : 's'}.` : ''}</p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Nombre *"><Input autoFocus maxLength={80} value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="Ej.: Fagales Market" /></Field>
        <Field label="Otros nombres" hint="Separados por comas: cómo lo escribe la gente."><Input value={f.aliases.join(', ')} onChange={(e) => up({ aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Fagales, Fagales Mkt" /></Field>
      </div>
      <div className="mb-1 text-[13px] font-medium text-text-2">Provincias con presencia</div>
      <div className="mb-4"><ProvincePicker value={f.provinces} onChange={(v) => up({ provinces: v })} /></div>
      <div className="mb-1 text-[13px] font-medium text-text-2">Métodos de pago</div>
      <div className="mb-4 flex flex-wrap gap-2">{PAYMENTS.map((p) => <Chip key={p.name} selected={f.payments.includes(p.name)} onClick={() => up({ payments: f.payments.includes(p.name) ? f.payments.filter((x) => x !== p.name) : [...f.payments, p.name] })}>{p.name}</Chip>)}</div>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Field label="Plazo de entrega (horas)" hint="0 = sin dato. 5 días = 120."><NumberField value={f.deliveryHours} min={0} max={2000} onChange={(v) => up({ deliveryHours: v })} /></Field>
        <Field label="Calificación (de 5)" hint="Trustpilot u otra; vacío = sin dato."><Input type="number" step="0.1" min={0} max={5} value={f.rating ?? ''} onChange={(e) => up({ rating: e.target.value === '' ? null : Math.max(0, Math.min(5, +e.target.value)) })} /></Field>
        <Field label="Enlace (web o página)"><Input value={f.url} onChange={(e) => up({ url: e.target.value })} placeholder="https://…" /></Field>
      </div>
      <Field label="Direcciones de referencia" hint="Una por línea: su sitio, su página de Facebook, su catálogo de combos o sus reseñas (Trustpilot…). Al buscar de nuevo se leen primero estas páginas.">
        <Textarea className="!min-h-16 font-mono text-sm" placeholder={'https://www.facebook.com/…\nhttps://…/combos'} value={refText}
          onChange={(e) => { setRefText(e.target.value); up({ refUrls: e.target.value.split(/\s+/).map((u) => u.trim()).filter((u) => u.includes('.')).map((u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u)) }) }} />
      </Field>
      <Field label="Cobertura" hint="Ej.: 15 provincias, incluye zonas rurales; solo cabecera provincial."><Input value={f.coverage} onChange={(e) => up({ coverage: e.target.value })} /></Field>
      <Field label="Propuesta de valor" hint="Ej.: primero se entrega, luego se paga; factura y evidencia fotográfica."><Textarea className="!min-h-16" value={f.model} onChange={(e) => up({ model: e.target.value })} /></Field>
      <Field label="Reputación" hint="Lo que dicen las reseñas: puntos fuertes y quejas."><Textarea className="!min-h-16" value={f.reputation} onChange={(e) => up({ reputation: e.target.value })} /></Field>
      <div className="mb-1 flex items-center gap-2 text-[13px] font-medium text-text-2"><span className="flex-1">Precios de referencia</span><Button size="sm" variant="text" icon="add" onClick={() => up({ prices: [...f.prices, { product: '', price: 0, currency: 'USD', note: '' }] })}>Añadir precio</Button></div>
      {f.prices.map((p, i) => (
        <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
          <div className="min-w-40 flex-[2]"><Input className="!h-10" placeholder="Combo / producto" value={p.product} onChange={(e) => setPrice(i, { product: e.target.value })} /></div>
          <div className="w-24"><Input className="!h-10" type="number" step="0.01" placeholder="Precio" value={p.price || ''} onChange={(e) => setPrice(i, { price: +e.target.value })} /></div>
          <div className="w-20"><Input className="!h-10" value={p.currency} onChange={(e) => setPrice(i, { currency: e.target.value.toUpperCase().slice(0, 4) })} /></div>
          <div className="min-w-40 flex-[2]"><Input className="!h-10" placeholder="Observación" value={p.note} onChange={(e) => setPrice(i, { note: e.target.value })} /></div>
          <IconButton size="sm" icon="delete" label="Quitar precio" onClick={() => up({ prices: f.prices.filter((_, k) => k !== i) })} />
        </div>
      ))}
      <Switch label="Datos verificados hoy" sub={f.verifiedAt ? `Última verificación: ${new Date(f.verifiedAt).toLocaleDateString('es')}` : 'Sin verificar: el informe lo marca como pendiente.'} checked={!!f.verifiedAt && ymd(f.verifiedAt) === ymd(Date.now())} onChange={(v) => up({ verifiedAt: v ? Date.now() : null })} />
    </Dialog>
  )
}

/** Investiga en Internet (Google, por medio de la extensión) la marca y la competencia, y guarda las fichas. */
export async function runResearch(onStep?: (s: string, pct?: number) => void, opts: { maxAgeMs?: number } = {}) {
  const st = useCompetition.getState(), prefs = getPrefs().report
  // si se buscó hace poco (p. ej. hoy) para las mismas provincias, se reutiliza: no se repite la búsqueda en Google
  const key = 'v3|' + st.provinces.join('|') // v3: incluye el análisis de combos
  if (opts.maxAgeMs && st.lastWeb && st.lastWeb.key === key && Date.now() - st.lastWeb.at < opts.maxAgeMs) {
    return { brandProfile: st.brand, brandFound: [], competitors: st.competitors, found: [], refreshed: [], blocked: false, error: '', brand: prefs.client || 'tu marca', reused: true }
  }
  const brand = prefs.client || prefs.terms.split(',')[0]?.trim() || 'tu marca'
  const r = await researchOnWeb({ provinces: st.provinces, brand, brandKeys: brandKeys(), brandProfile: st.brand, competitors: st.competitors, ignored: st.ignored, onStep })
  setComp({ brand: r.brandProfile, competitors: r.competitors, ...(r.error ? {} : { lastWeb: { at: Date.now(), key } }) })
  return { ...r, brand, reused: false }
}

/** Botón y estado de la búsqueda en Internet. */
export function WebResearch({ compact }: { compact?: boolean }) {
  const b = useCompetition((s) => s.brand)
  const ext = useExtension((s) => s.publisher)
  // en el almacén compartido: se conserva al cambiar de pestaña o de sección
  const busy = useCompRun((s) => s.research), pct = useCompRun((s) => s.researchPct)
  // el porcentaje solo avanza (los avisos sin porcentaje conservan el último)
  const setBusy = (v: string | null, p?: number) => setRun((st) => ({ research: v, researchPct: v == null ? 0 : p == null ? st.researchPct : Math.max(st.researchPct, Math.round(p)) }))
  const generating = useCompRun((s) => !!s.step)
  const go = async () => {
    if (useCompRun.getState().research || useCompRun.getState().step) return
    setBusy('Buscando…')
    try {
      const r = await runResearch((x, p) => setBusy(x || 'Buscando…', p))
      if (r.error && !r.brandFound.length && !r.found.length) toast(r.error)
      else toast([r.brandFound.length ? `${r.brand}: ${r.brandFound.join(', ')}` : `No se encontraron datos nuevos de ${r.brand}`, r.found.length ? `${r.found.length} competidor${r.found.length === 1 ? '' : 'es'} nuevo${r.found.length === 1 ? '' : 's'} por confirmar` : ''].filter(Boolean).join(' · '), 'travel_explore')
    } catch (e) { toast((e as Error).message) } finally { setBusy(null) }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={compact ? 'tonal' : 'filled'} icon={busy ? 'progress_activity' : 'travel_explore'} disabled={!!busy || !ext || generating} onClick={go}>{busy ? `${busy} ${pct} %` : generating ? 'Generando el informe…' : 'Buscar en Internet ahora'}</Button>
      {!ext && <span className="text-xs text-warn">Necesita la extensión de Chrome.</span>}
      {b.analyzedAt && !busy && <span className="text-xs text-text-2">Última búsqueda: {new Date(b.analyzedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}{b.urls?.length ? ` · sitio: ${b.urls.map((u) => u.replace(/^https?:\/\/(www\.)?/, '')).join(', ')}` : ' · no se encontró un sitio propio'}</span>}
    </div>
  )
}

/** Ficha de la marca: se detecta del sitio online; se puede corregir (lo corregido no se sobrescribe). */
function BrandCard({ brand }: { brand: string }) {
  const b = useCompetition((s) => s.brand)
  // lo que el usuario cambia queda como corregido
  const up = (x: Partial<typeof b>) => setComp({ brand: { ...b, ...x, manual: [...new Set([...(b.manual || []), ...Object.keys(x)])] } })
  const man = new Set(b.manual || [])
  const ev = b.evidence || {}
  /** Estado de cada dato: corregido a mano, detectado en el sitio (con su frase) o no encontrado. */
  const tag = (k: string) => (man.has(k) ? <span className="ml-1 text-xs font-normal text-text-2">· corregido</span>
    : !b.analyzedAt ? null : ev[k] ? <span className="ml-1 text-xs font-normal text-success">· detectado en Internet</span>
      : <span className="ml-1 text-xs font-normal text-warn">· no encontrado en Internet</span>)
  const proof = (k: string) => (!man.has(k) && ev[k] ? <p className="-mt-1 mb-3 text-xs text-text-2"><Icon name="format_quote" className="!text-[14px] align-[-2px]" /> {ev[k]}</p> : null)
  return (
    <Card>
      <CardHead title={`Tu marca: ${brand}`} sub={`La ficha se completa buscando ${brand} en Internet (Google): su sitio, sus formas de pago, entregas y lo que dicen de ella otros sitios. Se compara con la competencia en cada provincia. Puedes corregir cualquier dato: lo corregido no se sobrescribe.`} />
      <div className="mb-5"><WebResearch /></div>
      {!!b.pages?.length && (
        <details className="mb-4 rounded-2xl border border-outline-2 px-4 py-2 text-sm">
          <summary className="cursor-pointer text-text-2">Ver lo que se encontró en Internet ({b.pages.length} página{b.pages.length === 1 ? '' : 's'})</summary>
          <ul className="mt-2 space-y-1">{b.pages.map((p) => (
            <li key={p.url} className="flex gap-2"><a href={p.url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate">{p.title || p.url}</a><span className={cn('shrink-0 text-xs', (p.chars ?? 1000) < 300 ? 'text-warn' : 'text-text-2')}>{p.chars != null ? `${p.chars.toLocaleString('es')} caracteres${p.chars < 300 ? ' · casi sin texto' : ''}` : ''}</span></li>
          ))}</ul>
          <p className="mt-2 text-xs text-text-2">Si un dato no aparece, puede que el sitio lo muestre en imágenes o solo al pagar: corrígelo a mano y no se volverá a cambiar.</p>
        </details>
      )}
      {b.summary && <p className="mb-4 rounded-2xl bg-surface-2 p-3 text-sm"><b className="font-medium">Propuesta (según el sitio):</b> {b.summary}</p>}
      <div className="mb-1 text-[13px] font-medium text-text-2">Cobertura por provincia{tag('coverage')}</div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">{PROVINCES.map((p) => (
        <label key={p} className="flex items-center gap-2 text-sm"><span className="w-36 shrink-0">{p}</span><Input className="!h-10" placeholder="Sin presencia" value={b.coverage[p] || ''} onChange={(e) => up({ coverage: { ...b.coverage, [p]: e.target.value } })} /></label>
      ))}</div>
      {proof('coverage')}
      <div className="mb-1 text-[13px] font-medium text-text-2">Métodos de pago que comunicas{tag('payments')}</div>
      <div className="mb-4 flex flex-wrap gap-2">{PAYMENTS.map((p) => <Chip key={p.name} selected={b.payments.includes(p.name)} onClick={() => up({ payments: b.payments.includes(p.name) ? b.payments.filter((x) => x !== p.name) : [...b.payments, p.name] })}>{p.name}</Chip>)}</div>
      {proof('payments')}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={<>Plazo de entrega habitual (horas){tag('deliveryHours')}</>} hint={!man.has('deliveryHours') && ev.deliveryHours ? `«${ev.deliveryHours}»` : undefined}><NumberField value={b.deliveryHours} min={0} max={2000} onChange={(v) => up({ deliveryHours: v })} /></Field>
        <Field label={<>Reseñas verificables{tag('reviews')}</>} hint={!man.has('reviews') && ev.reviews ? `«${ev.reviews}»` : 'Dónde (Trustpilot, Google…); vacío = no hay.'}><Input value={b.reviews} onChange={(e) => up({ reviews: e.target.value })} /></Field>
      </div>
      <Switch label="Combos públicos con precio" sub={`Publicas qué incluye cada combo y cuánto cuesta.${man.has('publicPrices') ? ' (corregido)' : !b.analyzedAt ? '' : ev.publicPrices ? ` Detectado: ${ev.publicPrices}.` : ' No se encontraron precios en el sitio.'}`} checked={b.publicPrices} onChange={(v) => up({ publicPrices: v })} />
      {man.size > 0 && <Button size="sm" variant="text" icon="restart_alt" onClick={() => setComp({ brand: { ...b, manual: [] } })}>Usar de nuevo lo detectado en Internet</Button>}
    </Card>
  )
}

export function CompetitorsTab({ brand }: { brand: string }) {
  const comps = useCompetition((s) => s.competitors)
  const ignored = useCompetition((s) => s.ignored)
  const [edit, setEdit] = useState<Competitor | null>(null)
  const pending = comps.filter((c) => c.status === 'pendiente')
  const sorted = comps.filter((c) => c.status !== 'pendiente').sort((a, b) => (b.mentions || 0) - (a.mentions || 0) || a.name.localeCompare(b.name, 'es'))
  return (
    <div className="space-y-4">
      {(comps.length > 0 || ignored.length > 0) && (
        <div className="flex justify-end">
          <Button variant="text" icon="delete_sweep" className="!text-error" onClick={async () => {
            if (await confirmBox('¿Borrar todos los competidores?', `Se borrarán las ${comps.length} fichas (por confirmar, detectadas y corregidas) y la lista de descartados. La ficha de tu marca y los informes del historial no cambian. La próxima búsqueda empezará de cero.`, 'Borrar todo', true)) { clearCompetitors(); toast('Competidores borrados') }
          }}>Borrar todos los competidores</Button>
        </div>
      )}
      {pending.length > 0 && (
        <Card filled>
          <CardHead title={`Encontrados en Internet · por confirmar (${pending.length})`} sub="La búsqueda en Google los señala como posibles competidores. Confírmalos para incluirlos en el ranking o descártalos (no volverán a aparecer)." />
          <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2 bg-surface">
            {pending.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="public" className="!text-[20px]" /></span>
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{c.name} <a href={c.url} target="_blank" rel="noopener" className="ml-1 text-xs font-normal">{c.url.replace(/^https?:\/\/(www\.)?/, '')}</a></div>
                  <div className="text-xs text-text-2">{[c.provinces.join(', '), c.payments.join(', '), c.model].filter(Boolean).join(' · ') || 'Sin datos de cobertura ni pago'}</div>
                  {c.web?.snippet && <div className="truncate text-xs text-text-3">«{c.web.snippet}» · búsqueda: {c.web.query}</div>}
                </div>
                <Button size="sm" icon="check" onClick={() => { confirmCompetitor(c.id); toast(`«${c.name}» confirmado como competidor`) }}>Confirmar</Button>
                <IconButton size="sm" icon="edit" label="Corregir ficha" onClick={() => setEdit(c)} />
                <IconButton size="sm" icon="delete" label="Eliminar esta ficha" onClick={async () => { if (await confirmBox(`¿Eliminar «${c.name}»?`, 'Se borra su ficha. Si vuelve a aparecer en una búsqueda, se creará de nuevo (para que no vuelva, usa Descartar).', 'Eliminar', true)) { removeCompetitor(c.id); toast(`«${c.name}» eliminado`) } }} />
                <IconButton size="sm" icon="block" label="Descartar: no es un competidor (no volverá a aparecer)" onClick={() => { deleteCompetitor(c.id); toast(`«${c.name}» descartado`) }} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <CardHead title="Competidores detectados" sub="La IA los detecta en los comentarios de tus seguimientos y en Internet (Google) al generar cada informe, y rellena su ficha. Puedes corregir cualquier dato; lo corregido no se sobrescribe." actions={<WebResearch compact />} />
        {!comps.length ? <Empty icon={<Icon name="travel_explore" />} title="Aún no hay competidores detectados">Genera un informe de competencia: la IA buscará a la competencia en tus seguimientos de comentarios. Para analizar a un competidor a fondo, añade sus publicaciones de Facebook a un seguimiento.</Empty> : (
          <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2">
            {sorted.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name={c.page ? 'storefront' : 'travel_explore'} className="!text-[20px]" /></span>
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{c.name}{c.rating != null && <span className="ml-2 text-xs text-text-2">★ {c.rating}</span>}</div>
                  <div className="text-xs text-text-2">{c.provinces.join(', ') || 'Sin presencia detectada'}{c.payments.length ? ' · ' + c.payments.join(', ') : ''}{c.deliveryHours ? ` · ${c.deliveryHours <= 48 ? c.deliveryHours + ' h' : Math.round(c.deliveryHours / 24) + ' días'}` : ''}</div>
                  <div className="text-xs text-text-2">{c.source === 'web' ? 'Encontrado en Internet' : c.source === 'detectado' ? 'Detectado por la IA' : 'Ficha anterior'}{c.mentions ? ` · ${c.mentions} ${c.mentions === 1 ? 'mención' : 'menciones'}` : ''}{c.lastSeen ? ` · visto ${new Date(c.lastSeen).toLocaleDateString('es')}` : ''}{c.page ? ' · tiene página seguida' : ''}{c.manual?.length ? ' · corregido a mano' : ''}</div>
                </div>
                <IconButton size="sm" icon="edit" label="Corregir ficha" onClick={() => setEdit(c)} />
                <IconButton size="sm" icon="delete" label="Eliminar esta ficha" onClick={async () => { if (await confirmBox(`¿Eliminar «${c.name}»?`, 'Se borra su ficha y sus datos. Si vuelve a aparecer en los comentarios o en una búsqueda, se creará de nuevo (para que no vuelva, usa Descartar).', 'Eliminar', true)) { removeCompetitor(c.id); toast(`«${c.name}» eliminado`) } }} />
                <IconButton size="sm" icon="block" label="Descartar: no es un competidor (no volverá a aparecer)" onClick={async () => { if (await confirmBox('¿Descartar este competidor?', `«${c.name}» se quitará y la IA no lo volverá a crear aunque aparezca en los comentarios.`, 'Descartar', true)) deleteCompetitor(c.id) }} />
              </div>
            ))}
          </div>
        )}
        {ignored.length > 0 && (
          <p className="mt-3 text-xs text-text-2">Descartados: {ignored.join(', ')} · <button className="font-medium text-primary" onClick={() => setComp({ ignored: [] })}>Volver a detectarlos</button></p>
        )}
      </Card>
      <BrandCard brand={brand} />
      <CompetitorDialog c={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

/* ---------- Historial ---------- */
export function CompHistoryTab() {
  const { list, loaded } = useCompHistory()
  useEffect(() => { if (!loaded) loadCompHistory() }, [loaded])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<{ html: string; title: string; file: string; model?: CompModel } | null>(null)
  const shown = list.filter((r) => (!from || r.to >= from) && (!to || r.from <= to))
  const ids = [...sel].filter((id) => shown.some((r) => r.id === id))
  const open = (r: SavedCompReport) => { const m = r.model as CompModel; setView({ html: compHtml(m), title: compTitle(m), file: compFileName(m.brand, m.generatedAt || r.createdAt), model: m }) }
  const consolidate = (rs: SavedCompReport[]) => {
    if (!rs.length) { toast('Elige informes o un rango de fechas con informes'); return }
    const brand = (rs[0].model as CompModel).brand
    setView({ html: consolidatedHtml(rs), title: `Informe consolidado de la competencia y redes sociales - ${brand}`, file: `Informe consolidado de la competencia y redes sociales - ${brand}-${stamp(Date.now())}` })
  }
  const sorted = useMemo(() => shown, [shown])
  if (view) return <CompReportView {...view} dashboard={view.model ? <CompDashboard m={view.model} /> : undefined} back={{ label: 'Volver al historial', onClick: () => setView(null) }} />
  if (loaded && !list.length) return <Card><Empty icon={<Icon name="radar" />} title="Aún no hay informes de competencia">Créalos en la sección Competencia; quedan guardados aquí para analizarlos después.</Empty></Card>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-2">Desde<Input type="date" className="!h-10" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-text-2">Hasta<Input type="date" className="!h-10" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(from || to) && <Button variant="outlined" icon="summarize" className="self-end" onClick={() => consolidate(shown)}>Consolidado del periodo ({shown.length})</Button>}
        <span className="flex-1" />
        {ids.length > 0 && <>
          <Button icon="summarize" onClick={() => consolidate(shown.filter((r) => sel.has(r.id)))}>Consolidado ({ids.length})</Button>
          <Button variant="text" className="!text-error" onClick={async () => { if (await confirmBox('¿Eliminar informes?', `Se eliminarán ${ids.length} informe(s) de competencia.`, 'Eliminar', true)) { await deleteCompReports(ids); setSel(new Set()) } }}>Eliminar</Button>
        </>}
      </div>
      {sorted.length > 0 && (
        <label className="flex items-center gap-3 pl-[17px] text-sm text-text-2">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" aria-label="Seleccionar todos" checked={sorted.every((r) => sel.has(r.id))}
            ref={(el) => { if (el) el.indeterminate = ids.length > 0 && ids.length < sorted.length }}
            onChange={(e) => setSel(e.target.checked ? new Set(sorted.map((r) => r.id)) : new Set())} />
          {ids.length ? `${ids.length} de ${sorted.length} seleccionado${ids.length === 1 ? '' : 's'}` : 'Seleccionar todos'}
        </label>
      )}
      <div className="divide-y divide-outline-2 rounded-3xl border border-outline-2 bg-surface">
        {sorted.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(r.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(r.id) : s.delete(r.id); setSel(s) }} aria-label="Seleccionar informe" />
            <div className="min-w-48 flex-1">
              <div className="truncate font-medium">Competencia {r.brand} · {r.from === r.to ? new Date(r.from + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : `${new Date(r.from + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${new Date(r.to + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`}</div>
              <div className="truncate text-xs text-text-2">{r.headline} · creado {new Date(r.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
            <IconButton icon="visibility" label="Ver informe" onClick={() => open(r)} />
            <IconButton icon="delete" label="Eliminar" onClick={async () => { if (await confirmBox('¿Eliminar el informe?', 'Se borrará del historial.', 'Eliminar', true)) deleteCompReports([r.id]) }} />
          </div>
        ))}
        {!sorted.length && <p className="p-6 text-center text-text-2">No hay informes en esas fechas.</p>}
      </div>
    </div>
  )
}
