import { Banner, Button, Dialog, Icon, toast } from '@/components/ui'
import { copyText } from '@/lib/util'
import { pingExtension, publisherCommand, useExtension } from './bridge'

export const EXT_ZIP = `${import.meta.env.BASE_URL}social-networks-manager-extension.zip`

/** Estado e instalación de la extensión única (publicar en grupos + extraer comentarios). */
export function ExtensionPanel() {
  const { version, publisher, extractor } = useExtension()
  return (
    <div className="space-y-4">
      <p className="text-text-2">
        Una sola extensión de Chrome para toda la app: <b className="font-medium text-text">publica automáticamente en tus grupos</b> y <b className="font-medium text-text">extrae los comentarios</b> de Facebook, Instagram y TikTok
        usando tu propia sesión. Nunca pide contraseñas.
      </p>
      {version ? (
        <Banner tone="ok" icon="extension">
          <b>Extensión conectada · v{version}</b>
          <div className="text-xs">Publicación automática: {publisher ? 'disponible' : 'no disponible'} · Extracción de comentarios: {extractor ? 'disponible' : 'no disponible'}</div>
        </Banner>
      ) : (
        <Banner tone="warn" icon="extension_off">No se detecta la extensión en esta pestaña.</Banner>
      )}
      <ol className="list-decimal space-y-2 pl-5 text-text-2">
        <li><a href={EXT_ZIP} download>Descarga la extensión (.zip)</a> y descomprímela en una carpeta que no vayas a borrar.</li>
        <li>Abre <code>chrome://extensions</code> <button className="text-primary underline" onClick={async () => toast((await copyText('chrome://extensions')) ? 'Copiado: pégalo en una pestaña nueva' : 'Escribe chrome://extensions')}>copiar</button> y activa el <b className="font-medium text-text">Modo de desarrollador</b>.</li>
        <li>Pulsa <b className="font-medium text-text">Cargar descomprimida</b> y elige la carpeta.</li>
        <li>Vuelve aquí y recarga la página.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href={EXT_ZIP} download className="no-underline"><Button icon="download">Descargar extensión</Button></a>
        {version ? (
          <Button variant="outlined" icon="system_update" onClick={async () => {
            const r = await publisherCommand('checkUpdate', {}, 15000)
            if (!r.ok) { toast('No se pudo comprobar si hay versión nueva'); return }
            if (!r.available) { toast(`Ya tienes la última versión (${r.current})`); return }
            toast(`Actualizando la extensión a la versión ${r.latest}…`)
            publisherCommand('update', { auto: false }, 10000)
          }}>Buscar actualización</Button>
        ) : (
          <Button variant="outlined" icon="refresh" onClick={() => { pingExtension(); setTimeout(() => location.reload(), 300) }}>Ya la instalé</Button>
        )}
      </div>
      <p className="text-xs text-text-3"><Icon name="info" className="!text-[16px] align-[-3px]" /> Las condiciones de Facebook no permiten publicar de forma automatizada: puede haber bloqueos temporales. Empieza con pocos grupos y límites bajos.</p>
    </div>
  )
}

export function ExtensionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Extensión de Chrome" icon={<Icon name="extension" className="text-primary" />} actions={<Button onClick={onClose}>Listo</Button>}>
      <ExtensionPanel />
    </Dialog>
  )
}
