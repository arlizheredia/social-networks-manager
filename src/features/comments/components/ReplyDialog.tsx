import { useEffect, useState } from 'react'
import { Banner, Button, Dialog, Field, Icon, IconButton, Input, Switch, Textarea, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { copyText } from '@/lib/util'
import { useAI } from '@/features/ai/engine'
import { normName } from '../db'
import { aiReplies, fillTemplate, markAnswered, suggestScore, useExplore } from '../explore'
import { setPrefs, usePrefs } from '../prefs'
import type { Comment } from '../types'

/** Equipo que responde: sus comentarios cuentan como respuesta de la marca. */
export function TeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs()
  const comments = useExplore((s) => s.comments)
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const has = (n: string) => prefs.team.some((m) => normName(m.name) === normName(n))
  const add = (n: string) => { n = n.trim(); if (!n || has(n)) return; setPrefs({ team: [...prefs.team, { name: n }] }); toast(`«${n}» añadido al equipo`) }
  const people = Object.entries(comments.reduce<Record<string, number>>((m, c) => { if (c.authorName) m[c.authorName] = (m[c.authorName] || 0) + 1; return m }, {}))
    .filter(([n]) => !q || normName(n).includes(normName(q))).sort((a, b) => b[1] - a[1]).slice(0, 60)
  return (
    <Dialog open={open} onClose={onClose} title="Equipo que responde" actions={<Button onClick={() => { onClose(); useExplore.setState({}) }}>Listo</Button>}>
      <p className="mb-3 text-text-2">Las personas del equipo responden en nombre de la marca: sus comentarios no cuentan como pendientes y lo que responden queda atendido.</p>
      <div className="mb-3 flex flex-wrap gap-2">{prefs.team.map((m) => <span key={m.name} className="inline-flex items-center gap-1 rounded-lg bg-secondary-container py-1 pr-1 pl-3 text-sm text-on-secondary-container">{m.name}<IconButton size="sm" icon="close" label={`Quitar ${m.name}`} onClick={() => setPrefs({ team: prefs.team.filter((x) => x.name !== m.name) })} /></span>)}</div>
      <div className="mb-3 flex gap-2"><div className="flex-1"><Input placeholder="Añadir por nombre o usuario" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { add(name); setName('') } }} /></div><Button onClick={() => { add(name); setName('') }}>Añadir</Button></div>
      <Switch label="Contar al autor de la publicación como equipo" checked={prefs.teamPostAuthor} onChange={(v) => setPrefs({ teamPostAuthor: v })} />
      <Switch label="Considerar pendientes también las respuestas entre usuarios" checked={prefs.teamAllReplies} onChange={(v) => setPrefs({ teamAllReplies: v })} />
      {comments.length > 0 && (
        <>
          <h3 className="mt-3 mb-2 text-base">Personas en los comentarios</h3>
          <Input icon="search" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 max-h-60 divide-y divide-outline-2 overflow-y-auto rounded-xl border border-outline-2">
            {people.map(([n, k]) => <div key={n} className="flex items-center gap-2 px-3 py-1.5"><span className="flex-1 truncate">{n}</span><span className="text-xs text-text-2">{k}</span>{has(n) ? <span className="text-xs text-success">En el equipo</span> : <Button size="sm" variant="text" onClick={() => add(n)}>Añadir</Button>}</div>)}
          </div>
        </>
      )}
    </Dialog>
  )
}

