/**
 * IA de la app: una sola instalación local, gratuita y sin claves, compartida por todos los módulos.
 *  - Redacción (sugerencias de respuesta, mensaje de WhatsApp, mejorar textos, clasificar): Qwen2.5 0.5B Instruct.
 *  - Búsqueda por significado (comentarios e informes): multilingual-e5-small.
 * Ambos se instalan juntos con un solo botón y se guardan en la caché del navegador («transformers-cache»),
 * con las mismas direcciones que usaban las apps originales: lo ya descargado se reutiliza.
 */
import { create } from 'zustand'
import { createStore, getMany, setMany } from 'idb-keyval'

export const AI_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1'
export const LLM_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct'
export const SEM_MODEL = 'Xenova/multilingual-e5-small'
/** Los dos modelos de la IA de la app, con su función y tamaño aproximado (para mostrarlos al usuario). */
export const AI_MODELS = [
  { id: SEM_MODEL, name: 'multilingual-e5-small', role: 'Búsqueda por significado', mb: 120 },
  { id: LLM_MODEL, name: 'Qwen2.5-0.5B-Instruct', role: 'Redacción', mb: 510 },
] as const
const modelLabel = (id: string) => { const m = AI_MODELS.find((x) => x.id === id); return m ? `${m.name} (${m.role.toLowerCase()})` : id }
const CACHE = 'transformers-cache'
const HF_BASE = 'https://huggingface.co/'
const hfUrl = (model: string, file: string) => HF_BASE + model + '/resolve/main/' + file
const AI_SIZE = { sem: 118e6, llm: 512e6 }
export const AI_PACK = {
  name: 'snm-ia-pack.zip',
  manifest: 'sca-ia.json',
  url: 'https://github.com/arlizheredia/social-comments-analyzer/releases/latest/download/sca-ia-pack.zip',
}
const ONNX_DTYPE: Record<string, string> = {
  'model.onnx': 'fp32', 'model_fp16.onnx': 'fp16', 'model_q4.onnx': 'q4', 'model_q4f16.onnx': 'q4f16',
  'model_quantized.onnx': 'q8', 'model_int8.onnx': 'int8', 'model_uint8.onnx': 'uint8', 'model_bnb4.onnx': 'bnb4',
}

export interface AIState {
  checked: boolean
  installed: boolean
  busy: boolean
  mode: '' | 'net' | 'file'
  pct: number
  mb: [number, number]
  step: string
  error: string
  /** Tarea en curso (redactar, buscar…) para mostrar el progreso. */
  task: { label: string; pct: number | null } | null
}
export const useAI = create<AIState>(() => ({ checked: false, installed: false, busy: false, mode: '', pct: 0, mb: [0, 0], step: '', error: '', task: null }))
const setAI = useAI.setState

const types = { llm: [] as string[], sem: [] as string[] }

/** La IA se considera instalada si en la caché están tokenizer.json, config.json y algún modelo ONNX de cada uno. */
export async function scanCache() {
  try {
    const urls = (await (await caches.open(CACHE)).keys()).map((r) => decodeURIComponent(r.url))
    const has = (m: string, re: RegExp) => urls.some((u) => u.includes('/' + m + '/') && re.test(u))
    const t = (m: string) => [...new Set(urls.filter((u) => u.includes('/' + m + '/'))
      .map((u) => (u.match(/\/onnx\/(model[a-z0-9_]*\.onnx)(\?|$)/) || [])[1]).filter((f) => f && ONNX_DTYPE[f]).map((f) => ONNX_DTYPE[f]))]
    const base = (m: string) => has(m, /\/tokenizer\.json(\?|$)/) && has(m, /\/config\.json(\?|$)/)
    types.llm = t(LLM_MODEL); types.sem = t(SEM_MODEL)
    const installed = base(LLM_MODEL) && types.llm.length > 0 && base(SEM_MODEL) && types.sem.length > 0
    setAI({ checked: true, installed })
    return installed
  } catch {
    setAI({ checked: true })
    return useAI.getState().installed
  }
}

