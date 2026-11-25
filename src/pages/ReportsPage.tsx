import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banner, Button, Card, Chip, Dialog, Empty, Field, Icon, Input, MenuItem, PageHead, Popover, Select, Tabs, Textarea, toast, confirmBox } from '@/components/ui'
import { copyRich, copyText } from '@/lib/util'
import { downloadHtml, downloadWord, printPdf, reportTextToHtml } from '@/lib/docexport'
import { generate, useAI, withTask } from '@/features/ai/engine'
import { NeedsAI } from '@/features/ai/AIDialog'
import { buildReport, whatsappMessage, type ReportModel } from '@/features/comments/report'
import { reportHtml, reportPlainText } from '@/features/comments/reportHtml'
import { focusName, focusSubj } from '@/features/comments/analysis'
import { setPrefs, usePrefs } from '@/features/comments/prefs'
import { countTxt, inHistory, trackProgress, trackWhen, useTR } from '@/features/comments/tracking'
import { useExplore } from '@/features/comments/explore'
import { usePublisher } from '@/features/publisher/store'
import { buildDiffusionReport, entriesOn, longDate, ymd } from '@/features/publisher/report'
import { entryTitle } from '@/features/publisher/logic'

function WhatsAppDialog({ m, open, onClose }: { m: ReportModel; open: boolean; onClose: () => void }) {
  const prefs = usePrefs()
  const aiReady = useAI((s) => s.installed)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const sign = prefs.waSign || m.author
  useEffect(() => { if (open) setText(whatsappMessage(m, prefs.waTone) + (sign ? '\n\n— ' + sign : '')) }, [open, prefs.waTone, sign, m])
  const ai = async () => {
    setBusy(true)
    try {
      const tone = { cercano: 'cercano y profesional, en forma impersonal (por ejemplo, «se revisaron»)', formal: 'formal, en forma impersonal (por ejemplo, «se revisaron»)', breve: 'muy breve (2 o 3 frases), en forma impersonal' }[prefs.waTone]
      const sys = 'Eres un especialista en comunicación y redes sociales. Escribes mensajes para WhatsApp en español, claros y humanos, para personas sin conocimientos técnicos. Usa lenguaje sencillo. Nunca uses términos técnicos como "índice neto", "puntos", "KPI" o porcentajes complicados: habla de cantidades de comentarios. No menciones la inteligencia artificial. No inventes datos. Usa *negrita* de WhatsApp con moderación y como mucho 3 emojis. Responde solo con el mensaje.'
      const user = `Escribe un mensaje ${tone} para un canal de WhatsApp que acompañe un informe de comentarios en redes sociales. Incluye: cuántos comentarios se analizaron; cuántos hablan de ${m.focus ? focusSubj(m.focus.q) : m.terms.join(', ') || 'la marca'} y cuántos de esos son positivos y negativos; quiénes comentan en contra de la marca con dos o tres ejemplos breves de lo que dicen; y, de los positivos, solo quiénes son los que más comentan a favor. No des opiniones personales. Máximo 700 caracteres. Termina indicando que se adjunta el informe.${sign ? ' Firma: ' + sign + '.' : ''}\n\nMensaje base con los datos correctos (reescríbelo con naturalidad):\n${whatsappMessage(m, 'cercano')}`
      let t = (await withTask('Redactando el mensaje', (p) => generate(sys, user, { onProgress: p }))).replace(/^```\w*\n?|```$/g, '').trim()
      try { const j = JSON.parse(t); t = j.mensaje || j.message || t } catch { /* texto */ }
      if (!t) throw new Error('La IA no devolvió texto.')
      setText(t); toast('Redactado con la IA. Revísalo antes de enviarlo.')
    } catch (e) { toast('IA: ' + (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Mensaje para WhatsApp" icon={<Icon name="chat" className="text-success" />}
      actions={<><Button variant="text" icon="auto_awesome" disabled={!aiReady || busy} onClick={ai}>{busy ? 'Redactando…' : 'Redactar con IA'}</Button><Button variant="outlined" icon="open_in_new" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')}>Abrir en WhatsApp</Button><Button icon="content_copy" onClick={async () => toast((await copyText(text)) ? 'Mensaje copiado: pégalo en WhatsApp junto al informe' : 'No se pudo copiar')}>Copiar mensaje</Button></>}>
      <div className="mb-3 flex flex-wrap gap-3">
        <Field label="Tono" className="!mb-0"><Select value={prefs.waTone} onChange={(e) => setPrefs({ waTone: e.target.value as typeof prefs.waTone })}><option value="cercano">Cercano</option><option value="formal">Formal</option><option value="breve">Muy breve</option></Select></Field>
        <Field label="Firma" className="!mb-0 flex-1"><Input className="!h-10" value={prefs.waSign} placeholder={m.author} onChange={(e) => setPrefs({ waSign: e.target.value })} /></Field>
      </div>
      <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1 text-xs text-text-2">{[...text].length} caracteres</div>
    </Dialog>
  )
}

function CommentsReport() {
  const [params] = useSearchParams()
  const { tracks, running } = useTR()
  const prefs = usePrefs()
  const aiReady = useAI((s) => s.installed)
  const explore = useExplore()
  const done = tracks.filter((t) => inHistory(t) && running !== t.id)
  const [source, setSource] = useState<'tracks' | 'open'>('tracks')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [opts, setOpts] = useState({ ...prefs.report })
  const [model, setModel] = useState<ReportModel | null>(null)
  const [prog, setProg] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [wa, setWa] = useState(false)
  useEffect(() => {
    const t = params.get('t')
    const valid = (prefs.repSel || []).filter((id) => done.some((x) => x.id === id))
    setSel(new Set(t ? [t] : valid))
  }, [params, tracks.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const preset = (days: number | 'all' | 'none') => setSel(new Set(days === 'none' ? [] : done.filter((t) => days === 'all' || new Date(t.date + 'T12:00').getTime() > Date.now() - days * 864e5).map((t) => t.id)))
  const gen = async () => {
    setErr(''); setProg(`Buscando los comentarios sobre ${focusName(opts.focus)}…`)
    try {
      if (source === 'tracks') setPrefs({ repSel: [...sel] })
      const m = await withTask('Preparando el informe', async (p) => buildReport({
        tids: source === 'tracks' ? [...sel] : undefined, comments: source === 'open' ? explore.comments : undefined, title: source === 'open' ? explore.meta?.title : undefined,
        focus: opts.focus, terms: opts.terms.split(',').map((s) => s.trim()).filter(Boolean), author: opts.author, client: opts.client,
        onProgress: (a, b) => { p(a / b); setProg(`Buscando los comentarios sobre ${focusName(opts.focus)}… ${Math.round((a / b) * 100)} %`) },
      }))
      setModel(m)
    } catch (e) { setErr((e as Error).message) } finally { setProg(null) }
  }
  const html = useMemo(() => (model ? reportHtml(model) : ''), [model])
  const file = `informe-comentarios-${new Date().toISOString().slice(0, 10)}`
  const title = model ? `Informe de comentarios${model.focus ? ' sobre ' + model.focus.name : ''}` : ''

  if (model) return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="text" icon="arrow_back" onClick={() => setModel(null)}>Cambiar selección</Button>
        <span className="flex-1" />
        <Button variant="tonal" icon="chat" onClick={() => setWa(true)}>Mensaje para WhatsApp</Button>
        <Button variant="outlined" icon="content_copy" onClick={async () => toast((await copyRich(html, reportPlainText(html))) ? 'Informe copiado: pégalo en Word o en un correo' : 'No se pudo copiar')}>Copiar</Button>
        <Popover align="right" trigger={(o) => <Button icon="download" onClick={o}>Exportar</Button>}>
          {(close) => <>
            <MenuItem icon="description" onClick={() => { close(); downloadWord(file, title, html) }}>Word (.doc)</MenuItem>
            <MenuItem icon="picture_as_pdf" onClick={() => { close(); printPdf(title, html) }}>PDF (imprimir)</MenuItem>
            <MenuItem icon="html" onClick={() => { close(); downloadHtml(file, title, html) }}>Página web (.html)</MenuItem>
          </>}
        </Popover>
      </div>
      <article className="report-view rounded-3xl border border-outline-2 bg-surface p-6 sm:p-10" dangerouslySetInnerHTML={{ __html: html }} />
      <WhatsAppDialog m={model} open={wa} onClose={() => setWa(false)} />
    </div>
  )

  return (
    <Card>
      {!aiReady && <div className="mb-4"><NeedsAI what="El informe de comentarios" /></div>}
      <h3 className="mb-2 text-lg">¿De qué comentarios?</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip selected={source === 'tracks'} onClick={() => setSource('tracks')}>Seguimientos del historial ({done.length})</Chip>
        <Chip selected={source === 'open'} onClick={() => setSource('open')}>Los abiertos en «Analizar» ({explore.comments.length})</Chip>
      </div>
      {source === 'tracks' && (done.length ? (
        <>
          <div className="mb-2 flex flex-wrap gap-2"><Chip onClick={() => preset(7)}>Últimos 7 días</Chip><Chip onClick={() => preset(30)}>Últimos 30 días</Chip><Chip onClick={() => preset('all')}>Todos</Chip><Chip onClick={() => preset('none')}>Ninguno</Chip></div>
          <div className="mb-4 max-h-72 overflow-y-auto rounded-2xl border border-outline-2">
            {done.map((t) => { const pr = trackProgress(t); return (
              <label key={t.id} className="flex cursor-pointer items-center gap-3 border-b border-outline-2 px-3 py-2 last:border-0 hover:bg-text/4">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(t.id)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(t.id) : s.delete(t.id); setSel(s) }} />
                <div className="min-w-0"><div className="truncate">{t.name}</div><div className="text-xs text-text-2">{trackWhen(t)} · {countTxt(pr.n, 'publicación', 'publicaciones')} · {countTxt(pr.comments, 'comentario', 'comentarios')}</div></div>
              </label>
            ) })}
          </div>
        </>
      ) : <Empty icon={<Icon name="analytics" />} title="Todavía no hay seguimientos completados">Cuando termines alguno en Comentarios › Seguimiento diario, podrás elegirlo aquí.</Empty>)}
      {source === 'open' && !explore.comments.length && <p className="mb-4 text-text-2">No hay comentarios abiertos. Ábrelos en Comentarios › Analizar y responder.</p>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Enfoque del informe" hint="La IA buscará los comentarios que cumplen este criterio. Déjalo vacío para analizarlos todos."><Input value={opts.focus} onChange={(e) => setOpts({ ...opts, focus: e.target.value })} /></Field>
        <Field label="Temas a vigilar (opcional)" hint="Separados por comas."><Input value={opts.terms} onChange={(e) => setOpts({ ...opts, terms: e.target.value })} /></Field>
        <Field label="Elaborado por"><Input value={opts.author} onChange={(e) => { setOpts({ ...opts, author: e.target.value }); setPrefs({ report: { ...prefs.report, author: e.target.value } }) }} /></Field>
        <Field label="Cliente / marca"><Input value={opts.client} onChange={(e) => { setOpts({ ...opts, client: e.target.value }); setPrefs({ report: { ...prefs.report, client: e.target.value } }) }} /></Field>
      </div>
      {err && <Banner tone="err" className="mb-3">No se pudo generar el informe: {err}</Banner>}
      {prog ? <div className="flex items-center gap-2 text-primary"><Icon name="progress_activity" className="animate-spin" />{prog}</div> : (
        <Button icon="analytics" disabled={!aiReady && !!opts.focus.trim() || (source === 'tracks' ? !sel.size : !explore.comments.length)} onClick={gen}>Generar informe</Button>
      )}
    </Card>
  )
}

function DiffusionReport() {
  const state = usePublisher()
  const [date, setDate] = useState(ymd(Date.now()))
  // Preferencias globales de informes (Ajustes › Informes): las mismas para comentarios y difusión
  const rep = usePrefs((p) => p.report)
  const meta = { author: rep.author, brand: rep.client }
  const setMeta = (m: { author: string; brand: string }) => setPrefs({ report: { ...rep, author: m.author, client: m.brand } })
  const entries = entriesOn(date)
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setIds(new Set(entriesOn(date).map((h) => h.id))) }, [date, state.history.length])
  const regen = () => { setText(buildDiffusionReport(date, [...ids], meta)); setDirty(false) }
  useEffect(() => { if (!dirty) regen() }, [ids, rep.author, rep.client, date]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = `Informe de difusión · ${longDate(date)}`
  const file = `informe-difusion-${date}`
  return (
    <Card>
      <div className="grid gap-x-4 sm:grid-cols-3">
        <Field label="Fecha"><Input type="date" max={ymd(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Elaborado por"><Input maxLength={80} placeholder="Tu nombre" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} /></Field>
        <Field label="Cliente o marca"><Input maxLength={80} placeholder="Opcional" value={meta.brand} onChange={(e) => setMeta({ ...meta, brand: e.target.value })} /></Field>
      </div>
      <div className="mb-1 text-[13px] font-medium text-text-2">Publicaciones incluidas</div>
      {entries.length ? (
        <div className="mb-4 space-y-1">{entries.map((h) => (
          <label key={h.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={ids.has(h.id)} onChange={(e) => { const s = new Set(ids); e.target.checked ? s.add(h.id) : s.delete(h.id); setIds(s) }} /><span className="truncate">{entryTitle(h).slice(0, 90)}</span></label>
        ))}</div>
      ) : <p className="mb-4 text-text-2">No hay publicaciones en esa fecha.</p>}
      <Field label="Texto del informe · puedes editarlo antes de copiarlo o exportarlo"><Textarea rows={16} className="font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setDirty(true) }} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="text" icon="refresh" onClick={async () => { if (!dirty || (await confirmBox('¿Regenerar el informe?', 'Se perderán los cambios que hayas hecho en el texto.', 'Regenerar'))) regen() }}>Regenerar</Button>
        <span className="flex-1" />
        <Button variant="outlined" icon="content_copy" onClick={async () => toast((await copyText(text)) ? 'Informe copiado' : 'No se pudo copiar')}>Copiar</Button>
        <Button variant="outlined" icon="description" onClick={() => downloadWord(file, title, reportTextToHtml(text))}>Word</Button>
        <Button icon="picture_as_pdf" onClick={() => printPdf(title, reportTextToHtml(text))}>PDF</Button>
      </div>
    </Card>
  )
}

export default function ReportsPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'comentarios' | 'difusion'>(params.get('tipo') === 'difusion' ? 'difusion' : 'comentarios')
  return (
    <div>
      <PageHead title="Informes" sub="Informes profesionales listos para copiar, Word, PDF o WhatsApp." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'comentarios', label: 'Comentarios', icon: 'forum' }, { id: 'difusion', label: 'Difusión en grupos', icon: 'send' }]} />
      {tab === 'comentarios' ? <CommentsReport /> : <DiffusionReport />}
    </div>
  )
}
