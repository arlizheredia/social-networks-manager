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
    <div role={tone === 'err' ? 'alert' : 'status'} className={cn('flex items-center gap-3 rounded-2xl px-4 py-3', tones[tone], className)}>
      <Icon name={icon ?? icons[tone]} className="!text-[20px]" />
      <div className="min-w-0 flex-1 [&_b]:font-medium">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
