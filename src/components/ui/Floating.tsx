import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Posición de cada ventana durante la sesión (al volver a abrirla aparece donde se dejó). */
const POS = new Map<string, { x: number; y: number }>()
const M = 8 // margen mínimo con el borde de la ventana del navegador

/**
 * Ventana flotante que se arrastra desde su cabecera. Aparece centrada en el área del navegador la primera vez; no
 * bloquea la página (se puede seguir usando la app detrás) y nunca se sale de la pantalla.
 */
export function FloatingWindow({ id, head, children, className, label }: { id: string; head: ReactNode; children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(POS.get(id) ?? null)
  const clamp = useCallback((p: { x: number; y: number }) => {
    const el = ref.current
    const w = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight
    return { x: Math.min(Math.max(M, p.x), Math.max(M, W - w - M)), y: Math.min(Math.max(M, p.y), Math.max(M, H - Math.min(h, 56) - M)) }
  }, [])
  // centrada la primera vez
  useLayoutEffect(() => {
    if (pos || !ref.current) return
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight
    setPos(clamp({ x: (W - ref.current.offsetWidth) / 2, y: (H - ref.current.offsetHeight) / 2 }))
  }, [pos, clamp])
  useEffect(() => { if (pos) POS.set(id, pos) }, [id, pos])
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea') || !pos) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => { if (drag.current) setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })) }
  const onUp = () => { drag.current = null }
  return (
    <div ref={ref} role="dialog" aria-label={label} aria-modal="false"
      className={cn('fixed z-40 flex flex-col overflow-hidden rounded-[28px] bg-surface shadow-3 ring-1 ring-outline-2', !pos && 'invisible', className)}
      style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0 }}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className="flex cursor-grab touch-none items-center gap-3 border-b border-outline-2 px-5 py-3 select-none active:cursor-grabbing" title="Arrastra para mover la ventana">
        {head}
      </div>
      {children}
    </div>
  )
}
