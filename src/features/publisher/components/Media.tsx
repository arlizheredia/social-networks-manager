import { useEffect, useRef, useState } from 'react'
import { collapseRows } from '@/lib/motion'
import { Button, Icon, IconButton, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addFiles, audioToVideo, copyImage, removeMedia, setBusy, useMedia } from '../media'

/** Zona para arrastrar o pegar imágenes, vídeos y audio, con conversión de audio a vídeo. */
export function Media() {
  const items = useMedia((s) => s.items)
  const inRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const files = [...(e.clipboardData?.files || [])].filter((f) => /^(image|video|audio)\//.test(f.type))
      if (files.length) { e.preventDefault(); addFiles(files).then((n) => toast(`${n} archivo(s) añadidos`)) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const convert = async (id: string) => {
    const m = useMedia.getState().items.find((x) => x.id === id)
    if (!m) return
    try {
      setBusy(id, 'Convirtiendo… 0 %')
      const blob = await audioToVideo(m, (p) => setBusy(id, `Convirtiendo… ${p} % (mantén la pestaña visible)`))
      await removeMedia(id)
      await addFiles([new File([blob], m.name.replace(/\.[^.]+$/, '') + '.webm', { type: blob.type })])
      toast('Audio convertido a vídeo')
    } catch (e) { setBusy(id, null); toast('No se pudo convertir: ' + (e as Error).message) }
  }

  return (
    <div className="mt-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
        className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center text-text-2 transition-colors', over ? 'border-primary bg-primary-container/40' : 'border-outline-2 hover:bg-text/4')}
      >
        <Icon name="add_photo_alternate" className="text-primary" />
        <div><b className="font-medium text-text">Arrastra aquí imágenes, vídeos o audio</b> o pega una imagen con Ctrl+V</div>
        <input ref={inRef} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
      </div>
      {!!items.length && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((m) => (
            <div key={m.id} data-row-id={m.id} className="relative overflow-hidden rounded-xl border border-outline-2 bg-surface-2">
              {m.type === 'image' && <img src={m.url} alt={m.name} className="aspect-square w-full object-cover" />}
              {m.type === 'video' && <video src={m.url} muted className="aspect-square w-full object-cover" />}
              {m.type === 'audio' && (
                <div className="flex aspect-square flex-col items-center justify-center gap-2 p-2 text-center">
                  <Icon name="music_note" className="text-primary" />
                  <div className="w-full truncate text-xs">{m.name}</div>
                  <audio src={m.url} controls className="w-full" />
                  <Button size="sm" variant="tonal" onClick={() => convert(m.id)} disabled={!!m.busy}>Convertir a vídeo</Button>
                </div>
              )}
              <span className="absolute top-1.5 left-1.5 rounded bg-scrim px-1.5 text-[10px] font-medium text-white">{{ image: 'IMAGEN', video: 'VÍDEO', audio: 'AUDIO' }[m.type]}</span>
              <div className="absolute top-1 right-1 flex gap-0.5 rounded-full bg-surface/90">
                {m.type === 'image' && <IconButton size="sm" icon="content_copy" label="Copiar imagen" onClick={() => copyImage(m).then(() => toast('Imagen copiada. Pégala en Facebook con Ctrl+V'), () => toast('Tu navegador no permite copiar imágenes'))} />}
                <IconButton size="sm" icon="close" label="Quitar" onClick={async () => { await collapseRows([m.id]); removeMedia(m.id) }} />
              </div>
              {m.busy && <div className="absolute inset-0 grid place-items-center bg-scrim p-2 text-center text-xs text-white">{m.busy}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
