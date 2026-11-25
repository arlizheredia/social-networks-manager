import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Menú desplegable anclado a un botón. */
export function Popover({ trigger, children, className, align = 'left' }: { trigger: (open: () => void, isOpen: boolean) => ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
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
        <div className={cn(
          'absolute top-full z-40 mt-1 max-h-[60vh] max-w-[calc(100vw-32px)] min-w-56 overflow-y-auto rounded-2xl bg-surface-2 p-2 shadow-3',
          // sin ancho propio, el menú crece hasta que cada opción cabe en una línea
          !/(^|\s)w-/.test(className ?? '') && 'w-max',
          align === 'right' ? 'right-0' : 'left-0', className,
        )}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, sub, danger }: { icon?: string; children: ReactNode; onClick: () => void; sub?: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-text/8', danger && 'text-error')}>
      {icon && <span className="ms !text-[20px]">{icon}</span>}
      <span className="min-w-0 flex-1"><span className="block truncate">{children}</span>{sub && <span className="block truncate text-xs text-text-2">{sub}</span>}</span>
    </button>
  )
}
