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
      {/* Design elevation 2026-07-12: the gold keyline gains a grounded foot
          (a 2px node) - the house section mark - and the eyebrow uses the one
          platform eyebrow utility. */}
      <div className="mt-1 flex h-8 w-0.5 shrink-0 flex-col" aria-hidden>
        <span className="min-h-0 flex-1 bg-gold-500" />
        <span className="h-[3px] w-[3px] -ml-px self-center bg-gold-700" />
      </div>
      <div>
        <p className="type-eyebrow font-display text-gold-700">
          {eyebrow}
        </p>
        <h2 id={id} className={`font-display ${titleSizes[size]} text-ink-900`}>
          {title}
        </h2>
      </div>
    </div>
  )
}
