import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, children, filled }: { className?: string; children: ReactNode; filled?: boolean }) {
  return (
    <div className={cn('rounded-3xl p-4 min-[400px]:p-5 sm:p-6', filled ? 'bg-surface-2' : 'border border-outline-2 bg-surface', className)}>
      {children}
    </div>
  )
}

export function CardHead({ step, title, sub, actions }: { step?: number | string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    // si no hay sitio, los botones pasan arriba a la derecha y el texto ocupa todo el ancho debajo
    <div className="mb-4 flex flex-wrap-reverse items-end gap-x-3 gap-y-2">
      <div className="flex min-w-[min(100%,26rem)] flex-1 items-start gap-3">
        {step !== undefined && (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-container text-[13px] font-medium text-on-primary-container">{step}</span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-7 text-text">{title}</h2>
          {sub && <div className="text-[13px] text-text-2">{sub}</div>}
        </div>
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] leading-9 text-text">{title}</h1>
        {sub && <p className="mt-1 text-text-2">{sub}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, icon, tone = 'primary' }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'primary' | 'success' | 'error' | 'warn' }) {
  const tones = {
    primary: 'bg-primary-container text-on-primary-container',
    success: 'bg-success-container text-success',
    error: 'bg-error-container text-error',
    warn: 'bg-warn-container text-warn',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-outline-2 bg-surface p-4">
      <div className={cn('grid size-10 place-items-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-text-2">{label}</div>
        <div className="font-display text-xl tabular-nums text-text">{value}</div>
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-full bg-surface-2 text-text-2">{icon}</div>
      <h3 className="mb-1 text-base text-text">{title}</h3>
      {children && <div className="max-w-md text-text-2">{children}</div>}
    </div>
  )
}
