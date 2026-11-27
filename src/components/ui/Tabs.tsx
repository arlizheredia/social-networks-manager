import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/** Pestañas con un indicador que se desliza hasta la pestaña activa. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; icon?: string; badge?: number | string }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (el) setBar({ left: el.offsetLeft + 12, width: el.offsetWidth - 24 })
    }
    place()
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [value, tabs.length])
  return (
    <div ref={ref} role="tablist" className="relative mb-5 flex gap-1 overflow-x-auto border-b border-outline-2">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors', value === t.id ? 'text-primary' : 'text-text-2 hover:text-text')}>
          {t.icon && <Icon name={t.icon} className="!text-[20px]" />}{t.label}
          {t.badge != null && t.badge !== 0 && <span className="rounded-full bg-primary-container px-1.5 text-xs text-on-primary-container">{t.badge}</span>}
        </button>
      ))}
      {bar && <span aria-hidden className="pointer-events-none absolute bottom-0 h-[3px] rounded-t bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ left: bar.left, width: bar.width }} />}
    </div>
  )
}
