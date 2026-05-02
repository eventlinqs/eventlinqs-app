import type { ReactNode } from 'react'

/**
 * GlassCard - glassmorphism primitive used for overlays on imagery,
 * floating info chips, and sticky action bars.
 *
 * Variants:
 *   - 'dark'          : translucent navy for chips/pills on dark imagery
 *   - 'light'         : frosted white for chips on bright surfaces
 *   - 'light-on-dark' : solid cream card with gold frame for ribbon cards
 *                       that sit on dark imagery and need readable ink text
 */

interface Props {
  children: ReactNode
  className?: string
  variant?: 'light' | 'dark' | 'light-on-dark'
  as?: 'div' | 'aside' | 'section'
}

export function GlassCard({
  children,
  className = '',
  variant = 'dark',
  as: Tag = 'div',
}: Props) {
  let base: string
  if (variant === 'dark') {
    base =
      'bg-ink-900/[0.92] backdrop-blur-2xl border border-gold-500/50 shadow-[0_0_0_1px_rgba(212,160,23,0.15),0_24px_48px_rgba(0,0,0,0.5),0_0_80px_rgba(212,160,23,0.10)]'
  } else if (variant === 'light-on-dark') {
    base =
      'bg-canvas border-2 border-gold-500 text-ink-900 shadow-[0_24px_48px_rgba(0,0,0,0.5),_0_0_0_1px_rgba(212,160,23,0.2)]'
  } else {
    base = 'bg-white/60 backdrop-blur-md border border-white/40'
  }
  return <Tag className={`${base} ${className}`}>{children}</Tag>
}
