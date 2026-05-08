import { ContentSection } from '@/components/layout/ContentSection'

interface Props {
  organiserName: string
  bio: string | null
}

/**
 * OrganiserBioSection - 200-400 word organiser story for
 * /organisers/[handle] (Batch 8.2).
 *
 * The empty state ("X hasn't added a bio yet") avoids the common bug
 * of rendering a blank section when bio data is absent. The empty
 * state itself doubles as a soft prompt for the organiser to log in
 * and add a bio - the next iteration of the dashboard will deep link
 * here from the empty state.
 */
export function OrganiserBioSection({ organiserName, bio }: Props) {
  return (
    <ContentSection surface="base" width="prose" topBorder>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
        About
      </p>
      <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
        About {organiserName}
      </h2>
      {bio ? (
        <div className="mt-5 space-y-4 text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-base sm:leading-relaxed">
          {bio.split(/\n\n+/).map((para, i) => <p key={i}>{para}</p>)}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--text-secondary)]">
          {organiserName} hasn&apos;t added a bio yet. Subscribe to event updates below to get notified when new events go live.
        </p>
      )}
    </ContentSection>
  )
}
