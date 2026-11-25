/**
 * Comunicación con la extensión unificada de Social Networks Manager.
 *
 * La extensión inyecta dos puentes en la página (ver extension/):
 *  - Publicación en grupos: la app envía {src:'fbp-app', cmd, id, job} y recibe {src:'fbp-ext', reply:id, res} o {src:'fbp-ext', type:'progress', step}.
 *  - Extracción de comentarios: la app envía {source:'sca-app', type, ...} y recibe {source:'sca-ext', type, ...} (job, progreso, resultados).
 * Ambos anuncian {type:'hello', version} al cargar.
 */
import { create } from 'zustand'

export interface ExtensionState {
  version: string | null
  /** Versión de cada canal (publicar / comentarios). */
  publisher: string | null
  extractor: string | null
}

export const useExtension = create<ExtensionState>(() => ({ version: null, publisher: null, extractor: null }))

type ScaListener = (msg: Record<string, unknown>) => void
const scaListeners = new Set<ScaListener>()
type ProgressListener = (step: string) => void
const progressListeners = new Set<ProgressListener>()
const pending = new Map<string, (res: PublisherResult) => void>()

export interface PublisherResult { ok: boolean; step?: string; error?: string; [k: string]: unknown }

let started = false
export function startExtensionBridge() {
  if (started) return
  started = true
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data !== 'object') return
    const d = e.data as Record<string, unknown>
    if (d.src === 'fbp-ext') {
      if (d.type === 'hello') useExtension.setState((s) => ({ publisher: String(d.version), version: s.version ?? String(d.version) }))
      else if (d.type === 'progress') progressListeners.forEach((l) => l(String(d.step ?? '')))
      else if (typeof d.reply === 'string') {
        pending.get(d.reply)?.(d.res as PublisherResult)
        pending.delete(d.reply)
      }
    } else if (d.source === 'sca-ext') {
      if (d.type === 'hello' || d.type === 'pong') useExtension.setState((s) => ({ extractor: String(d.version), version: s.version ?? String(d.version) }))
      scaListeners.forEach((l) => l(d))
    }
  })
  const ver = document.documentElement.dataset.scaExt
  if (ver) useExtension.setState({ extractor: ver, version: ver })
  pingExtension()
}

export function pingExtension() {
  window.postMessage({ src: 'fbp-app', cmd: 'hello' }, location.origin === 'null' ? '*' : location.origin)
  window.postMessage({ source: 'sca-app', type: 'ping' }, '*')
}

/** Envía una orden al canal de publicación y espera la respuesta. */
export function publisherCommand(cmd: string, job?: unknown, timeoutMs = 10 * 60_000): Promise<PublisherResult> {
  const id = Math.random().toString(36).slice(2)
  return new Promise((resolve) => {
    const t = setTimeout(() => { pending.delete(id); resolve({ ok: false, step: 'ext', error: 'La extensión no respondió a tiempo.' }) }, timeoutMs)
    pending.set(id, (res) => { clearTimeout(t); resolve(res ?? { ok: false, error: 'Sin respuesta de la extensión' }) })
    window.postMessage({ src: 'fbp-app', cmd, id, job }, location.origin === 'null' ? '*' : location.origin)
  })
}

export function onPublisherProgress(l: ProgressListener) {
  progressListeners.add(l)
  return () => { progressListeners.delete(l) }
}

/** Envía un mensaje al canal de extracción de comentarios. */
export function extractorSend(msg: Record<string, unknown>) {
  window.postMessage({ source: 'sca-app', ...msg }, '*')
}

export function onExtractorMessage(l: ScaListener) {
  scaListeners.add(l)
  return () => { scaListeners.delete(l) }
}
