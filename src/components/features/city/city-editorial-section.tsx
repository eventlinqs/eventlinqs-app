import { ContentSection } from '@/components/layout/ContentSection'

interface Props {
  /** Eyebrow above the body copy (e.g. "About Sydney"). */
  eyebrow: string
  /** Main heading (e.g. "Where every culture has a stage"). */
  heading: string
  /** Editorial body copy. Pre-broken into paragraphs by the caller. */
  paragraphs: string[]
}

/**
 * CityEditorialSection - Batch 6 community-first editorial band.
 *
 * Light surface, max-width prose, 200-300 word body for cities and
 * 100-150 for suburbs. The caller is responsible for ensuring the copy
 * mentions 3+ specific cultural communities and 2+ specific suburbs;
 * this component just renders cleanly.
 */
export function CityEditorialSection({ eyebrow, heading, paragraphs }: Props) {
  return (
    <ContentSection surface="base" width="default" topBorder>
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)] sm:text-xs">
          {eyebrow}
        </p>
        <h2 className="font-display text-[1.75rem] font-bold leading-[1.15] text-[var(--text-primary)] sm:text-3xl">
          {heading}
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:mt-4 sm:text-base sm:leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </ContentSection>
  )
}
