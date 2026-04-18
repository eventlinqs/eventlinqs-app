import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: ReactNode
  size?: 'sm' | 'md' | 'lg'
  id?: string
  className?: string
}

const titleSizes = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-2xl sm:text-3xl',
} as const

export function SectionHeader({
  eyebrow,
  title,
  size = 'md',
  id,
  className = '',
}: Props) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
          {eyebrow}
        </p>
        <h2 id={id} className={`font-display ${titleSizes[size]} font-bold text-ink-900`}>
          {title}
        </h2>
      </div>
    </div>
  )
}
