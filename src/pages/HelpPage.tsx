import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Empty, Icon, Input, PageHead } from '@/components/ui'
import { cn } from '@/lib/cn'
import { HELP, HELP_CATS } from './help'

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function HelpPage() {
  const { article } = useParams()
  const [q, setQ] = useState('')
  const list = useMemo(() => { const n = norm(q.trim()); return n ? HELP.filter((a) => norm(a.title + ' ' + a.body.replace(/<[^>]+>/g, ' ')).includes(n)) : HELP }, [q])
  useEffect(() => { if (article) requestAnimationFrame(() => document.getElementById('help-' + article)?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }, [article])
  return (
    <div>
      <PageHead title="Centro de Ayuda" sub="Guías y respuestas para sacar partido a la app." />
      <div className="mb-6 max-w-xl"><Input icon="search" placeholder="Buscar en la ayuda" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden self-start lg:sticky lg:top-20 lg:block" aria-label="Índice">
          {HELP_CATS.map((c) => { const it = list.filter((a) => a.cat === c); return it.length ? (
            <div key={c} className="mb-3"><div className="mb-1 px-3 text-xs font-medium text-text-2">{c}</div>
              {it.map((a) => <Link key={a.id} to={`/ayuda/${a.id}`} className={cn('block rounded-full px-3 py-1.5 text-sm no-underline', article === a.id ? 'bg-secondary-container text-on-secondary-container' : 'text-text hover:bg-text/8')}>{a.title}</Link>)}
            </div>
          ) : null })}
        </nav>
        <div className="space-y-4">
          {q && <p className="text-sm text-text-2">{list.length} artículo{list.length === 1 ? '' : 's'} para «{q}»</p>}
          {list.length ? list.map((a) => (
            <article key={a.id} id={'help-' + a.id} className={cn('scroll-mt-20 rounded-3xl border bg-surface p-6', article === a.id ? 'border-primary' : 'border-outline-2')}>
              <h2 className="mb-3 flex items-center gap-2 text-xl"><Icon name={a.icon} className="text-primary" />{a.title}</h2>
              <div className="help-body text-text-2" dangerouslySetInnerHTML={{ __html: a.body }} />
            </article>
          )) : <Empty icon={<Icon name="search_off" />} title="Sin resultados">Prueba con otras palabras, por ejemplo «marcador», «IA» o «informe».</Empty>}
        </div>
      </div>
    </div>
  )
}
