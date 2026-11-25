import { Card, Icon, Stat } from '@/components/ui'
import { fmtNum } from '@/lib/util'
import { activity, computeStats } from '../analysis'
import { PLATFORMS } from '../text'
import type { Comment, Platform } from '../types'

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + ' %' : '—')

function Bars({ data, label }: { data: { label: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n))
  return (
    <div className="flex h-36 items-end gap-0.5" role="img" aria-label={label}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex min-w-0 flex-1 flex-col justify-end" title={`${d.label}: ${d.n}`}>
          <div className="rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 2 : 0 }} />
        </div>
      ))}
    </div>
  )
}

/** Resumen del análisis: indicadores, sentimiento, actividad, autores, palabras y emojis. */
export function Summary({ list, platform, onSearch }: { list: Comment[]; platform: Platform; onSearch: (q: string) => void }) {
  const st = computeStats(list)
  const act = activity(list)
  const s = { pos: st.pos, neu: st.neu, neg: st.neg }
  const T = Math.max(1, st.total)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Comentarios revisados" value={fmtNum(st.total)} icon={<Icon name="forum" />} />
        <Stat label="Autores únicos" value={fmtNum(st.uniqueAuthors)} icon={<Icon name="group" />} />
        <Stat label={PLATFORMS[platform]?.reactLabel ?? 'Reacciones'} value={fmtNum(st.reacts)} icon={<Icon name="favorite" />} />
        <Stat label="Preguntas" value={fmtNum(st.q)} icon={<Icon name="help" />} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-base">Sentimiento estimado</h3>
          <div className="flex h-3 overflow-hidden rounded-full">
            <i className="bg-success" style={{ width: `${(s.pos / T) * 100}%` }} /><i className="bg-outline-2" style={{ width: `${(s.neu / T) * 100}%` }} /><i className="bg-error" style={{ width: `${(s.neg / T) * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span><b className="text-success">{fmtNum(s.pos)}</b> positivos ({pct(s.pos, st.total)})</span>
            <span><b>{fmtNum(s.neu)}</b> neutrales</span>
            <span><b className="text-error">{fmtNum(s.neg)}</b> negativos ({pct(s.neg, st.total)})</span>
          </div>
          <p className="mt-2 text-xs text-text-3">Orientativo: se estima con un diccionario de palabras y emojis. Puedes corregir la polaridad de cada comentario.</p>
        </Card>
        <Card>
          <h3 className="mb-2 text-base">Comentarios por {act.per}{act.approx && <span className="ml-2 rounded bg-warn-container px-1.5 text-xs text-warn">≈ aproximado</span>}</h3>
          {act.buckets.length ? <Bars data={act.buckets} label={`Comentarios por ${act.per}`} /> : <p className="text-text-2">Sin fechas.</p>}
        </Card>
        <Card>
          <h3 className="mb-2 text-base">Autores más activos</h3>
          <ol className="space-y-1">{st.authors.slice(0, 8).map((a) => (
            <li key={a.name}><button className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-text/8" onClick={() => onSearch('@' + a.name)}><span className="min-w-0 flex-1 truncate">{a.name}</span><b className="tabular-nums">{a.count}</b></button></li>
          ))}</ol>
        </Card>
        <Card>
          <h3 className="mb-2 text-base">Palabras más frecuentes</h3>
          <div className="flex flex-wrap gap-1.5">{st.words.slice(0, 24).map(([w, n]) => <span key={w} className="rounded-lg bg-surface-2 px-2 py-0.5 text-sm">{w} <b className="text-text-2">{n}</b></span>)}</div>
          {!!st.emojis.length && <><h3 className="mt-4 mb-2 text-base">Emojis</h3><div className="flex flex-wrap gap-2 text-lg">{st.emojis.slice(0, 12).map(([e, n]) => <span key={e}>{e}<sub className="text-xs text-text-2">{n}</sub></span>)}</div></>}
          {!!st.hashtags.length && <><h3 className="mt-4 mb-2 text-base">Hashtags</h3><div className="flex flex-wrap gap-1.5">{st.hashtags.map(([w, n]) => <span key={w} className="text-sm text-fb">{w} ({n})</span>)}</div></>}
        </Card>
      </div>
    </div>
  )
}
