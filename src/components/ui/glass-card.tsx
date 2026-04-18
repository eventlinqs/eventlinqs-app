import type { ReactNode } from 'react'

/**
 * GlassCard — glassmorphism primitive used for overlays on imagery,
 * floating info chips, and sticky action bars. Dark variant over
 * dark imagery, light variant over light surfaces.
 */

interface Props {
  children: ReactNode
  className?: string
  variant?: 'light' | 'dark'
  as?: 'div' | 'aside' | 'section'
}

export function GlassCard({
  children,
  className = '',
  variant = 'dark',
  as: Tag = 'div',
}: Props) {
  const base =
    variant === 'dark'
      ? 'bg-ink-900/30 backdrop-blur-md border border-white/10'
      : 'bg-white/60 backdrop-blur-md border border-white/40'
  return <Tag className={`${base} ${className}`}>{children}</Tag>
}
