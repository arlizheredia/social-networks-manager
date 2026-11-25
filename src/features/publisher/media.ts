import { create } from 'zustand'
import { createStore, del, entries, set, clear } from 'idb-keyval'
import { uid } from '@/lib/util'
import type { MediaItem } from './types'

const db = createStore('snm-media', 'media')
interface Row { id: string; name: string; type: MediaItem['type']; blob: Blob; order: number }

export const useMedia = create<{ items: MediaItem[] }>(() => ({ items: [] }))

const kindOf = (f: Blob): MediaItem['type'] | null =>
  f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : null

export async function loadMedia() {
  const rows = (await entries<string, Row>(db).catch(() => [])).map(([, r]) => r)
  rows.sort((a, b) => a.order - b.order)
  useMedia.setState({ items: rows.filter((r) => r?.blob).map((r) => ({ id: r.id, file: r.blob, url: URL.createObjectURL(r.blob), type: r.type, name: r.name, order: r.order })) })
}

export async function addFiles(files: Iterable<File | Blob>): Promise<number> {
  let n = 0
  const items = [...useMedia.getState().items]
  for (const f of files) {
    const type = kindOf(f)
    if (!type) continue
    const name = (f as File).name || `${type}-${items.length + 1}`
    const m: MediaItem = { id: uid(), file: f, url: URL.createObjectURL(f), type, name, order: Date.now() + n }
    items.push(m)
    n++
    await set(m.id, { id: m.id, name, type, blob: f, order: m.order } satisfies Row, db).catch(() => {})
  }
  useMedia.setState({ items })
  return n
}

export async function removeMedia(id: string) {
  const m = useMedia.getState().items.find((x) => x.id === id)
  if (m) URL.revokeObjectURL(m.url)
  useMedia.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }))
  await del(id, db).catch(() => {})
}

export async function clearMedia() {
  useMedia.getState().items.forEach((m) => URL.revokeObjectURL(m.url))
  useMedia.setState({ items: [] })
  await clear(db).catch(() => {})
}

export const setBusy = (id: string, busy: string | null) =>
  useMedia.setState((s) => ({ items: s.items.map((m) => (m.id === id ? { ...m, busy } : m)) }))

/** Copia una imagen al portapapeles como PNG para pegarla en Facebook. */
export async function copyImage(m: MediaItem) {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = m.url })
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('canvas'))), 'image/png'))
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/**
 * Convierte un audio en vídeo (imagen fija + sonido) con MediaRecorder, para poder publicarlo en Facebook.
 * Se reproduce en tiempo real: tarda lo que dura el audio.
 */
export async function audioToVideo(m: MediaItem, onProgress: (pct: number) => void): Promise<Blob> {
  const audio = new Audio(m.url)
  audio.crossOrigin = 'anonymous'
  await new Promise<void>((res, rej) => { audio.onloadedmetadata = () => res(); audio.onerror = () => rej(new Error('No se pudo leer el audio')) })
  const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 })
  const ctx = canvas.getContext('2d')!
  const draw = (p: number) => {
    const g = ctx.createLinearGradient(0, 0, 1280, 720)
    g.addColorStop(0, '#2d88ff'); g.addColorStop(1, '#1265d6')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = '#fff'; ctx.font = '500 120px Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♪', 640, 340)
    ctx.font = '500 40px Roboto, sans-serif'; ctx.fillText(m.name.replace(/\.[^.]+$/, '').slice(0, 48), 640, 430)
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(240, 520, 800, 8)
    ctx.fillStyle = '#fff'; ctx.fillRect(240, 520, 800 * p, 8)
  }
  draw(0)
  const actx = new AudioContext()
  const src = actx.createMediaElementSource(audio)
  const dest = actx.createMediaStreamDestination()
  src.connect(dest)
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()])
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'video/webm' })) })
  rec.start(500)
  await audio.play()
  const tick = setInterval(() => { const p = audio.duration ? audio.currentTime / audio.duration : 0; draw(p); onProgress(Math.round(p * 100)) }, 200)
  await new Promise<void>((r) => { audio.onended = () => r() })
  clearInterval(tick)
  rec.stop()
  const blob = await done
  actx.close()
  return blob
}
