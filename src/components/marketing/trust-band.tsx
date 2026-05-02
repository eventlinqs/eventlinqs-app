import { createPublicClient } from '@/lib/supabase/public-client'
import { CONTAINER } from '@/lib/ui/spacing'

/**
 * TrustBand - real-numbers strip between the lineup grid and below-fold rails.
 *
 * Server component. Pulls counts live from Supabase. No fake metrics.
 * Renders a single horizontal band on desktop, stacks on mobile. ~80px tall.
 *
 * Numbers shown:
 *   - Organisers: distinct organisations with at least one published event
 *   - Cultures:   distinct culture tags appearing on published events
 *                 (clamped to the canonical 18-culture set so we never
 *                  surface stray tags as "cultures we serve")
 *   - Cities:     distinct venue_city values across published events
 *
 * If a count is unavailable (RLS blocked, query failed) the tile is omitted
 * rather than showing a placeholder. We never lie about scale.
 */

const CANONICAL_CULTURE_TAGS = new Set([
  'afrobeats', 'caribbean', 'bollywood', 'latin', 'italian', 'filipino',
  'lunar', 'gospel', 'amapiano', 'comedy', 'spanish', 'k-pop', 'kpop',
  'reggae', 'west-african', 'european', 'asian', 'african', 'south-asian',
])

interface TrustNumbers {
  organisers: number | null
  cultures: number | null
  cities: number | null
}

async function fetchTrustNumbers(): Promise<TrustNumbers> {
  const supabase = createPublicClient()
  const nowIso = new Date().toISOString()

  try {
    const [orgRows, eventRows] = await Promise.all([
      supabase
        .from('events')
        .select('organisation_id')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .not('organisation_id', 'is', null)
        .limit(1000),
      supabase
        .from('events')
        .select('venue_city, tags')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .limit(1000),
    ])

    const organiserIds = new Set<string>()
    for (const row of (orgRows.data ?? []) as { organisation_id: string | null }[]) {
      if (row.organisation_id) organiserIds.add(row.organisation_id)
    }

    const cityNames = new Set<string>()
    const cultureTags = new Set<string>()
    for (const row of (eventRows.data ?? []) as { venue_city: string | null; tags: string[] | null }[]) {
      const city = row.venue_city?.trim().toLowerCase()
      if (city) cityNames.add(city)
      for (const tag of row.tags ?? []) {
        const normalised = tag?.trim().toLowerCase()
        if (normalised && CANONICAL_CULTURE_TAGS.has(normalised)) {
          cultureTags.add(normalised)
        }
      }
    }

    return {
      organisers: organiserIds.size,
      cultures: cultureTags.size,
      cities: cityNames.size,
    }
  } catch {
    return { organisers: null, cultures: null, cities: null }
  }
}

function VerifiedIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" />
      <path d="M12 2l2.39 2.39L18 4l.78 3.61L22 9l-2.39 2.39L20 15l-3.61.78L15 18.78 12 22l-3-3.22-3.61-.78L4 15l-2-3 2-2.39L4 6l3.61-.78L9 2z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 9.4-8 10-4.5-.6-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  )
}

interface TrustBadgeProps {
  icon: React.ReactNode
  title: string
  subtitle: string
}

function TrustBadge({ icon, title, subtitle }: TrustBadgeProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-700">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900 leading-tight">{title}</p>
        <p className="text-xs text-ink-500 leading-tight mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

interface TrustNumberProps {
  value: number
  label: string
}

function TrustNumber({ value, label }: TrustNumberProps) {
  const display = value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value)
  return (
    <div className="flex flex-col">
      <p className="font-display text-2xl font-extrabold text-ink-900 leading-none">{display}</p>
      <p className="text-xs text-ink-500 leading-tight mt-1">{label}</p>
    </div>
  )
}

export async function TrustBand() {
  const { organisers, cultures, cities } = await fetchTrustNumbers()

  const hasNumbers = organisers !== null && cultures !== null && cities !== null

  return (
    <section
      aria-label="Why organisers and fans trust EventLinqs"
      className="border-y border-ink-100 bg-white py-6 sm:py-8"
    >
      <div className={CONTAINER}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">

          {/* Real-numbers cluster (only renders when DB returned counts) */}
          {hasNumbers && (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <TrustNumber value={organisers!} label="organisers" />
              <span aria-hidden className="hidden sm:inline-block h-8 w-px bg-ink-100" />
              <TrustNumber value={cultures!} label="cultures" />
              <span aria-hidden className="hidden sm:inline-block h-8 w-px bg-ink-100" />
              <TrustNumber value={cities!} label="cities" />
            </div>
          )}

          {/* Trust badges */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <TrustBadge
              icon={<VerifiedIcon />}
              title="Stripe verified"
              subtitle="Payments processed by Stripe"
            />
            <TrustBadge
              icon={<LockIcon />}
              title="PCI-DSS"
              subtitle="Card data never touches our servers"
            />
            <TrustBadge
              icon={<ShieldIcon />}
              title="GDPR aligned"
              subtitle="Your data, your control"
            />
          </div>
        </div>

        <p className="mt-5 border-t border-ink-50 pt-4 text-center text-xs text-ink-500 sm:text-left">
          All-in pricing. No surprise fees. Australian sole trader, ABN 30 837 447 587.
        </p>
      </div>
    </section>
  )
}
