import { useState } from 'react'
import { Card, Icon } from '@/components/ui'
import { RankBars } from '@/components/charts/Charts'
import { cn } from '@/lib/cn'
import { fmtNum, fmtRelative } from '@/lib/util'
import { impactGroups, impactOf, topAuthorsBy } from '../analysis'
import type { Comment, Sentiment } from '../types'

const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`

function Quote({ c }: { c: Comment }) {
  return (
    <div className="text-sm">
      <p className="whitespace-pre-wrap text-text">«{c.text.length > 320 ? c.text.slice(0, 317).trimEnd() + '…' : c.text}»</p>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-2">
        <span className="font-medium text-text">{c.authorName || 'Anónimo'}</span>
        {!!c.reactions && <span>{plural(c.reactions, 'reacción', 'reacciones')}</span>}
        {!!c.repliesCount && <span>{plural(c.repliesCount, 'respuesta', 'respuestas')}</span>}
        {c.createdAt && <span>{fmtRelative(Date.parse(c.createdAt))}</span>}
        {c._post && <span className="max-w-60 truncate">· {c._post}</span>}
        {c.permalink && <a href={c.permalink} target="_blank" rel="noopener">Ver comentario</a>}
      </div>
    </div>
  )
}

/**
 * Comentarios positivos o negativos de mayor impacto (reacciones y respuestas), agrupados por parecido,
 * y las personas que más comentan de ese tipo.
 */
export function ImpactSection({ list, sent, onPerson }: { list: Comment[]; sent: Extract<Sentiment, 'positivo' | 'negativo'>; onPerson: (name: string) => void }) {
  const pos = sent === 'positivo'
  const groups = impactGroups(list, sent, 5)
  const people = topAuthorsBy(list, sent, 6)
  const total = list.filter((c) => !c.isTeam && c.sentiment === sent).length
  const [open, setOpen] = useState<number | null>(null)
  if (!total) return null
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full text-white')} style={{ background: pos ? 'var(--viz-pos)' : 'var(--viz-neg)' }}>
          <Icon name={pos ? 'thumb_up' : 'thumb_down'} className="!text-[20px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg text-text">{pos ? 'Comentarios positivos de mayor impacto' : 'Comentarios negativos de mayor impacto'}</h3>
          <p className="text-xs text-text-2">
            {plural(total, pos ? 'comentario positivo' : 'comentario negativo', pos ? 'comentarios positivos' : 'comentarios negativos')} del público.
            El impacto suma las reacciones y las respuestas; los comentarios parecidos se agrupan.
          </p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ol className="space-y-3">
          {groups.map((g, i) => (
            <li key={g.rep.id} className="rounded-2xl border-l-4 bg-surface-2 p-3" style={{ borderColor: pos ? 'var(--viz-pos)' : 'var(--viz-neg)' }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-text-2">
                <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-medium text-text">#{i + 1}</span>
                <span>Impacto <b className="font-medium text-text">{fmtNum(g.impact)}</b></span>
                {g.items.length > 1 && <span>· {plural(g.items.length, 'comentario parecido', 'comentarios parecidos')} de {plural(g.authors, 'persona', 'personas')}</span>}
              </div>
              <Quote c={g.rep} />
              {g.items.length > 1 && (
                <>
                  <button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                    <Icon name={open === i ? 'expand_less' : 'expand_more'} className="!text-[18px]" />{open === i ? 'Ocultar' : 'Ver'} los {g.items.length - 1} parecidos
                  </button>
                  {open === i && (
                    <div className="mt-2 space-y-2 border-t border-outline-2 pt-2">
                      {g.items.slice(1).sort((a, b) => impactOf(b) - impactOf(a)).map((c) => <Quote key={c.id} c={c} />)}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        <div>
          <h4 className="mb-1 text-sm font-medium text-text">{pos ? 'Quiénes más comentan a favor' : 'Quiénes más critican'}</h4>
          <p className="mb-3 text-xs text-text-2">Pulsa un nombre para ver todos sus comentarios.</p>
          <RankBars unit={pos ? 'comentarios positivos' : 'comentarios negativos'} onClick={onPerson} color={pos ? 'var(--viz-pos)' : 'var(--viz-neg)'}
            rows={people.map((p) => ({ key: p.name, label: p.name, value: p.count, sub: plural(p.reactions, 'reacción', 'reacciones') }))} />
        </div>
      </div>
    </Card>
  )
}
