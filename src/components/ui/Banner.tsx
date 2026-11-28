import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

type Tone = 'info' | 'ok' | 'warn' | 'err'
const tones: Record<Tone, string> = {
  info: 'bg-primary-container text-on-primary-container',
  ok: 'bg-success-container text-success',
  warn: 'bg-warn-container text-warn',
  err: 'bg-error-container text-error',
}
const icons: Record<Tone, string> = { info: 'info', ok: 'check_circle', warn: 'warning', err: 'error' }

export function Banner({ tone = 'info', icon, children, action, className }: { tone?: Tone; icon?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    // si no hay sitio, la acción pasa debajo del texto (a la derecha) en lugar de estrecharlo
    <div role={tone === 'err' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3', tones[tone], className)}>
      <div className="flex min-w-[min(100%,16rem)] flex-1 items-center gap-3">
        <Icon name={icon ?? icons[tone]} className="!text-[20px]" />
        <div className="min-w-0 flex-1 [&_b]:font-medium">{children}</div>
      </div>
      {action && <div className="ml-auto max-w-full shrink-0">{action}</div>}
    </div>
  )
}