/* ---------- Motor en segundo plano ---------- */
interface Pending { res: (v: unknown) => void; rej: (e: Error) => void; onProgress?: (p: ProgressEv) => void; onStep?: (a: number, b: number) => void }
interface ProgressEv { status: string; file: string; loaded: number; total: number }
const W = { w: null as Worker | null, seq: 0, pend: new Map<number, Pending>() }
const loaded = { llm: false, sem: false }

function worker() {
  if (W.w) return W.w
  W.w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  W.w.onmessage = (e) => {
    const m = e.data, hd = W.pend.get(m.id)
    if (!hd) return
    if (m.type === 'progress') hd.onProgress?.(m.p)
    else if (m.type === 'step') hd.onStep?.(m.a, m.b)
    else { W.pend.delete(m.id); m.type === 'done' ? hd.res(m.result) : hd.rej(new Error(m.error)) }
  }
  W.w.onerror = (e) => {
    const err = Object.assign(new Error('El motor de IA se detuvo' + (e.message ? ': ' + e.message : ' (posible falta de memoria)')), { workerCrash: true })
    try { W.w?.terminate() } catch { /* */ }
    for (const hd of W.pend.values()) hd.rej(err)
    W.pend.clear(); W.w = null; loaded.llm = loaded.sem = false
  }
  return W.w
}

function call<T>(msg: Record<string, unknown>, opts: { onProgress?: Pending['onProgress']; onStep?: Pending['onStep']; signal?: AbortSignal } = {}) {
  const w = worker()
  return new Promise<T>((res, rej) => {
    const id = ++W.seq
    W.pend.set(id, { res: res as (v: unknown) => void, rej, onProgress: opts.onProgress, onStep: opts.onStep })
    opts.signal?.addEventListener('abort', () => { if (W.pend.delete(id)) rej(Object.assign(new Error('Cancelado'), { name: 'AbortError' })) }, { once: true })
    w.postMessage({ ...msg, id, lib: AI_LIB })
  })
}

/** Ejecuta una tarea recuperándose de caídas del motor (casi siempre por falta de memoria). */
async function run<T>(msg: Record<string, unknown>, opts: Parameters<typeof call>[1] = {}, max = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await call<T>(msg, opts) } catch (e) {
      if (!(e as { workerCrash?: boolean }).workerCrash) throw e
      if (attempt >= max) throw new Error('La IA se quedó sin memoria en este equipo. Cierra otras pestañas o programas y vuelve a intentarlo.')
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

async function llmTries() {
  let device = 'wasm'
  try { const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu; if (gpu && (await gpu.requestAdapter())) device = 'webgpu' } catch { /* */ }
  if (!useAI.getState().checked) await scanCache()
  const pref = device === 'webgpu' ? ['q4f16', 'q4', 'fp16', 'q8', 'int8', 'uint8', 'bnb4', 'fp32'] : ['q4', 'q8', 'int8', 'uint8', 'bnb4', 'q4f16', 'fp32', 'fp16']
  const cached = pref.filter((d) => types.llm.includes(d))
  const tries = [...cached.map((d) => ({ dtype: d, device: device === 'webgpu' && /f16/.test(d) ? 'webgpu' : device })), ...(cached.length ? [] : [{ dtype: device === 'webgpu' ? 'q4f16' : 'q8', device }])]
  if (device === 'webgpu') tries.push(...cached.filter((d) => !/f16/.test(d)).map((d) => ({ dtype: d, device: 'wasm' })))
  if (!tries.some((t) => t.dtype === 'q8' && t.device === 'wasm')) tries.push({ dtype: 'q8', device: 'wasm' })
  return tries
}
const semTries = () => [{ dtype: types.sem.includes('q8') ? 'q8' : types.sem[0] || 'q8' }]

function progressAgg(onPct: (a: number, b: number) => void) {
  const files: Record<string, [number, number]> = {}
  return (p: ProgressEv) => {
    if (p.status !== 'progress' || !p.total) return
    files[p.file] = [p.loaded, p.total]
    const a = Object.values(files).reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0])
    onPct(a[0], a[1])
  }
}

