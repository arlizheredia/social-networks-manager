import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Pestañas con un indicador que se desliza hasta la pestaña activa. En pantallas estrechas se reparten el ancho
 * disponible (icono arriba y nombre corto debajo, sin salirse de la pantalla); desde 640 px, en fila.
 */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; short?: string; icon?: string; badge?: number | string }[] }) {
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
          title={t.label}
          className={cn('relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-1 pt-2 pb-2.5 text-xs font-medium transition-colors sm:inline-flex sm:flex-none sm:basis-auto sm:shrink-0 sm:flex-row sm:gap-2 sm:px-4 sm:py-3 sm:text-sm', value === t.id ? 'text-primary' : 'text-text-2 hover:text-text')}>
          <span className="inline-flex items-center gap-1 sm:contents">
            {t.icon && <Icon name={t.icon} className="!text-[20px]" />}
            {t.badge != null && t.badge !== 0 && <span className="rounded-full bg-primary-container px-1.5 text-[11px] leading-4 text-on-primary-container sm:order-last sm:text-xs">{t.badge}</span>}
          </span>
          <span className="max-w-full truncate text-center leading-4 sm:overflow-visible sm:leading-5">
            <span className="sm:hidden">{t.short ?? t.label}</span><span className="hidden sm:inline">{t.label}</span>
          </span>
        </button>
      ))}
      {bar && <span aria-hidden className="pointer-events-none absolute bottom-0 h-[3px] rounded-t bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ left: bar.left, width: bar.width }} />}
    </div>
  )
}
