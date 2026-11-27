/// <reference lib="webworker" />
/**
 * Motor de IA en segundo plano. Carga Transformers.js desde la CDN (misma versión y caché que las apps originales:
 * así se reutilizan los modelos ya descargados en este navegador) y ejecuta un solo pipeline a la vez.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Try = { dtype: string; device?: string }
type Msg =
  | { id: number; type: 'load'; kind: 'llm' | 'sem'; model: string; task: string; tries: Try[]; lib: string }
  | { id: number; type: 'embed'; model: string; tries: Try[]; lib: string; texts: string[] }
  | { id: number; type: 'gen'; model: string; tries: Try[]; lib: string; messages: { role: string; content: string }[]; opts: Record<string, any> }

let T: any = null
const P: Record<string, any> = {}, O: Record<string, Try> = {}
const post = (m: unknown) => (self as unknown as Worker).postMessage(m)

async function lib(url: string) {
  if (!T) {
    T = await import(/* @vite-ignore */ url)
    T.env.allowLocalModels = false
    try { T.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1 } catch { /* */ }
  }
  return T
}

async function load(kind: string, model: string, task: string, tries: Try[], url: string, id: number) {
  if (P[kind]) return P[kind]
  // un solo modelo en memoria: se libera el otro antes de cargar este (evita quedarse sin memoria)
  for (const k of Object.keys(P)) { try { await P[k].dispose?.() } catch { /* */ } delete P[k]; delete O[k] }
  const t = await lib(url)
  let last: unknown
  for (const o of tries) {
    try {
      P[kind] = await t.pipeline(task, model, { ...o, progress_callback: (p: any) => post({ id, type: 'progress', p: { status: p.status, file: p.file, loaded: p.loaded, total: p.total } }) })
      O[kind] = o
      return P[kind]
    } catch (e) { last = e }
  }
  throw last || new Error('No se pudo cargar el modelo')
}

// Las tareas se ejecutan de una en una: dos a la vez sobre el mismo modelo (p. ej. precarga + redacción, o una
// redacción nueva al cambiar de comentario) hacen fallar a ONNX con errores numéricos o se quedan sin memoria.
let queue: Promise<void> = Promise.resolve()
const skip = new Set<number>()
self.onmessage = (e: MessageEvent<Msg | { type: 'skip'; id: number }>) => {
  const m = e.data
  if (m.type === 'skip') { skip.add(m.id); return } // tarea cancelada: si aún espera turno, no se ejecuta
  queue = queue.then(() => (skip.delete(m.id) ? undefined : handle(m)))
}

/** ONNX a veces lanza un número (puntero interno) en vez de un error. */
const errText = (err: any) => {
  const s = String(err?.message ?? err)
  return /^\d+$/.test(s) ? `error interno del motor ${s}; se reinicia en el próximo intento` : s
}

async function handle(m: Msg) {
  const id = m.id
  try {
    if (m.type === 'load') {
      await load(m.kind, m.model, m.task, m.tries, m.lib, id)
      post({ id, type: 'done', result: O[m.kind] })
    } else if (m.type === 'embed') {
      const pipe = await load('sem', m.model, 'feature-extraction', m.tries, m.lib, id), out: number[][] = []
      for (let i = 0; i < m.texts.length; i += 8) {
        const r = await pipe(m.texts.slice(i, i + 8), { pooling: 'mean', normalize: true })
        out.push(...r.tolist()); r.dispose?.()
        post({ id, type: 'step', a: Math.min(m.texts.length, i + 8), b: m.texts.length })
      }
      post({ id, type: 'done', result: out })
    } else if (m.type === 'gen') {
      const gen = await load('llm', m.model, 'text-generation', m.tries, m.lib, id), t = await lib(m.lib)
      let n = 0
      const opts = { ...m.opts }
      if (t.TextStreamer && gen.tokenizer) opts.streamer = new t.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: () => { n++; post({ id, type: 'step', a: n, b: m.opts.max_new_tokens }) } })
      const out = await gen(m.messages, opts), g = out[0].generated_text
      post({ id, type: 'done', result: Array.isArray(g) ? g[g.length - 1].content || '' : String(g || '') })
    }
  } catch (err: any) {
    // tras un error del motor el modelo puede quedar inservible: se descarta y se vuelve a cargar en el próximo uso
    if (m.type !== 'load') { const k = m.type === 'gen' ? 'llm' : 'sem'; try { await P[k]?.dispose?.() } catch { /* */ } delete P[k]; delete O[k] }
    post({ id, type: 'error', error: errText(err) })
  }
}
