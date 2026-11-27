import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, MenuItem, PageHead, Popover, Tabs, toast } from '@/components/ui'
import { copyText } from '@/lib/util'
import { TrackingPanel } from '@/features/comments/components/Tracking'
import { Obtain } from '@/features/comments/components/Obtain'
import { Summary } from '@/features/comments/components/Summary'
import { CommentList } from '@/features/comments/components/CommentList'
import { clearExplore, filtered, restoreExplore, setPeople, useExplore } from '@/features/comments/explore'
import { exportComments, exportReport, toTable, toText } from '@/features/comments/exports'
import { usePrefs } from '@/features/comments/prefs'
import { platName } from '@/features/comments/text'
import { useTR } from '@/features/comments/tracking'

type Tab = 'seguimiento' | 'explorar'

function Explore() {
  const s = useExplore()
  const semLevel = usePrefs((p) => p.semLevel)
  const [view, setView] = useState<'list' | 'summary'>('summary')
  const [obtain, setObtain] = useState(false)
  useEffect(() => { restoreExplore() }, [])
  // solo al abrir otros comentarios se vuelve al resumen (responder o recalcular no cambia de pestaña)
  useEffect(() => { setObtain(false); setView('summary') }, [s.loadId])
  if (!s.comments.length || obtain) return <Obtain />
  const list = filtered(s, semLevel).list
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl">{s.meta?.title || 'Publicación'}</h2>
          <div className="flex flex-wrap gap-x-3 text-xs text-text-2">
            {s.meta?.platform && <span>{platName(s.meta.platform)}</span>}
            {s.meta?.postAuthor && <span>· {s.meta.postAuthor}</span>}
            {s.meta?.source && <span>· {s.meta.source}</span>}
            {s.meta?.extractedAt && <span>· Obtenido el {new Date(s.meta.extractedAt).toLocaleString('es')}</span>}
            {s.meta?.url && <a href={s.meta.url} target="_blank" rel="noopener">· Ver publicación</a>}
          </div>
        </div>
        <Popover align="right" trigger={(o) => <Button variant="outlined" icon="content_copy" onClick={o}>Copiar</Button>}>
          {(close) => <>
            <div className="px-3 py-1 text-xs text-text-2">Se usarán los {list.length} comentarios filtrados</div>
            <MenuItem icon="table" onClick={async () => { close(); toast((await copyText(toTable(list, '\t'))) ? 'Copiado: pégalo en Excel o Sheets' : 'No se pudo copiar') }}>Como tabla (Excel / Sheets)</MenuItem>
            <MenuItem icon="notes" onClick={async () => { close(); toast((await copyText(toText(list))) ? 'Copiado' : 'No se pudo copiar') }}>Como texto legible</MenuItem>
          </>}
        </Popover>
        <Popover align="right" trigger={(o) => <Button variant="outlined" icon="download" onClick={o}>Exportar</Button>}>
          {(close) => <>
            <div className="px-3 pt-1 pb-0.5 text-xs text-text-2">Informe</div>
            <MenuItem icon="description" onClick={() => { close(); exportReport('word', list, s.meta) }}>Informe Word (.doc)</MenuItem>
            <MenuItem icon="picture_as_pdf" onClick={() => { close(); exportReport('pdf', list, s.meta) }}>Informe PDF</MenuItem>
            <MenuItem icon="html" onClick={() => { close(); exportReport('html', list, s.meta) }}>Informe HTML</MenuItem>
            <div className="my-1 h-px bg-outline-2" />
            <div className="px-3 pt-1 pb-0.5 text-xs text-text-2">Comentarios</div>
            <MenuItem icon="table_view" onClick={() => { close(); exportComments('csv', list, s.meta) }}>Excel / CSV</MenuItem>
            <MenuItem icon="data_object" onClick={() => { close(); exportComments('json', list, s.meta) }}>JSON</MenuItem>
            <MenuItem icon="description" onClick={() => { close(); exportComments('txt', list, s.meta) }}>Texto (.txt)</MenuItem>
          </>}
        </Popover>
        <Popover align="right" trigger={(o) => <Button variant="text" icon="more_vert" onClick={o} aria-label="Más opciones" />}>
          {(close) => <>
            <MenuItem icon="add" onClick={() => { close(); setObtain(true) }}>Analizar otra publicación</MenuItem>
            <MenuItem icon="delete" danger onClick={() => { close(); clearExplore(); toast('Datos borrados') }}>Borrar estos datos</MenuItem>
          </>}
        </Popover>
      </div>
      <Tabs value={view} onChange={setView} tabs={[{ id: 'summary', label: 'Resumen', icon: 'insights' }, { id: 'list', label: 'Comentarios', icon: 'forum', badge: s.comments.length.toLocaleString('es') }]} />
      {view === 'summary' ? <Summary list={s.comments} platform={s.meta?.platform || 'facebook'} onSearch={(q) => { setPeople([q.replace(/^@/, '')]); useExplore.setState({ sem: null }); setView('list') }} /> : <CommentList />}
    </div>
  )
}

export default function CommentsPage() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const tab: Tab = pathname.includes('/explorar') ? 'explorar' : 'seguimiento'
  const running = useTR((s) => s.runs.length > 0)
  const n = useExplore((s) => s.comments.length)
  return (
    <div>
      <PageHead title="Comentarios" sub="Obtén, analiza y responde los comentarios de Facebook, Instagram y TikTok." />
      <Tabs value={tab} onChange={(t) => nav(t === 'explorar' ? '/comentarios/explorar' : '/comentarios')} tabs={[
        { id: 'seguimiento', label: 'Seguimiento', icon: running ? 'progress_activity' : 'track_changes' },
        { id: 'explorar', label: 'Analizar y responder', icon: 'insights', badge: n || undefined },
      ]} />
      {tab === 'seguimiento' ? <TrackingPanel /> : <Explore />}
    </div>
  )
}