/* ---------- Instalación ---------- */
export async function installFromInternet() {
  const st = useAI.getState()
  if (st.busy) return
  if (!navigator.onLine) throw new Error('Sin conexión: conéctate a Internet para instalar la IA.')
  setAI({ busy: true, mode: 'net', pct: 0, error: '', step: 'Preparando la descarga…', mb: [0, 0] })
  try {
    if (await scanCache()) return
    try { await navigator.storage?.persist?.() } catch { /* */ }
    const total = AI_SIZE.sem + AI_SIZE.llm
    const upd = (done: number) => setAI({ pct: Math.min(99, Math.floor((done / total) * 100)), mb: [done / 1e6, total / 1e6] })
    setAI({ step: `Descargando ${modelLabel(SEM_MODEL)}` })
    await run({ type: 'load', kind: 'sem', model: SEM_MODEL, task: 'feature-extraction', tries: semTries() }, { onProgress: progressAgg((a, b) => upd((a / b) * AI_SIZE.sem)) })
    loaded.sem = true
    setAI({ step: `Descargando ${modelLabel(LLM_MODEL)}` })
    await run({ type: 'load', kind: 'llm', model: LLM_MODEL, task: 'text-generation', tries: await llmTries() }, { onProgress: progressAgg((a, b) => upd(AI_SIZE.sem + (a / b) * AI_SIZE.llm)) })
    loaded.llm = true; loaded.sem = false
    await scanCache()
    setAI({ installed: true, pct: 100 })
  } catch (e) {
    setAI({ error: (e as Error).message || String(e) })
    throw e
  } finally {
    setAI({ busy: false, mode: '', step: '' })
  }
}

/** Lee el índice de un ZIP sin compresión sin cargarlo entero en memoria. */
async function zipEntries(file: Blob) {
  const tailLen = Math.min(file.size, 66000)
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer())
  let eocd = -1
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('El archivo no es un paquete de IA válido.')
  const n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true)
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder()
  const out: { method: number; size: number; lho: number; name: string; start: number }[] = []
  let q = 0
  for (let i = 0; i < n; i++) {
    if (cd.getUint32(q, true) !== 0x02014b50) throw new Error('El paquete de IA está dañado.')
    const nl = cd.getUint16(q + 28, true), xl = cd.getUint16(q + 30, true), cl = cd.getUint16(q + 32, true)
    out.push({ method: cd.getUint16(q + 10, true), size: cd.getUint32(q + 24, true), lho: cd.getUint32(q + 42, true), name: dec.decode(new Uint8Array(cd.buffer, q + 46, nl)), start: 0 })
    q += 46 + nl + xl + cl
  }
  for (const e of out) {
    const lh = new DataView(await file.slice(e.lho, e.lho + 30).arrayBuffer())
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('El paquete de IA está dañado.')
    e.start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
  }
  return out
}

