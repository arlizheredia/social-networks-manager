import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  filled: 'bg-primary text-on-primary hover:shadow-1 disabled:bg-text/10 disabled:text-text/40',
  tonal: 'bg-secondary-container text-on-secondary-container hover:shadow-1 disabled:bg-text/10 disabled:text-text/40',
  outlined: 'border border-outline text-primary hover:bg-primary/8 disabled:border-text/12 disabled:text-text/40',
  text: 'text-primary hover:bg-primary/8 disabled:text-text/40',
  danger: 'bg-error text-on-primary hover:shadow-1 disabled:bg-text/10 disabled:text-text/40',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 [&_.ms]:text-[18px]',
  md: 'h-10 px-5 text-sm gap-2 [&_.ms]:text-[18px]',
  lg: 'h-12 px-6 text-[15px] gap-2 [&_.ms]:text-[20px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-[background,box-shadow] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
})

export function IconButton({
  icon, label, className, active, size = 'md', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-text/8 disabled:opacity-40',
        size === 'sm' ? 'size-8 [&_.ms]:text-[18px]' : 'size-10',
        active && 'bg-secondary-container text-on-secondary-container',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
