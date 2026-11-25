import { useState } from 'react'
import { Icon } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useAI } from './engine'
import { AIDialog } from './AIDialog'

/** Estado de la IA única de la app, siempre visible en la barra superior. */
export function AIStatusChip() {
  const { installed, busy, pct, task, checked } = useAI()
  const [open, setOpen] = useState(false)
  if (!checked) return null
  const label = busy ? `Instalando IA ${pct} %` : task ? `${task.label}${task.pct != null ? ` ${task.pct} %` : '…'}` : installed ? 'IA lista' : 'Instalar IA'
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="IA de la app"
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors',
          installed && !busy && !task ? 'text-text-2 hover:bg-text/8' : 'bg-primary-container text-on-primary-container',
        )}
      >
        <Icon name={busy || task ? 'progress_activity' : 'auto_awesome'} fill={installed} className={cn('!text-[18px]', (busy || task) && 'animate-spin')} />
        <span className="hidden max-w-48 truncate sm:inline">{label}</span>
      </button>
      <AIDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
