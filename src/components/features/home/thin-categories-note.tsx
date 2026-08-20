import Link from 'next/link'
import { Reveal } from '@/components/ui/reveal'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'

/**
 * THE HOMEPAGE SAYS WHAT IT HAS DONE.
 *
 * Founder ruling, 16 August 2026 (docs/roast/RAIL-MIN-RULING-2026-08-16.md).
 * `RAIL_MIN = 3` stands: a homepage rail is editorial curation, and a rail of
 * one reads as a broken shelf rather than as a choice. But the homepage may not
 * simply drop a category and say nothing, because "no rail" and "no events"
 * then look identical, which is the same silence the exclusion audit spent a
 * night closing everywhere else.
 *
 * So a category with one or two events on is NAMED here, with its real count,
 * linking to the same listing the rail would have linked to. Nothing is hidden;
 * a presentation rule is applied and then stated.
 *
 * It renders nothing when every category is either full or empty, so at real
 * density it disappears entirely rather than becoming furniture.
 */

export interface ThinCategory {
  /** Display name, as the rail would have titled it. */
  label: string
  /** The real number of events on. Always one or two by construction. */
  count: number
  /** Where the rail would have sent them. Must resolve 200. */
  href: string
}

export function ThinCategoriesNote({ categories }: { categories: ThinCategory[] }) {
  if (categories.length === 0) return null

  return (
    <section
      aria-labelledby="thin-categories-heading"
      className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}
    >
      <Reveal className={CONTAINER}>
        {/* The rail header treatment, unchanged: gold rule, gold eyebrow,
         *  rail-scale heading. This is a rail-shaped statement, so it wears the
         *  rail's chrome rather than inventing a band of its own. */}
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-1 h-8 w-0.5 shrink-0 bg-[var(--brand-accent-strong)]" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
              Also on
            </p>
            <h2
              id="thin-categories-heading"
              className="type-rail-heading font-headline uppercase tracking-tight text-[var(--text-primary)]"
            >
              On now, in smaller numbers
            </h2>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-[var(--text-secondary)]">
          A rail needs three events before it reads as a line-up rather than a gap, so these
          are listed here instead. They are on sale now, and every one of them is one tap away.
        </p>

        <ul className="mt-5 flex flex-wrap gap-3">
          {categories.map(c => (
            <li key={c.href}>
              <Link
                href={c.href}
                prefetch={false}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
              >
                {c.label}
                <span className="font-normal text-[var(--text-secondary)]">
                  {c.count} {c.count === 1 ? 'event' : 'events'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