/** Instala desde el paquete .zip (sin Internet): copia cada archivo a la caché con la dirección de la descarga normal. */
export async function installFromFile(file: File) {
  if (useAI.getState().busy) return
  setAI({ busy: true, mode: 'file', pct: 0, error: '', step: 'Leyendo el paquete', mb: [0, file.size / 1e6] })
  try {
    const ents = await zipEntries(file)
    const me = ents.find((e) => e.name === AI_PACK.manifest)
    if (!me) throw new Error('El archivo no es un paquete de IA.')
    const man = JSON.parse(await file.slice(me.start, me.start + me.size).text())
    const files = ((man.files || []) as { model: string; file: string; path: string; size?: number }[]).filter((f) => f?.model && f.file)
    if (![LLM_MODEL, SEM_MODEL].every((m) => files.some((f) => f.model === m && /\.onnx$/.test(f.file)))) throw new Error('El paquete no contiene los modelos que usa esta versión de la app.')
    try { await navigator.storage?.persist?.() } catch { /* */ }
    const cache = await caches.open(CACHE), total = files.reduce((s, f) => s + (f.size || 0), 0)
    let done = 0
    for (const f of files) {
      const e = ents.find((x) => x.name === f.path)
      if (!e || e.method !== 0 || (f.size != null && e.size !== f.size)) throw new Error('El paquete de IA está incompleto o dañado (' + f.path + ').')
      setAI({ step: `Copiando ${modelLabel(f.model)}` })
      await cache.put(hfUrl(f.model, f.file), new Response(file.slice(e.start, e.start + e.size), {
        headers: { 'content-type': /\.json$/.test(f.file) ? 'application/json' : 'application/octet-stream', 'content-length': String(e.size) },
      }))
      done += e.size
      setAI({ pct: Math.min(99, Math.floor((done / Math.max(1, total)) * 100)), mb: [done / 1e6, total / 1e6] })
    }
    if (!(await scanCache())) throw new Error('El paquete se copió, pero faltan archivos de los modelos.')
    setAI({ pct: 100 })
  } catch (e) {
    setAI({ error: (e as Error).message || String(e) })
    throw e
  } finally {
    setAI({ busy: false, mode: '', step: '' })
  }
}

/**
 * Instala desde una carpeta local: el paquete de IA descomprimido o las carpetas de los modelos descargadas
 * de Hugging Face (p. ej. «Qwen2.5-0.5B-Instruct/» y «multilingual-e5-small/», en cualquier subcarpeta).
 * Cada archivo se copia a la caché con la dirección de la descarga normal.
 */
export function modelFilesInFolder(files: File[]) {
  const out: { model: string; file: string; blob: File }[] = []
  for (const f of files) {
    const parts = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split('/').filter(Boolean)
    for (const model of [LLM_MODEL, SEM_MODEL]) {
      const leaf = model.split('/')[1].toLowerCase()
      const i = parts.findIndex((p) => p.toLowerCase() === leaf)
      if (i < 0) continue
      const file = parts.slice(i + 1).join('/')
      // solo los archivos que usa Transformers.js (configuración, tokenizador y modelos ONNX)
      if (file && /\.(json|txt|model|onnx|onnx_data)$/i.test(file) && !/^\.|\/\./.test(file)) out.push({ model, file, blob: f })
      break
    }
  }
  return out
}

export async function installFromFolder(files: File[]) {
  if (useAI.getState().busy) return
  const list = modelFilesInFolder(files)
  const has = (m: string, re: RegExp) => list.some((x) => x.model === m && re.test(x.file))
  const missing = [LLM_MODEL, SEM_MODEL].filter((m) => !(has(m, /(^|\/)config\.json$/) && has(m, /(^|\/)tokenizer\.json$/) && has(m, /^onnx\/model[a-z0-9_]*\.onnx$/)))
  if (missing.length) throw new Error(`La carpeta no contiene ${missing.map((m) => '«' + m.split('/')[1] + '»').join(' ni ')} completo (config.json, tokenizer.json y onnx/model*.onnx).`)
  setAI({ busy: true, mode: 'file', pct: 0, error: '', step: 'Leyendo la carpeta', mb: [0, 0] })
  try {
    try { await navigator.storage?.persist?.() } catch { /* */ }
    const cache = await caches.open(CACHE), total = list.reduce((a, x) => a + x.blob.size, 0)
    let done = 0
    for (const x of list) {
      setAI({ step: `Copiando ${modelLabel(x.model)}` })
      await cache.put(hfUrl(x.model, x.file), new Response(x.blob, {
        headers: { 'content-type': /\.json$/.test(x.file) ? 'application/json' : 'application/octet-stream', 'content-length': String(x.blob.size) },
      }))
      done += x.blob.size
      setAI({ pct: Math.min(99, Math.floor((done / Math.max(1, total)) * 100)), mb: [done / 1e6, total / 1e6] })
    }
    if (!(await scanCache())) throw new Error('Los archivos se copiaron, pero faltan partes de los modelos.')
    setAI({ pct: 100 })
  } catch (e) {
    setAI({ error: (e as Error).message || String(e) })
    throw e
  } finally {
    setAI({ busy: false, mode: '', step: '' })
  }
}

