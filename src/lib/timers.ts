/**
 * Temporizador en un Web Worker: Chrome retrasa los temporizadores de las pestañas en segundo plano
 * (hasta 1 por minuto tras 5 min ocultas); los del worker mantienen la pausa exacta.
 */
export const wsleep: (ms: number) => Promise<void> = (() => {
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })))
    const P: Record<number, () => void> = {}
    let n = 0
    w.onmessage = (e) => { const r = P[e.data]; delete P[e.data]; r?.() }
    return (ms: number) => new Promise<void>((r) => { const id = ++n; P[id] = r; w.postMessage({ id, ms }) })
  } catch {
    return (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  }
})()

export function beep() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.08, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.35)
    o.connect(g).connect(a.destination)
    o.start(); o.stop(a.currentTime + 0.36)
    setTimeout(() => a.close(), 600)
  } catch { /* sin audio */ }
}

export const fileToDataUrl = (f: Blob) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
