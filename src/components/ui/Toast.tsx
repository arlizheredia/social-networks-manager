import { create } from 'zustand'
import { Icon } from './Icon'

interface ToastItem { id: number; text: string; icon?: string }
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }))
let seq = 0

/** Muestra un aviso breve en la parte inferior. */
export function toast(text: string, icon?: string) {
  const id = ++seq
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, icon }] }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3800)
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm text-bg shadow-3">
          {t.icon && <Icon name={t.icon} className="!text-[20px]" />}
          {t.text}
        </div>
      ))}
    </div>
  )
}
