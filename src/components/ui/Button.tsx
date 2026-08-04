import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'
type Surface = 'light' | 'dark'

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-medium rounded-lg',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[var(--brand-accent)]',
  'active:scale-[0.98] active:duration-[80ms]',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
].join(' ')

/**
 * Light-surface variants (default).
 * Primary uses text-[var(--text-primary)] (near-black on gold) per DESIGN-SYSTEM §3:
 * "Gold buttons use --ink-900 text, NOT white." Contrast ratio ~7.4:1 (WCAG AAA).
 */
// Luxury pass 2026-07-12: shadows come from the navy-tinted house family
// (never the grey Tailwind defaults), and the primary hover blooms GOLD -
// the same light the FeaturedHero CTA already carries, made systemic.
const variants: Record<Variant, string> = {
  primary: [
    'bg-[var(--brand-accent)] text-[var(--text-primary)] shadow-[0_2px_8px_rgba(10,22,40,0.14)]',
    'hover:bg-[var(--brand-accent-hover)] hover:shadow-[0_10px_28px_rgba(212,160,23,0.30)] hover:-translate-y-0.5',
    'active:bg-[var(--brand-accent-active)] active:shadow-[0_2px_6px_rgba(10,22,40,0.14)] active:translate-y-0',
  ].join(' '),
  secondary: [
    'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(10,22,40,0.08)]',
    'hover:bg-[var(--surface-1)] hover:shadow-[0_6px_16px_rgba(10,22,40,0.12)] hover:-translate-y-0.5',
    'active:bg-[var(--surface-2)] active:shadow-[0_1px_3px_rgba(10,22,40,0.08)] active:translate-y-0',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--text-primary)]',
    'hover:bg-[var(--surface-1)]',
    'active:bg-[var(--surface-2)]',
  ].join(' '),
}

/**
 * Dark-surface variant overrides.
 * Used when the button sits on a dark (navy/black) background section.
 * Primary is unchanged - gold reads clearly on dark with no adjustment needed.
 */
const darkSurface: Partial<Record<Variant, string>> = {
  ghost: [
    'bg-transparent text-white',
    'hover:bg-white/10',
    'active:bg-white/20',
  ].join(' '),
  secondary: [
    'bg-white/10 text-white shadow-none',
    'hover:bg-white/20 hover:-translate-y-0.5',
    'active:bg-white/20 active:translate-y-0',
  ].join(' '),
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
  lg: 'h-12 px-6 text-base',
}

function cls(variant: Variant, size: Size, onSurface: Surface, className = '') {
  const variantCls = onSurface === 'dark' && darkSurface[variant]
    ? darkSurface[variant]!
    : variants[variant]
  return [base, variantCls, sizes[size], className].filter(Boolean).join(' ')
}

// ── Button (renders <button>) ─────────────────────────────────────────────────

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
  onSurface?: Surface
  href?: undefined
}

// ── ButtonLink (renders <Link> when href is provided) ────────────────────────

type ButtonLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> & {
  variant?: Variant
  size?: Size
  onSurface?: Surface
  href: string
}

type Props = ButtonProps | ButtonLinkProps

export function Button({
  variant = 'primary',
  size = 'md',
  onSurface = 'light',
  className,
  children,
  ...rest
}: Props) {
  if ('href' in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as ButtonLinkProps
    return (
      <Link href={href} className={cls(variant, size, onSurface, className)} {...linkRest}>
        {children}
      </Link>
    )
  }

  const { href: _href, ...btnRest } = rest as ButtonProps & { href?: undefined }
  void _href
  return (
    <button className={cls(variant, size, onSurface, className)} {...btnRest}>
      {children}
    </button>
  )
}
