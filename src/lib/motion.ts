import { useEffect, useRef, useState } from 'react'

/** El usuario pidió reducir el movimiento en su sistema: las animaciones se omiten. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Pliega un elemento (fila de una lista) antes de quitarlo, para que se vea qué desaparece y la lista no salte.
 * Devuelve una promesa que se cumple al terminar; si no hay elemento o se reduce el movimiento, se cumple al instante.
 */
export function collapseOut(el: Element | null | undefined): Promise<void> {
  const e = el as HTMLElement | null
  if (!e || reducedMotion() || typeof e.animate !== 'function') return Promise.resolve()
  const h = e.offsetHeight
  e.style.overflow = 'hidden'
  const a = e.animate([
    { height: `${h}px`, opacity: 1, transform: 'translateX(0)' },
    { height: `${h}px`, opacity: 0, transform: 'translateX(12px)', offset: 0.45 },
    { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderWidth: '0px' },
  ], { duration: 260, easing: 'ease-in', fill: 'forwards' })
  return a.finished.then(() => undefined, () => undefined)
}
/** Fila más cercana marcada con data-row (para collapseOut). */
export const rowOf = (el: EventTarget | null) => (el instanceof Element ? el.closest('[data-row]') : null)

/** Número que cuenta hasta su valor (al aparecer y al cambiar). */
export function useCountUp(value: number, ms = 700) {
  const [v, setV] = useState(reducedMotion() ? value : 0)
  const from = useRef(reducedMotion() ? value : 0)
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) { setV(value); from.current = value; return }
    const a = from.current, t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3)
      const x = a + (value - a) * e
      setV(Number.isInteger(value) ? Math.round(x) : Math.round(x * 10) / 10)
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return v
}

/**
 * Confirmación visual al copiar: el icono del botón pulsado pasa a ✓ durante 1,5 s.
 * Se llama desde copyText, así que vale para todos los botones de copiar de la app.
 */
export function flashCopied(btn: Element | null) {
  const b = btn instanceof Element ? (btn.closest('button, a') as HTMLElement | null) : null
  if (!b) return
  const ic = b.querySelector('.ms')
  const prev = ic?.textContent
  b.classList.add('anim-copied')
  if (ic) ic.textContent = 'check'
  setTimeout(() => { b.classList.remove('anim-copied'); if (ic && ic.textContent === 'check') ic.textContent = prev ?? '' }, 1500)
}

/** Pliega a la vez todas las filas marcadas con data-row-id de esos identificadores (borrados de uno o de varios). */
export function collapseRows(ids: string[]): Promise<void> {
  const q = (x: string) => (typeof globalThis.CSS?.escape === 'function' ? CSS.escape(x) : x.replace(/["\\]/g, '\\$&'))
  const els = ids.flatMap((id) => [...document.querySelectorAll(`[data-row-id="${q(id)}"]`)])
  return Promise.all(els.map((e) => collapseOut(e))).then(() => undefined)
}
