import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import { Icon } from './Icon'

/**
 * Editor de texto a pantalla completa (para escribir y revisar con comodidad un informe largo). Edita el mismo texto
 * que el campo del que se abre; se cierra con «Esc» o con el botón y el texto queda donde estaba. Es un <dialog>
 * modal: se abre por encima de todo, también de otro diálogo abierto.
 */
export function FullEditor({ open, onClose, title, value, onChange, actions }: { open: boolean; onClose: () => void; title: ReactNode; value: string; onChange: (v: string) => void; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); requestAnimationFrame(() => area.current?.focus({ preventScroll: true })) }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} aria-label="Editor a pantalla completa" onCancel={(e) => { e.preventDefault(); onClose() }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-surface p-0 text-text">
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-2 px-3 py-2 sm:px-6">
            <Icon name="edit_note" className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
            {actions && <div className="order-last flex w-full flex-wrap gap-2 sm:order-none sm:w-auto [&>button]:grow sm:[&>button]:grow-0">{actions}</div>}
            <IconButton icon="close_fullscreen" label="Salir de pantalla completa (Esc)" onClick={onClose} />
          </div>
          <textarea ref={area} value={value} onChange={(e) => onChange(e.target.value)} spellCheck aria-label="Texto"
            className="min-h-0 w-full flex-1 resize-none bg-surface px-4 py-4 font-mono text-sm leading-6 text-text outline-none sm:px-8 sm:text-[15px]" />
        </div>
      )}
    </dialog>
  )
}
