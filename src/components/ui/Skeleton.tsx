import { cn } from '@/lib/cn'

/** Siluetas grises que ocupan el sitio de una lista mientras se cargan los datos (en vez de un «vacío» que parpadea). */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Cargando…" className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-3xl border border-outline-2 bg-surface p-4">
          <div className="skeleton size-9 shrink-0 !rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${60 - i * 8}%` }} />
            <div className="skeleton h-3" style={{ width: `${40 + i * 6}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
