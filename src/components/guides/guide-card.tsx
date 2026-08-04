import Link from 'next/link'
import { Clock } from 'lucide-react'
import { GuideCardImage } from '@/components/media'
import type { GuideIndexEntry } from './guide-index'

/**
 * A guide tile. The WHOLE tile is one link (Law 5, the affordance law), the
 * touch target is the card, and the image is a real screenshot of the screen
 * the guide teaches, so the organiser recognises where they are going before
 * they arrive.
 */
export function GuideCard({ guide }: { guide: GuideIndexEntry }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-md transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl focus-visible:-translate-y-1 focus-visible:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--surface-1)]">
        <GuideCardImage src={guide.heroSrc} alt={guide.heroAlt} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="type-eyebrow font-display text-[var(--brand-accent-strong)]">
          {guide.categoryTitle}
        </p>
        <h3 className="mt-1.5 font-display text-lg font-bold leading-snug text-[var(--text-primary)]">
          {guide.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          {guide.summary}
        </p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {guide.minutes} min read
        </p>
      </div>
    </Link>
  )
}
