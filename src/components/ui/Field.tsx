import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
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
        <input ref={ref} className={cn(base, 'h-12', icon && 'pl-10', trail && 'pr-28', className)} {...rest} />
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
    <select className={cn(base, 'snm-select h-10 cursor-pointer pr-10', className)} {...rest}>
      {children}
    </select>
  )
}

/** Interruptor Material 3 (sin texto). Para un interruptor con etiqueta, usar Switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-8 w-13 shrink-0 items-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40',
        checked ? 'border-primary bg-primary' : 'border-outline bg-surface-3',
      )}
    >
      <span className={cn('absolute rounded-full transition-all duration-150', checked ? 'left-[22px] size-6 bg-on-primary' : 'left-1.5 size-4 bg-outline')} />
    </button>
  )
}

/** Interruptor con etiqueta y descripción. */
export function Switch({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onChange(!checked)}>
        <div className="text-text">{label}</div>
        {sub && <div className="text-xs text-text-2">{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={typeof label === 'string' ? label : 'Activar'} />
    </div>
  )
}

export function Chip({ selected, onClick, children, icon }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium whitespace-nowrap transition-colors [&_.ms]:text-[18px]',
        selected ? 'border-transparent bg-secondary-container text-on-secondary-container' : 'border-outline-2 text-text-2 hover:bg-text/8',
      )}
    >
      {selected ? <Icon name="check" /> : icon && <Icon name={icon} />}
      {typeof children === 'string' ? <span className="min-w-0 truncate">{children}</span> : children}
    </button>
  )
}

/**
 * Campo numérico que se puede borrar y reescribir con libertad: mientras se escribe solo se guarda un valor
 * válido y dentro del rango; al salir del campo se ajusta al rango (o se recupera el último valor si quedó vacío).
 */
export function NumberField({ value, onChange, min, max, step = 1, disabled, className, label, onOutOfRange }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; className?: string; label?: string
  /** Aviso opcional cuando al salir del campo el número estaba fuera del rango. */
  onOutOfRange?: (typed: number, fixed: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(String(value)) }, [value, editing])
  const inRange = (n: number) => (min == null || n >= min) && (max == null || n <= max)
  const clampN = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && inRange(n)) onChange(n)
      }}
      onBlur={() => {
        setEditing(false)
        const n = Number(text)
        if (text.trim() === '' || !Number.isFinite(n)) { setText(String(value)); return }
        const fixed = clampN(Math.round(n))
        if (fixed !== n) onOutOfRange?.(n, fixed)
        if (fixed !== value) onChange(fixed)
        setText(String(fixed))
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn('h-10 w-24 rounded-xl border border-outline bg-surface px-3 text-text disabled:opacity-50', className)}
    />
  )
}
