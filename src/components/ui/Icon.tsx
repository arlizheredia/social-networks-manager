import { cn } from '@/lib/cn'

/** Icono de Material Symbols Rounded (el mismo juego de iconos de las apps originales). */
export function Icon({ name, className, fill, size }: { name: string; className?: string; fill?: boolean; size?: number }) {
  return (
    <span aria-hidden="true" className={cn('ms', fill && 'fill', className)} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  )
}
