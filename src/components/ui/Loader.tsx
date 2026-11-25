import { cn } from '@/lib/cn'

/** Indicador de carga: logo de la app con un anillo de progreso (Material 3) animado, centrado en la ventana. */
export function Loader({ label = 'Cargando…', className, full }: { label?: string; className?: string; full?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={cn('grid place-items-center', full ? 'min-h-dvh' : 'pointer-events-none fixed inset-0 z-20', className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="snm-loader">
          <svg viewBox="0 0 64 64" className="snm-loader-ring" aria-hidden="true">
            <circle cx="32" cy="32" r="28" className="snm-loader-track" />
            <circle cx="32" cy="32" r="28" className="snm-loader-arc" />
          </svg>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="snm-loader-logo" />
        </div>
        <span className="text-sm text-text-2">{label}</span>
      </div>
    </div>
  )
}
