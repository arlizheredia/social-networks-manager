import { useRef, useState } from 'react'
import { Banner, Button, Card, CardHead, Icon, Textarea, toast } from '@/components/ui'
import { copyText } from '@/lib/util'
import { EXTRACTOR_BOOKMARKLET, EXTRACTOR_CONSOLE } from '../bookmarklet'
import { demoParsed, loadParsed } from '../explore'
import { KNOWN_COLUMNS, parseAny } from '../normalize'

/** Obtener comentarios de una publicación puntual: marcador, archivo o datos de ejemplo. */
export function Obtain() {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const analyze = (raw: string) => {
    try { setErr(''); loadParsed(parseAny(raw)) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead step={1} title="Extrae con el marcador" sub="Para una publicación puntual de Facebook, Instagram o TikTok (para varias cada día, usa Seguimiento)" />
        <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-text-2">
          <li>Arrastra el botón a tu barra de marcadores (una sola vez).</li>
          <li>Abre la publicación en su propia página y pulsa el marcador. Él abre los comentarios y los recoge.</li>
          <li>Copia el resultado y pégalo aquí.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a href={EXTRACTOR_BOOKMARKLET} onClick={(e) => { e.preventDefault(); toast('Arrastra el botón a la barra de marcadores (Ctrl+Shift+B la muestra)') }} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 font-medium text-on-primary no-underline shadow-1">
            <Icon name="bookmark_add" />SNM · Extraer comentarios
          </a>
          <Button variant="text" icon="terminal" onClick={async () => toast((await copyText(EXTRACTOR_CONSOLE)) ? 'Código copiado: pégalo en la consola (F12) de la publicación' : 'No se pudo copiar')}>Copiar código para la consola</Button>
        </div>
      </Card>
      <Card>
        <CardHead step={2} title="Pega o importa el resultado" sub="JSON del marcador, o un JSON/CSV exportado antes o por otra herramienta" />
        <Textarea rows={6} className="font-mono text-xs" placeholder='{"source":"social-dom-extractor", …}' value={text} onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const t = await f.text(); setText(t); analyze(t) } }} />
        {err && <Banner tone="err" className="mt-2">{err}</Banner>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon="insights" disabled={!text.trim()} onClick={() => analyze(text)}>Analizar comentarios</Button>
          <Button variant="outlined" icon="upload_file" onClick={() => fileRef.current?.click()}>Abrir archivo</Button>
          <Button variant="text" icon="content_paste" onClick={async () => { try { const t = await navigator.clipboard.readText(); setText(t); analyze(t) } catch { toast('Pulsa Ctrl+V dentro del cuadro') } }}>Pegar</Button>
          <input ref={fileRef} type="file" accept=".json,.csv,.txt,application/json,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const t = await f.text(); setText(t); analyze(t) } }} />
        </div>
        <details className="mt-3 text-xs text-text-2"><summary className="cursor-pointer">Columnas reconocidas en CSV/JSON</summary>
          <ul className="mt-1 list-disc pl-5">{Object.entries(KNOWN_COLUMNS).map(([k, v]) => <li key={k}><b>{k}</b>: {v.join(', ')}</li>)}</ul>
        </details>
      </Card>
      <div className="text-center text-text-2 lg:col-span-2">
        ¿Solo quieres probar? <button className="text-primary underline" onClick={() => loadParsed(demoParsed())}>Cargar datos de ejemplo</button> · Los comentarios se procesan solo en este navegador.
      </div>
    </div>
  )
}
