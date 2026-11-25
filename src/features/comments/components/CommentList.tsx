import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, Icon, IconButton, Input, MenuItem, Popover, Select, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText, fmtRelative } from '@/lib/util'
import { useAI } from '@/features/ai/engine'
import { NeedsAI } from '@/features/ai/AIDialog'
import { clearFilters, commenters, filtered, refreshTeam, runSearch, setPeople, setSentiment, toggleFilter, useExplore, type SearchMode } from '../explore'
import { setPrefs, usePrefs } from '../prefs'
import { SENT_LABEL, platName } from '../text'
import { focusName } from '../analysis'
import type { Comment, Sentiment } from '../types'
import { ReplyDialog, TeamDialog } from './ReplyDialog'

const SENT_CLS: Record<Sentiment, string> = { positivo: 'text-success', neutral: 'text-text-2', negativo: 'text-error' }
const PAGE = 100

function CommentCard({ c, depth, onReply, score }: { c: Comment; depth: number; onReply: (c: Comment) => void; score?: number }) {
  const [more, setMore] = useState(false)
  const flash = useExplore((x) => x.flash === c.id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (flash) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [flash])
  const long = c.text.length > 360 || c.text.split('\n').length > 5
  return (
    <div ref={ref} className={cn('flex gap-2.5 transition-shadow', flash && 'rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-surface', depth > 0 && 'ml-6 sm:ml-12', c.needsTeam && 'rounded-2xl border-l-4 border-warn bg-warn-container/45 py-2 pr-2 pl-2')}>
      {c.authorAvatar ? <img src={c.authorAvatar} alt="" className="size-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" /> : <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-medium">{(c.authorName || '?').replace(/^@/, '').slice(0, 1).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <div className={cn('inline-block max-w-full rounded-2xl px-3 py-2', c.isTeam ? 'bg-primary-container text-on-primary-container' : 'bg-surface-2')}>
          <div className="text-[13px] font-medium">{c.authorName || '(sin nombre)'}{c.isTeam && <span className="ml-1 text-xs">· equipo</span>}</div>
          <div className={cn('text-[15px] leading-5 whitespace-pre-wrap break-words', !more && long && 'line-clamp-5')}>{c.text || <i className="text-text-3">(sin texto)</i>}</div>
          {long && <button className="text-xs font-medium text-primary" onClick={() => setMore(!more)}>{more ? 'Ver menos' : 'Ver más'}</button>}
          {!!c.attachments.length && <div className="mt-1 flex gap-1">{c.attachments.filter((a) => a.url).slice(0, 3).map((a, i) => <a key={i} href={a.url} target="_blank" rel="noopener" className="text-xs">📎 {a.type}</a>)}</div>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-text-2">
          <span title={c.createdAt ? new Date(c.createdAt).toLocaleString('es') : c.dateText}>{c.createdAt ? (c.dateApprox ? '≈ ' : '') + fmtRelative(Date.parse(c.createdAt)) : c.dateText}</span>
          {!!c.reactions && <span>❤ {c.reactions}</span>}
          <Popover trigger={(o) => <button onClick={o} className={cn('font-medium', SENT_CLS[c.sentiment])} title={c.sentimentFrom ? `Motivo: ${c.sentimentFrom}` : 'Cambiar polaridad'}>{SENT_LABEL[c.sentiment]}{c.sentimentManual ? ' ✎' : ''}</button>}>
            {(close) => <>
              {(['positivo', 'neutral', 'negativo'] as Sentiment[]).map((s) => <MenuItem key={s} onClick={() => { setSentiment(c, s); close() }}>{SENT_LABEL[s]}</MenuItem>)}
              {c.sentimentManual && <MenuItem icon="undo" onClick={() => { setSentiment(c, null); close() }}>Automática</MenuItem>}
            </>}
          </Popover>
          {c._post && <span className="max-w-48 truncate">· {c._post}</span>}
          {score != null && <span className="text-primary">relevancia {Math.round(score * 100)}</span>}
          {c.teamAnswered && !c.isTeam && <span className="text-success">✓ Respondido</span>}
          <button onClick={async () => toast((await copyText(c.text)) ? 'Texto copiado' : 'No se pudo copiar')}>Copiar</button>
          {c.permalink && <a href={c.permalink} target="_blank" rel="noopener">Ver en {platName(c.platform)}</a>}
          {c.needsTeam && <span className="inline-flex items-center gap-1 font-medium text-warn" title="Trata del enfoque de tus informes y nadie del equipo lo ha respondido"><Icon name="mark_chat_unread" className="!text-[16px]" />Requiere respuesta</span>}
          {!c.isTeam && !c.needsTeam && <button className="inline-flex items-center gap-0.5" onClick={() => onReply(c)}><Icon name="reply" className="!text-[16px]" />Responder</button>}
        </div>
      </div>
      {/* responde con el asistente de la app (catálogo, sugerencias de la IA, copiar y abrir) */}
      {c.needsTeam && (
        <button type="button" onClick={() => onReply(c)} aria-label={`Responder a ${c.authorName || 'este comentario'}`} title="Responder"
          className="grid size-10 shrink-0 place-items-center self-center rounded-full bg-warn/15 text-warn transition-colors hover:bg-warn/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn">
          <Icon name="reply" className="!text-[20px]" />
        </button>
      )}
    </div>
  )
}

/** Filtro por persona: selector múltiple de quienes comentan (en la publicación elegida). */
function PeopleFilter() {
  const s = useExplore()
  const [q, setQ] = useState('')
  const all = commenters(s)
  const list = q.trim() ? all.filter(([n]) => n.toLowerCase().includes(q.trim().toLowerCase())) : all
  const sel = s.f.people
  const toggle = (n: string) => { const x = new Set(sel); x.has(n) ? x.delete(n) : x.add(n); setPeople([...x]) }
  const label = !sel.size ? 'Todas las personas' : sel.size === 1 ? [...sel][0] : `${sel.size} personas`
  return (
    <Popover className="w-80" trigger={(o, isOpen) => (
      <button type="button" onClick={o} aria-expanded={isOpen} className={cn('snm-select inline-flex h-8 max-w-60 items-center gap-1.5 rounded-lg border pr-10 pl-3 text-[13px] font-medium', sel.size ? 'border-transparent bg-secondary-container text-on-secondary-container' : 'border-outline-2 text-text-2')}>
        <Icon name="group" className="!text-[18px]" /><span className="truncate">{label}</span>
      </button>
    )}>
      {() => (
        <div className="p-1">
          <Input icon="search" className="!h-10" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="mt-2 flex items-center justify-between px-1 text-xs text-text-2">
            <span>{all.length.toLocaleString('es')} personas{s.f.post.size ? ' en esta publicación' : ''}</span>
            {sel.size > 0 && <button className="font-medium text-primary" onClick={() => setPeople([])}>Quitar ({sel.size})</button>}
          </div>
          <div className="mt-1 max-h-72 overflow-y-auto">
            {list.slice(0, 300).map(([n, k]) => (
              <label key={n} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-text/8">
                <input type="checkbox" className="size-4 shrink-0 accent-[var(--primary)]" checked={sel.has(n)} onChange={() => toggle(n)} />
                <span className="min-w-0 flex-1 truncate text-sm">{n}</span>
                <span className="text-xs text-text-2 tabular-nums">{k}</span>
              </label>
            ))}
            {!list.length && <p className="px-2 py-3 text-sm text-text-2">Nadie coincide con la búsqueda.</p>}
          </div>
        </div>
      )}
    </Popover>
  )
}

/** Comentarios en forma de conversación, con búsqueda por IA y filtros. */
export function CommentList() {
  const s = useExplore()
  const semLevel = usePrefs((p) => p.semLevel)
  const aiReady = useAI((a) => a.installed)
  const [showF, setShowF] = useState(false)
  const [page, setPage] = useState(1)
  const [reply, setReply] = useState<Comment[] | null>(null)
  const [team, setTeam] = useState(false)
  const { list, tops, kids } = useMemo(() => filtered(s, semLevel), [s, semLevel])
  useEffect(() => setPage(1), [s.f, s.sem, s.sort])
  // un filtro por persona aplicado desde el Resumen abre el panel de filtros para que se vea
  useEffect(() => { if (s.f.people.size) setShowF(true) }, [s.f.people])
  const pending = s.comments.filter((c) => c.needsTeam)
  const posts = useMemo(() => { const m = new Map<string, string>(); s.comments.forEach((c) => { if (c._ref?.postId) m.set(c._ref.postId, c._post || c._ref.postId) }); return [...m] }, [s.comments])
  const nF = s.f.type.size + s.f.sent.size + s.f.extra.size + s.f.post.size + (s.f.people.size ? 1 : 0)
  const rows: { c: Comment; d: number }[] = []
  const walk = (c: Comment, d: number) => { rows.push({ c, d }); (kids[c.id] || []).forEach((k) => walk(k, Math.min(d + 1, 2))) }
  tops.slice(0, page * PAGE).forEach((c) => walk(c, 0))
  const startReply = () => {
    if (!s.teamOn) { setTeam(true); toast('Primero añade a las personas de tu equipo'); return }
    const q = list.filter((c) => c.needsTeam)
    const l = q.length ? q : pending
    if (!l.length) { toast('No hay comentarios pendientes'); return }
    setReply(l)
  }
  const placeholder = s.mode === 'sem' ? 'Describe el tema y pulsa Intro (p. ej.: quejas por demoras en la entrega)' : 'Criterio para la IA y pulsa Intro (p. ej.: se refieren a la marca)'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Icon name="auto_awesome" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 !text-[20px] text-text-2" />
          <input className="h-12 w-full rounded-full border border-outline bg-surface pr-4 pl-10 focus:border-primary focus:outline-2 focus:outline-primary" placeholder={placeholder} value={s.q}
            onChange={(e) => useExplore.setState({ q: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (!aiReady) { toast('Primero instala la IA de la app'); return } runSearch() } }} />
        </div>
        <Select className="!w-auto" value={s.mode} onChange={(e) => useExplore.setState({ mode: e.target.value as SearchMode, sem: null })} aria-label="Tipo de búsqueda">
          <option value="sem">Por significado (IA)</option><option value="ai">Clasificar con IA</option>
        </Select>
        <Button variant={showF || nF ? 'tonal' : 'outlined'} icon="filter_list" onClick={() => setShowF(!showF)}>Filtros{nF ? ` (${nF})` : ''}</Button>
      </div>
      {!aiReady && <NeedsAI what="La búsqueda por significado" />}
      {s.sem && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-primary-container px-4 py-2 text-on-primary-container">
          <Icon name="psychology" />
          <span className="flex-1">{s.sem.mode === 'ai' ? `${list.length} comentario(s) cumplen «${s.sem.q}» según la IA.` : `${list.length} comentario(s) relacionados con «${s.sem.q}», ordenados por relevancia.`}</span>
          {s.sem.mode === 'sem' && <Select className="!h-8 !w-auto text-xs" value={semLevel} onChange={(e) => setPrefs({ semLevel: +e.target.value })}><option value={0.8}>Amplia</option><option value={0.825}>Media</option><option value={0.85}>Estricta</option></Select>}
          <Button size="sm" variant="text" onClick={() => useExplore.setState({ sem: null, q: '' })}>Quitar</Button>
        </div>
      )}
      {showF && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-surface-2 p-3">
          {posts.length > 1 && <Select className="!h-8 !w-auto max-w-60 text-xs" value={[...s.f.post][0] || ''} onChange={(e) => { const post = new Set(e.target.value ? [e.target.value] : []); const inPost = new Set(s.comments.filter((c) => !post.size || post.has(c._ref?.postId || '')).map((c) => c.authorName)); useExplore.setState({ f: { ...s.f, post, people: new Set([...s.f.people].filter((p) => inPost.has(p))) } }) }}><option value="">Todas las publicaciones</option>{posts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select>}
          <PeopleFilter />
          <Chip selected={s.f.type.has('comment')} onClick={() => toggleFilter('type', 'comment')}>Comentarios</Chip>
          <Chip selected={s.f.type.has('reply')} onClick={() => toggleFilter('type', 'reply')}>Respuestas</Chip>
          {(['positivo', 'neutral', 'negativo'] as Sentiment[]).map((x) => <Chip key={x} selected={s.f.sent.has(x)} onClick={() => toggleFilter('sent', x)}>{SENT_LABEL[x]}s</Chip>)}
          <Chip selected={s.f.extra.has('q')} onClick={() => toggleFilter('extra', 'q')}>Preguntas</Chip>
          <Chip selected={s.f.extra.has('react')} onClick={() => toggleFilter('extra', 'react')}>Con reacciones</Chip>
          <Chip selected={s.f.extra.has('noreply')} onClick={() => toggleFilter('extra', 'noreply')}>Sin responder</Chip>
          {s.teamOn && <Chip selected={s.f.extra.has('noteam')} onClick={() => toggleFilter('extra', 'noteam')}>Sin respuesta del equipo ({pending.length})</Chip>}
          {!!nF && <Button size="sm" variant="text" onClick={clearFilters}>Quitar filtros</Button>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-outline-2 bg-surface px-4 py-2">
        <Icon name="support_agent" className="text-primary" />
        <div className="min-w-40 flex-1 text-sm">
          <b className="font-medium">Asistente de respuestas</b>{' '}
          <span className="text-text-2">{s.teamOn ? `· ${pending.length} ${pending.length === 1 ? 'comentario requiere' : 'comentarios requieren'} respuesta` : '· define tu equipo para saber qué falta responder'}</span>
          {s.teamOn && s.focus && <div className="text-xs text-text-2">Los que tratan de «{focusName(s.focus.q)}» y nadie del equipo ha respondido{s.focus.ai ? '' : ' (por palabras clave; con la IA instalada también por significado)'}. El enfoque se cambia en Ajustes › Comentarios.</div>}
        </div>
        <Button size="sm" variant="text" icon="groups" onClick={() => setTeam(true)}>Equipo</Button>
        <Button size="sm" icon="reply_all" onClick={startReply}>Responder pendientes</Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-2">
        <span className="flex-1">{list.length.toLocaleString('es')} de {s.comments.length.toLocaleString('es')} coinciden · {tops.length.toLocaleString('es')} hilos</span>
        <Select className="!h-8 !w-auto text-xs" value={s.sort} onChange={(e) => useExplore.setState({ sort: e.target.value as typeof s.sort })} aria-label="Ordenar">
          <option value="idx">Orden original</option><option value="old">Más antiguos primero</option><option value="new">Más recientes primero</option><option value="react">Más reacciones</option><option value="replies">Más respuestas</option>
        </Select>
        <IconButton size="sm" icon="content_copy" label="Copiar los comentarios filtrados" onClick={async () => toast((await copyText(list.map((c) => `${c.authorName}: ${c.text}`).join('\n'))) ? `${list.length} comentarios copiados` : 'No se pudo copiar')} />
      </div>
      <div className="space-y-3 rounded-3xl border border-outline-2 bg-surface p-4">
        {rows.length ? rows.map(({ c, d }) => <CommentCard key={c.id + d} c={c} depth={d} onReply={(x) => setReply([x])} score={s.sem?.mode === 'sem' ? s.sem.scores.get(c.id) : undefined} />) : <p className="py-8 text-center text-text-2">Ningún comentario coincide con la búsqueda o los filtros.</p>}
        {tops.length > page * PAGE && <div className="text-center"><Button variant="outlined" onClick={() => setPage(page + 1)}>Ver más ({tops.length - page * PAGE} hilos)</Button></div>}
      </div>
      {reply && <ReplyDialog queue={reply} start={0} onClose={() => { setReply(null); refreshTeam() }} />}
      <TeamDialog open={team} onClose={() => { setTeam(false); refreshTeam() }} />
    </div>
  )
}
