import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reducedMotion } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

export function Dialog({
  open, onClose, title, icon, children, actions, wide, className,
}: {
  open: boolean; onClose: () => void; title: ReactNode; icon?: ReactNode; children: ReactNode; actions?: ReactNode; wide?: boolean; className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // el contenido sigue montado mientras dura la animación de cierre
  const [shown, setShown] = useState(open)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open) { setShown(true); d.classList.remove('closing'); if (!d.open) d.showModal(); return }
    if (!d.open) { setShown(false); return }
    if (reducedMotion()) { d.close(); setShown(false); return }
    d.classList.add('closing')
    const t = setTimeout(() => { d.classList.remove('closing'); d.close(); setShown(false) }, 140)
    return () => clearTimeout(t)
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={cn(
        'm-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[28px] border-0 bg-surface p-0 text-text shadow-3',
        wide && 'w-[min(860px,calc(100vw-32px))]',
        className,
      )}
    >
      {(open || shown) && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-center gap-3 px-6 pt-5 pb-3">
            {icon}
            <h2 className="min-w-0 flex-1 text-[22px] leading-7">{title}</h2>
            <IconButton icon="close" label="Cerrar" onClick={onClose} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
          {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-outline-2 px-6 py-3">{actions}</div>}
        </div>
      )}
    </dialog>
  )
}