let CRC_T: Uint32Array | null = null
function crc32(crc: number, u8: Uint8Array) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0 } }
  let c = (crc ^ 0xffffffff) >>> 0
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Crea el paquete con los modelos de este navegador para instalarlos en otro equipo sin descargar nada. */
export async function exportPack(onProgress?: (x: number) => void): Promise<Blob> {
  if (!(await scanCache())) throw new Error('La IA no está instalada en este navegador.')
  const cache = await caches.open(CACHE)
  const entries: { model: string; file: string; path: string; blob: Blob; crc: number }[] = []
  for (const r of await cache.keys()) {
    const u = decodeURIComponent(r.url).split('?')[0]
    for (const m of [LLM_MODEL, SEM_MODEL]) {
      const pre = HF_BASE + m + '/resolve/main/'
      if (u.startsWith(pre)) { const blob = await (await cache.match(r))!.blob(); entries.push({ model: m, file: u.slice(pre.length), path: m + '/' + u.slice(pre.length), blob, crc: 0 }) }
    }
  }
  const total = entries.reduce((s, e) => s + e.blob.size, 0)
  let doneB = 0
  for (const e of entries) {
    for (let o = 0; o < e.blob.size; o += 8 << 20) {
      e.crc = crc32(e.crc, new Uint8Array(await e.blob.slice(o, o + (8 << 20)).arrayBuffer()))
      doneB += Math.min(8 << 20, e.blob.size - o); onProgress?.(doneB / total)
      await new Promise((r) => setTimeout(r))
    }
  }
  const man = { app: 'Social Networks Manager', kind: 'sca-ia-pack', version: 1, created: new Date().toISOString(), files: entries.map((e) => ({ model: e.model, file: e.file, path: e.path, size: e.blob.size })) }
  const manBytes = new TextEncoder().encode(JSON.stringify(man, null, 2))
  const items = [{ path: AI_PACK.manifest, blob: new Blob([manBytes]), crc: crc32(0, manBytes) }, ...entries]
  const enc = new TextEncoder(), parts: BlobPart[] = [], cds: BlobPart[] = []
  let off = 0, cdSize = 0
  for (const it of items) {
    const name = enc.encode(it.path), size = it.blob.size
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true)
    lh.setUint32(14, it.crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true)
    parts.push(lh.buffer, name, it.blob)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true)
    ch.setUint32(16, it.crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true)
    cds.push(ch.buffer, name)
    cdSize += 46 + name.length
    off += 30 + name.length + size
  }
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, items.length, true); end.setUint16(10, items.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true)
  return new Blob([...parts, ...cds, end.buffer], { type: 'application/zip' })
}

export async function uninstall() {
  try {
    const cache = await caches.open(CACHE)
    await Promise.all((await cache.keys()).filter((r) => r.url.includes(LLM_MODEL) || r.url.includes(SEM_MODEL)).map((r) => cache.delete(r)))
  } catch { /* */ }
  W.w?.terminate(); W.w = null; loaded.llm = loaded.sem = false
  setAI({ installed: false, pct: 0 })
}

/* ---------- Uso ---------- */
export class AINotInstalled extends Error { constructor() { super('Primero instala la IA de la app (Ajustes › IA de la app).') } }
const ensure = () => { if (!useAI.getState().installed) throw new AINotInstalled() }

