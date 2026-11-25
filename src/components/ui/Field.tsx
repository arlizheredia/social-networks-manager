import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

const base = 'w-full rounded-xl border border-outline bg-surface px-3.5 text-text placeholder:text-text-3 transition-colors hover:border-text focus:border-primary focus:outline-2 focus:outline-primary focus:-outline-offset-2 disabled:opacity-50'

export function Field({ label, hint, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('mb-4', className)}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-text-2">{label}</label>}
      {children}
      {hint && <div className="mt-1.5 text-xs text-text-2">{hint}</div>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: string; trail?: ReactNode }>(
  function Input({ icon, trail, className, ...rest }, ref) {
    return (
      <div className="relative flex items-center">
        {icon && <Icon name={icon} className="pointer-events-none absolute left-3 !text-[20px] text-text-2" />}
        <input ref={ref} className={cn(base, 'h-12', icon && 'pl-10', trail && 'pr-24', className)} {...rest} />
        {trail && <div className="absolute right-1.5 flex items-center gap-0.5">{trail}</div>}
      </div>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(base, 'min-h-28 resize-y py-3 leading-6', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, 'h-10 cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-text">{label}</div>
        {sub && <div className="text-xs text-text-2">{sub}</div>}
      </div>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-8 w-13 shrink-0 rounded-full border-2 border-outline bg-surface-3 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:top-1/2 after:left-1.5 after:size-4 after:-translate-y-1/2 after:rounded-full after:bg-outline after:transition-all peer-checked:after:left-6 peer-checked:after:size-6 peer-checked:after:bg-on-primary" />
    </label>
  )
}

export function Chip({ selected, onClick, children, icon }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors [&_.ms]:text-[18px]',
        selected ? 'border-transparent bg-secondary-container text-on-secondary-container' : 'border-outline-2 text-text-2 hover:bg-text/8',
      )}
    >
      {selected ? <Icon name="check" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  )
}
