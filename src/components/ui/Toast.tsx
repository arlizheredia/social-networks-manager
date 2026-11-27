import { create } from 'zustand'
import { Icon } from './Icon'

export interface ToastAction { label: string; href?: string; onClick?: () => void }
interface ToastItem { id: number; text: string; icon?: string; action?: ToastAction; leaving?: boolean }
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }))
let seq = 0

/** Cierra con animación de salida y luego lo quita. */
const close = (id: number) => {
  useToasts.setState((s) => ({ items: s.items.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 180)
}

/** Muestra un aviso breve en la parte inferior. Con acción, dura más para dar tiempo a pulsarla. */
export function toast(text: string, icon?: string, action?: ToastAction) {
  const id = ++seq
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, icon, action }] }))
  setTimeout(() => close(id), action ? 10000 : 3800)
}

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm text-bg shadow-3 ${t.leaving ? 'anim-toast-out' : 'anim-toast-in'}`}>
          {t.icon && <Icon name={t.icon} className="!text-[20px]" />}
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (t.action.href
            ? <a href={t.action.href} onClick={() => { t.action!.onClick?.(); close(t.id) }} className="shrink-0 font-medium text-primary-container no-underline hover:underline">{t.action.label}</a>
            : <button onClick={() => { t.action!.onClick?.(); close(t.id) }} className="shrink-0 font-medium text-primary-container hover:underline">{t.action.label}</button>)}
        </div>
      ))}
    </div>
  )
}
