import { useRef, useState } from 'react'
import { Icon, IconButton, MenuItem, Popover, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { uid } from '@/lib/util'
import { generate, useAI, withTask } from '@/features/ai/engine'
import { EMOJIS, toggleStyle, type StyleKey } from '../fb'
import { setPub, usePublisher } from '../store'

const TB = 'inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-text-2 hover:bg-text/8 [&_.ms]:text-[20px]'

/** Editor del texto: negrita/cursiva Unicode, emojis, hashtag, variables, plantillas y mejora con IA. */
export function Editor() {
  const text = usePublisher((s) => s.draft.text)
  const templates = usePublisher((s) => s.templates)
  const aiReady = useAI((s) => s.installed)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [undo, setUndo] = useState<string | null>(null)
  const setText = (t: string) => setPub((s) => ({ draft: { ...s.draft, text: t } }))

  const insert = (s: string) => {
    const ta = ref.current!
    ta.focus()
    ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end')
    setText(ta.value)
  }
  const fmt = (k: StyleKey) => {
    const ta = ref.current!, a = ta.selectionStart, b = ta.selectionEnd
    if (a === b) { toast('Selecciona el texto al que quieres dar formato'); ta.focus(); return }
    ta.focus(); ta.setRangeText(toggleStyle(ta.value.slice(a, b), k), a, b, 'select'); setText(ta.value)
  }
  const n = [...text].length

  const improve = async () => {
    if (!text.trim()) { toast('Escribe primero un texto para mejorarlo'); return }
    setAiBusy(true)
    try {
      const out = await withTask('Mejorando el texto', (p) => generate(
        'Eres un experto en redes sociales. Mejoras textos para publicar en grupos de Facebook en español: claros, cercanos y atractivos, sin exagerar. Conserva EXACTAMENTE las variables entre llaves como {grupo}, {fecha} y {enlace}, los enlaces y los datos (precios, teléfonos, fechas). No inventes información. Máximo 3 emojis. Responde solo con el texto final.',
        `Mejora este texto para publicarlo en grupos de Facebook:\n\n${text}`, { onProgress: p, maxTokens: 380 }))
      const clean = out.replace(/^```\w*\n?|```$/g, '').replace(/^["«]|["»]$/g, '').trim()
      if (!clean) throw new Error('La IA no devolvió texto.')
      const old = text
      setText(clean)
      toast('Texto mejorado con la IA. Revísalo; puedes deshacerlo con ↶.', 'auto_awesome')
      setUndo(old)
    } catch (e) { toast('IA: ' + (e as Error).message) }
    finally { setAiBusy(false) }
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-outline focus-within:border-primary focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-primary">
      <div role="toolbar" aria-label="Formato" className="flex flex-wrap items-center gap-0.5 border-b border-outline-2 bg-surface-2 px-1.5 py-1">
        <button className={TB} onClick={() => fmt('b')} title="Negrita (Ctrl+B)" aria-label="Negrita"><Icon name="format_bold" /></button>
        <button className={TB} onClick={() => fmt('i')} title="Cursiva (Ctrl+I)" aria-label="Cursiva"><Icon name="format_italic" /></button>
        <span className="mx-1 h-5 w-px bg-outline-2" />
        <Popover trigger={(o) => <button className={TB} onClick={o} title="Emojis" aria-label="Emojis"><Icon name="mood" /></button>}>
          {() => <div className="grid w-72 grid-cols-8 gap-0.5">{EMOJIS.map((e) => <button key={e} className="grid size-8 place-items-center rounded-lg text-lg hover:bg-text/8" onClick={() => insert(e)}>{e}</button>)}</div>}
        </Popover>
        <button className={TB} title="Hashtag" aria-label="Hashtag" onClick={() => { const ta = ref.current!; const p = ta.selectionStart; insert((p > 0 && !/\s/.test(ta.value[p - 1]) ? ' ' : '') + '#') }}><Icon name="tag" /></button>
        <Popover trigger={(o) => <button className={TB} onClick={o} title="Variables">{'{ }'} Variables</button>}>
          {(close) => (
            <>
              <div className="px-3 py-1 text-xs text-text-2">Se sustituyen en cada grupo</div>
              <MenuItem onClick={() => { insert('{grupo}'); close() }} sub="Nombre del grupo de destino">{'{grupo}'}</MenuItem>
              <MenuItem onClick={() => { insert('{fecha}'); close() }} sub="Fecha de hoy (p. ej. 15 de noviembre)">{'{fecha}'}</MenuItem>
              <MenuItem onClick={() => { insert('{enlace}'); close() }} sub="URL de la publicación de origen">{'{enlace}'}</MenuItem>
            </>
          )}
        </Popover>
        <Popover className="w-80" trigger={(o) => <button className={TB} onClick={o} title="Plantillas"><Icon name="description" />Plantillas</button>}>
          {(close) => (
            <>
              <div className="px-3 py-1 text-xs text-text-2">Plantillas guardadas</div>
              {!templates.length && <div className="px-3 py-2 text-text-2">Aún no tienes plantillas</div>}
              {templates.map((t) => (
                <div key={t.id} className="flex items-center">
                  <div className="min-w-0 flex-1"><MenuItem onClick={() => { const old = text; setText(t.text); close(); if (old.trim()) setUndo(old) }} sub={t.text.slice(0, 80)}>{t.name}</MenuItem></div>
                  <IconButton size="sm" icon="delete" label="Eliminar plantilla" onClick={() => { setPub((s) => ({ templates: s.templates.filter((x) => x.id !== t.id) })); toast('Plantilla eliminada') }} />
                </div>
              ))}
              <div className="my-1 h-px bg-outline-2" />
              <MenuItem icon="add" onClick={() => {
                close()
                if (!text.trim()) { toast('Escribe primero el texto que quieres guardar'); return }
                const name = prompt('Nombre de la plantilla:', text.trim().split('\n')[0].slice(0, 40))
                if (!name) return
                setPub((s) => ({ templates: [{ id: uid().slice(0, 36), name: name.trim().slice(0, 80), text }, ...s.templates] }))
                toast('Plantilla guardada')
              }}>Guardar texto actual como plantilla</MenuItem>
            </>
          )}
        </Popover>
        <span className="flex-1" />
        <button className={cn(TB, 'text-primary')} onClick={improve} disabled={!aiReady || aiBusy} title={aiReady ? 'Mejorar el texto con la IA' : 'Instala la IA de la app para usarlo'}>
          <Icon name={aiBusy ? 'progress_activity' : 'auto_awesome'} className={aiBusy ? 'animate-spin' : ''} />Mejorar con IA
        </button>
        {undo != null && <button className={TB} onClick={() => { setText(undo); setUndo(null) }} title="Deshacer"><Icon name="undo" /></button>}
        <button className={TB} title="Vaciar" aria-label="Vaciar texto" onClick={() => { if (text) { setUndo(text); setText('') } }}><Icon name="delete" /></button>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); fmt(e.key) } }}
        placeholder="Escribe algo para los grupos… Usa {grupo} para personalizar el saludo en cada grupo."
        aria-label="Texto de la publicación"
        className="block min-h-44 w-full resize-y bg-surface px-4 py-3 leading-6 text-text outline-none placeholder:text-text-3"
      />
      <div className="flex items-center gap-3 border-t border-outline-2 bg-surface px-4 py-1.5 text-xs text-text-2">
        <span className={n > 63206 ? 'text-error' : ''}>{n.toLocaleString('es')} caracteres{n > 63206 ? ' · supera el límite de Facebook (63 206)' : ''}</span>
        <span className="ml-auto inline-flex items-center gap-1"><Icon name="cloud_done" className="!text-[16px]" />Borrador guardado</span>
      </div>
    </div>
  )
}
