import { useRef, useState } from 'react'
import { Banner, Button, Dialog, Icon, toast, confirmBox } from '@/components/ui'
import { cn } from '@/lib/cn'
import { download } from '@/lib/util'
import { AI_PACK, exportPack, installFromFile, installFromFolder, installFromInternet, uninstall, useAI } from './engine'

/** Panel único de la IA de la app: instalar (Internet o archivo), exportar paquete y desinstalar. */
export function AIPanel() {
  const { installed, busy, pct, mb, step, error, mode } = useAI()
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState<number | null>(null)

  const net = async () => {
    try { await installFromInternet(); toast('IA instalada: ya puedes usar todas las funciones', 'auto_awesome') }
    catch (e) { toast((e as Error).message) }
  }
  const file = async (f?: File) => {
    if (!f) return
    try { await installFromFile(f); toast('IA instalada desde el archivo, sin usar Internet', 'auto_awesome') }
    catch (e) { toast((e as Error).message) }
  }
  const folder = async (list: FileList | null) => {
    if (!list?.length) return
    try { await installFromFolder([...list]); toast('IA instalada desde la carpeta, sin usar Internet', 'auto_awesome') }
    catch (e) { toast((e as Error).message) }
  }
  const exp = async () => {
    setExporting(0)
    try { download(AI_PACK.name, await exportPack((x) => setExporting(Math.round(x * 100))), 'application/zip'); toast('Paquete de IA exportado') }
    catch (e) { toast((e as Error).message) }
    finally { setExporting(null) }
  }
  const del = async () => {
    if (await confirmBox('¿Desinstalar la IA?', 'Se borrarán los modelos de este navegador (≈ 620 MB). Podrás volver a instalarla cuando quieras.', 'Desinstalar', true)) { await uninstall(); toast('IA desinstalada') }
  }

  return (
    <div className="space-y-4">
      <p className="leading-6 text-text-2">
        Una sola IA para toda la app: busca comentarios por significado, prepara informes, sugiere respuestas, redacta el mensaje para WhatsApp y mejora el texto de tus publicaciones.
        Es <b className="font-medium text-text">gratuita, funciona sin conexión</b> y nada sale de tu navegador. Se instala una vez (≈ 620 MB).
      </p>
      {installed && !busy ? (
        <Banner tone="ok" icon="auto_awesome"><b>La IA está instalada</b> en este navegador y lista para usar.</Banner>
      ) : busy ? (
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium"><Icon name="downloading" className="text-primary" />{mode === 'file' ? 'Instalando sin Internet' : 'Instalando la IA'}… {pct} %</div>
          <div className="h-2 overflow-hidden rounded-full bg-primary-container"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 text-xs text-text-2">{step}{mb[1] ? ` · ${Math.round(mb[0])} de ${Math.round(mb[1])} MB` : ''}. Puedes seguir usando la app mientras tanto.</div>
        </div>
      ) : (
        <div className="space-y-5">
          {error && <Banner tone="err">{error}</Banner>}
          <Option icon="cloud_download" title="Instalar desde Internet" text="Descarga los modelos (≈ 620 MB) una sola vez." badge="Recomendado" primary onClick={net} />
          <div>
            <div className="mb-2 px-1 text-xs font-medium tracking-wide text-text-2 uppercase">Sin Internet</div>
            <div className="divide-y divide-outline-2 overflow-hidden rounded-2xl border border-outline-2">
              <Option flat icon="folder_zip" title="Desde un archivo .zip" text="El paquete de IA, tal como se descarga." onClick={() => fileRef.current?.click()} />
              <Option flat icon="folder_open" title="Desde una carpeta" text="El paquete descomprimido o los modelos de Hugging Face." onClick={() => dirRef.current?.click()} />
            </div>
            <p className="mt-2 px-1 text-xs text-text-2">¿No tienes el paquete? <a href={AI_PACK.url}>Descárgalo aquí</a> y llévalo al equipo sin conexión.</p>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { file(e.target.files?.[0]); e.target.value = '' }} />
      {/* webkitdirectory: el navegador permite elegir una carpeta completa */}
      <input ref={dirRef} type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={(e) => { folder(e.target.files); e.target.value = '' }} />
      {installed && !busy && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" icon="ios_share" onClick={exp} disabled={exporting != null}>{exporting != null ? `Preparando… ${exporting} %` : 'Exportar paquete para otro equipo'}</Button>
          <Button variant="text" icon="delete" onClick={del}>Desinstalar</Button>
        </div>
      )}
    </div>
  )
}

/** Opción de instalación: fila amplia con icono, título, descripción y flecha. */
function Option({ icon, title, text, onClick, badge, primary, flat }: { icon: string; title: string; text: string; onClick: () => void; badge?: string; primary?: boolean; flat?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors',
        flat ? 'hover:bg-text/5' : 'rounded-2xl',
        primary && 'bg-primary-container/60 text-on-primary-container hover:bg-primary-container',
      )}
    >
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', primary ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container')}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-medium text-text">
          {title}
          {badge && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-on-primary">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] text-text-2">{text}</span>
      </span>
      <Icon name="chevron_right" className="text-text-2 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

export function AIDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="IA de la app" icon={<Icon name="auto_awesome" fill className="text-primary" />} actions={<Button onClick={onClose}>Listo</Button>}>
      <AIPanel />
    </Dialog>
  )
}

/** Aviso compacto para las funciones que necesitan la IA. */
export function NeedsAI({ what }: { what: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Banner tone="info" icon="auto_awesome" action={<Button size="sm" variant="tonal" onClick={() => setOpen(true)}>Instalar IA</Button>}>
        {what} necesita la IA de la app (gratuita y local). Se instala una sola vez.
      </Banner>
      <AIDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
