import { cn } from '@/lib/cn'

/** Icono de Material Symbols Rounded (el mismo juego de iconos de las apps originales). */
export function Icon({ name, className, fill, size }: { name: string; className?: string; fill?: boolean; size?: number }) {
  // indicador de carga: dibujado y centrado (el glifo de la fuente no está centrado y «baila» al girar); gira siempre
  if (name === 'progress_activity') return (
    <span aria-hidden="true" className={cn('ms ms-spin', className?.replace(/\banimate-spin\b/g, ''))} style={size ? { fontSize: size } : undefined}>
      <svg viewBox="0 0 24 24" width="1em" height="1em"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="40 100" /></svg>
    </span>
  )
  return (
    <span aria-hidden="true" className={cn('ms', fill && 'fill', className)} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  )
}
