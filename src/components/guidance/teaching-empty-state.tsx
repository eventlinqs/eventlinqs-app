import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * An empty state that teaches.
 *
 * Nothing on this platform is allowed to render a blank panel with a shrug on
 * it. The research position (Nielsen Norman Group, Empty States in Application
 * Design) is that an empty state has three jobs: say what the system state is,
 * teach what this area is for, and offer the direct path to fill it. This
 * component enforces all three by making them required props, so an empty
 * state cannot be added without saying something useful.
 *
 * Shared, never per page: the same component backs every teaching empty state
 * on the seating surfaces.
 */
export function TeachingEmptyState({
  eyebrow,
  title,
  status,
  teach,
  guide,
  action,
  className = '',
}: {
  /** Where the person is, e.g. "Reserved seating". */
  eyebrow: string
  /** What this area becomes once it is not empty. */
  title: string
  /** The system status: why it is empty right now, said plainly. */
  status: string
  /** What this area is for, in one or two sentences. */
  teach: string
  /** The written guide that covers it properly. */
  guide: { slug: string; title: string }
  /** The direct path to fill it, when the person can act from here. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-sm ${className}`}
    >
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
        {eyebrow}
      </p>
      <h3 className="mt-1 font-display text-lg font-bold text-ink-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">{status}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">{teach}</p>

      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}

      <Link
        href={`/guides/${guide.slug}`}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-800 underline decoration-gold-500 decoration-2 underline-offset-4 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        {guide.title}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