/** Responder comentarios uno a uno: catálogo, sugerencias de la IA, copiar y abrir, marcar como respondido. */
export function ReplyDialog({ queue, start, onClose }: { queue: Comment[]; start: number; onClose: () => void }) {
  const prefs = usePrefs()
  const aiReady = useAI((s) => s.installed)
  const [i, setI] = useState(start)
  const [text, setText] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [ai, setAi] = useState<{ for: string; items: string[]; loading: boolean } | null>(null)
  const [mention, setMention] = useState(true)
  const [q, setQ] = useState('')
  const c = queue[i]
  const opts = c ? [...prefs.replies].filter((r) => !q || normName(r.title + ' ' + r.text).includes(normName(q))).sort((a, b) => suggestScore(b, c) - suggestScore(a, c)) : []
  useEffect(() => { if (c && opts[0]) { setSel(opts[0].id); setText(fillTemplate(opts[0].text, c)) } else setText('') }, [c?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null
  const final = () => { let t = text.trim(); if (c.platform !== 'facebook' && mention) { const u = '@' + c.authorName.replace(/^@/, ''); if (!t.startsWith(u)) t = u + ' ' + t } return t }
  const next = () => { if (i + 1 < queue.length) setI(i + 1); else { toast('No quedan más comentarios pendientes en la lista'); onClose() } }
  const suggest = async () => {
    setAi({ for: c.id, items: [], loading: true })
    try { const items = await aiReplies(c); setAi({ for: c.id, items, loading: false }); if (items[0]) { setText(items[0]); setSel(null) } }
    catch (e) { setAi(null); toast('IA: ' + (e as Error).message) }
  }
  return (
    <Dialog open onClose={onClose} wide title={`Responder a ${c.authorName || 'comentario'}`}
      actions={<>
        <span className="mr-auto self-center text-xs text-text-2">Pendiente {i + 1} de {queue.length}</span>
        <Button variant="text" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</Button>
        <Button variant="text" onClick={next}>Omitir</Button>
        <Button variant="outlined" icon="done" onClick={() => { markAnswered(c, 'manual', sel || undefined); next() }}>Marcar como respondido</Button>
        <Button icon="open_in_new" disabled={!text.trim()} onClick={async () => { await copyText(final()); if (c.permalink) window.open(c.permalink, '_blank', 'noopener'); toast('Respuesta copiada: pégala en el comentario'); markAnswered(c, 'manual', sel || undefined); next() }}>Copiar y abrir</Button>
      </>}>
      <blockquote className="mb-4 rounded-2xl bg-surface-2 p-3"><div className="mb-1 text-xs text-text-2">{c.authorName} · {c.sentiment}{c.isQuestion ? ' · pregunta' : ''}</div><div className="whitespace-pre-wrap">{c.text}</div></blockquote>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2"><h3 className="flex-1 text-base">Respuestas</h3>
            <Button size="sm" variant="tonal" icon={ai?.loading ? 'progress_activity' : 'auto_awesome'} disabled={!aiReady || ai?.loading} onClick={suggest} title={aiReady ? '' : 'Instala la IA de la app'}>Sugerir con IA</Button>
          </div>
          <Input icon="search" placeholder="Buscar respuesta" value={q} onChange={(e) => setQ(e.target.value)} className="!h-10" />
          <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto" role="listbox">
            {ai?.for === c.id && ai.items.map((t, k) => (
              <button key={'ai' + k} role="option" aria-selected={text === t} onClick={() => { setText(t); setSel(null) }} className={cn('block w-full rounded-xl border p-2 text-left text-sm', text === t ? 'border-primary bg-primary-container/40' : 'border-outline-2 hover:bg-text/4')}>
                <span className="mb-0.5 flex items-center gap-1 text-xs text-primary"><Icon name="auto_awesome" fill className="!text-[14px]" />IA · Sugerencia {k + 1}</span>{t}
              </button>
            ))}
            {opts.map((r, k) => (
              <button key={r.id} role="option" aria-selected={sel === r.id} onClick={() => { setSel(r.id); setText(fillTemplate(r.text, c)) }} className={cn('block w-full rounded-xl border p-2 text-left text-sm', sel === r.id ? 'border-primary bg-primary-container/40' : 'border-outline-2 hover:bg-text/4')}>
                <span className="mb-0.5 block text-xs font-medium">{r.title}{k === 0 && suggestScore(r, c) > 0 ? ' · Sugerida' : ''}</span><span className="text-text-2">{fillTemplate(r.text, c)}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Field label="Tu respuesta" hint={`${[...text].length} caracteres`}><Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          {c.platform !== 'facebook' && <Switch label={`Empezar con @${c.authorName.replace(/^@/, '')}`} checked={mention} onChange={setMention} />}
          <Button variant="text" size="sm" icon="bookmark_add" disabled={!text.trim()} onClick={() => {
            const name = c.authorName.replace(/^@/, ''), first = name.split(/\s+/)[0]
            const t = text.split(name).join('{nombre}').split(first).join('{nombre_pila}')
            setPrefs({ replies: [...prefs.replies, { id: 'u' + Date.now().toString(36), title: t.slice(0, 40), text: t, tags: [c.isQuestion ? 'pregunta' : c.sentiment] }] }); toast('Guardada en el catálogo')
          }}>Guardar en el catálogo</Button>
          <Banner tone="info" className="mt-3">Se copia la respuesta y se abre el comentario en la red para que la pegues y publiques con tu cuenta.</Banner>
        </div>
      </div>
    </Dialog>
  )
}