/** Redacta con el modelo de lenguaje. onProgress recibe 0..1 */
/** Carga el modelo de redacción por adelantado (p. ej. al abrir el diálogo de respuestas) para que la primera respuesta tarde menos. */
export async function warmLLM() {
  if (!useAI.getState().installed) return
  try { ensure(); await run({ type: 'load', kind: 'llm', model: LLM_MODEL, task: 'text-generation', tries: await llmTries() }) } catch { /* se reintenta al generar */ }
}

export async function generate(system: string, user: string, opts: { signal?: AbortSignal; onProgress?: (x: number) => void; maxTokens?: number; temperature?: number; stopAtLine?: boolean } = {}) {
  ensure()
  const MAX = opts.maxTokens ?? 420
  return run<string>({
    type: 'gen', model: LLM_MODEL, tries: await llmTries(),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    opts: { max_new_tokens: MAX, do_sample: true, temperature: opts.temperature ?? 0.7, top_p: 0.9, repetition_penalty: 1.1, ...(opts.stopAtLine ? { stopAtLine: true } : {}) },
  }, { signal: opts.signal, onStep: (a, b) => opts.onProgress?.(Math.min(0.97, a / b)) })
}

/* Caché persistente de vectores: repetir una búsqueda o un informe no repite el cálculo */
let embStore_: ReturnType<typeof createStore> | null = null
const embStore = () => (embStore_ ||= createStore('snm-emb', 'v'))
const memo = new Map<string, Float32Array>()

/** Vectores normalizados (e5: «query:» para la consulta, «passage:» para los textos). */
export async function embed(texts: string[], kind: 'query' | 'passage', onProg?: (a: number, b: number) => void): Promise<Float32Array[]> {
  ensure()
  const out: Float32Array[] = new Array(texts.length)
  let todo: number[] = []
  texts.forEach((t, i) => { const v = memo.get(kind + '|' + t); if (v) out[i] = v; else todo.push(i) })
  if (todo.length) {
    const pk = (j: number) => SEM_MODEL + '|' + kind + '|' + texts[j].slice(0, 512)
    const got = await getMany<Float32Array | undefined>(todo.map(pk), embStore()).catch(() => [])
    todo = todo.filter((j, n) => { const v = got[n]; if (v?.length) { out[j] = v; memo.set(kind + '|' + texts[j], v); return false } return true })
  }
  if (!todo.length) { onProg?.(texts.length, texts.length); return out }
  const done = texts.length - todo.length
  const vs = await run<number[][]>({ type: 'embed', model: SEM_MODEL, tries: semTries(), texts: todo.map((j) => kind + ': ' + texts[j].slice(0, 512)) },
    { onStep: (a) => onProg?.(done + a, texts.length) }, 2)
  const save: [string, Float32Array][] = []
  todo.forEach((j, n) => { const f = Float32Array.from(vs[n]); out[j] = f; memo.set(kind + '|' + texts[j], f); save.push([SEM_MODEL + '|' + kind + '|' + texts[j].slice(0, 512), f]) })
  setMany(save, embStore()).catch(() => {})
  return out
}

export const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/** Ejecuta una tarea de IA mostrando su progreso en el indicador global. */
export async function withTask<T>(label: string, fn: (progress: (x: number | null) => void) => Promise<T>): Promise<T> {
  setAI({ task: { label, pct: null } })
  try { return await fn((x) => setAI({ task: { label, pct: x == null ? null : Math.round(x * 100) } })) } finally { setAI({ task: null }) }
}

/** Extrae JSON de la respuesta del modelo (tolera texto alrededor y bloques ```). */
export function parseJsonLoose<T = unknown>(txt: string): T | null {
  const s = String(txt).replace(/^```\w*\n?|```$/g, '').trim()
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  try { return JSON.parse(m ? m[0] : s) as T } catch { return null }
}
