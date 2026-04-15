import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-medium rounded-lg',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[var(--brand-accent)]',
  'active:scale-[0.98] active:duration-[80ms]',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
].join(' ')

const variants: Record<Variant, string> = {
  primary: [
    'bg-[var(--brand-accent)] text-white shadow-md',
    'hover:bg-[var(--brand-accent-hover)] hover:shadow-lg hover:-translate-y-0.5',
    'active:bg-[var(--brand-accent-active)] active:shadow-sm active:translate-y-0',
  ].join(' '),
  secondary: [
    'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-sm',
    'hover:bg-[var(--surface-1)] hover:shadow-md hover:-translate-y-0.5',
    'active:bg-[var(--surface-2)] active:shadow-sm active:translate-y-0',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--text-primary)]',
    'hover:bg-[var(--surface-1)]',
    'active:bg-[var(--surface-2)]',
  ].join(' '),
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
  lg: 'h-12 px-6 text-base',
}

function cls(variant: Variant, size: Size, className = '') {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(' ')
}

// ── Button (renders <button>) ─────────────────────────────────────────────────

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
  href?: undefined
}

// ── ButtonLink (renders <Link> when href is provided) ────────────────────────

type ButtonLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> & {
  variant?: Variant
  size?: Size
  href: string
}

type Props = ButtonProps | ButtonLinkProps

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: Props) {
  if ('href' in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as ButtonLinkProps
    return (
      <Link href={href} className={cls(variant, size, className)} {...linkRest}>
        {children}
      </Link>
    )
  }

  const { href: _href, ...btnRest } = rest as ButtonProps & { href?: undefined }
  void _href
  return (
    <button className={cls(variant, size, className)} {...btnRest}>
      {children}
    </button>
  )
}

// Named export for getting classes without the component (useful for <Link> wrappers)
export { cls as buttonCls }
