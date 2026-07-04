import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: ReactNode
  size?: 'sm' | 'md' | 'lg'
  id?: string
  className?: string
}

// Rail/section headings are law-bound to the measured competitor scale:
// 24px at desktop, 22px at mobile (.type-rail-heading, globals.css). The old
// md/lg presets (text-2xl / sm:text-3xl) ran up to 30px - above the law.
// 'sm' remains a compact 20px tier for sidebar/aside headings only.
const titleSizes = {
  sm: 'text-xl font-bold',
  md: 'type-rail-heading',
  lg: 'type-rail-heading',
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
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
          {eyebrow}
        </p>
        <h2 id={id} className={`font-display ${titleSizes[size]} text-ink-900`}>
          {title}
        </h2>
      </div>
    </div>
  )
}
