import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Menú desplegable anclado a un botón. */
export function Popover({ trigger, children, className, align = 'left' }: { trigger: (open: () => void, isOpen: boolean) => ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  /**
   * Posición fija calculada contra el área visible (sin la barra de desplazamiento): el menú nunca se sale de la
   * ventana ni lo recorta un contenedor con desplazamiento; si no cabe debajo del botón, se abre hacia arriba.
   */
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const m = menu.current, a = ref.current
      if (!m || !a) return
      const ar = a.getBoundingClientRect(), M = 8, GAP = 4
      const W = document.documentElement.clientWidth || window.innerWidth, H = document.documentElement.clientHeight || window.innerHeight
      const w = Math.min(m.offsetWidth, W - 2 * M)
      let left = align === 'right' ? ar.right - w : ar.left
      left = Math.max(M, Math.min(left, W - M - w))
      const below = H - ar.bottom - GAP - M, above = ar.top - GAP - M
      const natural = m.scrollHeight
      const up = natural > below && above > below
      const maxHeight = Math.max(120, Math.min(H * 0.6, up ? above : below))
      setPos(up ? { left, bottom: H - ar.top + GAP, maxHeight } : { left, top: ar.bottom + GAP, maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, align])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <div ref={menu} style={pos ?? { left: 0, top: 0 }} className={cn(
          'fixed z-50 max-w-[calc(100vw-16px)] min-w-[min(100%,14rem)] overflow-y-auto rounded-2xl bg-surface-2 p-2 shadow-3',
          !pos && 'invisible',
          pos && (pos.bottom != null ? 'anim-pop-up' : 'anim-pop'),
          // sin ancho propio, el menú crece hasta que cada opción cabe en una línea
          !/(^|\s)w-/.test(className ?? '') && 'w-max',
          className,
        )}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, sub, danger, disabled }: { icon?: string; children: ReactNode; onClick: () => void; sub?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-text/8 disabled:pointer-events-none disabled:opacity-40', danger && 'text-error')}>
      {icon && <span className="ms !text-[20px]">{icon}</span>}
      <span className="min-w-0 flex-1"><span className="block truncate">{children}</span>{sub && <span className="block truncate text-xs text-text-2">{sub}</span>}</span>
    </button>
  )
}
