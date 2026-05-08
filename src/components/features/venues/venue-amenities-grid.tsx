import { ContentSection } from '@/components/layout/ContentSection'
import { Users, MapPin, Building2 } from 'lucide-react'

interface Props {
  description: string | null
  capacity: number | null
  fullAddress: string | null
  venueType: string | null
}

/**
 * VenueAmenitiesGrid - VP2 venue info (Batch 8.3).
 *
 * The current `venues` table doesn't carry website/phone/hours/parking/
 * accessibility yet (M7 admin panel work). For v1 we surface only the
 * fields we have - description, capacity, address, venue type. Empty
 * fields are simply not rendered.
 */
export function VenueAmenitiesGrid({ description, capacity, fullAddress, venueType }: Props) {
  return (
    <ContentSection surface="base" width="default" topBorder>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
        About this venue
      </p>
      <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
        Venue info
      </h2>

      {description ? (
        <div className="mt-5 space-y-4 text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-base sm:leading-relaxed">
          {description.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : null}

      <ul role="list" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {capacity ? (
          <li className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
              <Users className="h-4 w-4" aria-hidden /> Capacity
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-[var(--text-primary)]">
              {capacity.toLocaleString('en-AU')}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">attendees</p>
          </li>
        ) : null}
        {venueType ? (
          <li className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
              <Building2 className="h-4 w-4" aria-hidden /> Venue type
            </div>
            <p className="mt-2 font-display text-base font-semibold text-[var(--text-primary)]">
              {venueType}
            </p>
          </li>
        ) : null}
        {fullAddress ? (
          <li className="rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
              <MapPin className="h-4 w-4" aria-hidden /> Address
            </div>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{fullAddress}</p>
          </li>
        ) : null}
      </ul>
    </ContentSection>
  )
}
