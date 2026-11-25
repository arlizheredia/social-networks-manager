import { cn } from '@/lib/cn'
import { Icon } from './Icon'

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; icon?: string; badge?: number | string }[] }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-outline-2">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors', value === t.id ? 'text-primary' : 'text-text-2 hover:text-text')}>
          {t.icon && <Icon name={t.icon} className="!text-[20px]" />}{t.label}
          {t.badge != null && t.badge !== 0 && <span className="rounded-full bg-primary-container px-1.5 text-xs text-on-primary-container">{t.badge}</span>}
          {value === t.id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-primary" />}
        </button>
      ))}
    </div>
  )
}
