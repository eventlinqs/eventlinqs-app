import Link from 'next/link'
import type { OrganisationChoice } from '@/lib/payouts/auth'

interface Props {
  choices: OrganisationChoice[]
  /** The path to link to, so this can be reused on other organisation-scoped pages. */
  basePath?: string
}

/**
 * Switch between the businesses one person owns.
 *
 * WHY THIS EXISTS AT ALL. The founder's ruling is that a person may run endless
 * businesses with endless bank accounts. Until now the payouts surface silently
 * assumed exactly one: it resolved the organisation with `maybeSingle()`, which
 * errors rather than choosing when several match, so an owner of sixteen was told
 * they had none.
 *
 * WHY IT IS A LINK AND NOT A CLIENT DROPDOWN. Each organisation is a distinct URL
 * (`?org=<id>`), so the active business is in the address bar. That is what makes
 * "switching never leaks one organisation's payout state onto another" true by
 * construction rather than by careful state handling: there is no shared client
 * state to leak, every switch is a fresh server render scoped to one verified
 * organisation, and a bookmark or a browser back button lands on the same business
 * it did before.
 *
 * Rendered only when there is more than one, so a single-business organiser sees no
 * new chrome and that surface is unchanged.
 */
export function OrganisationSwitcher({ choices, basePath = '/dashboard/payouts' }: Props) {
  if (choices.length < 2) return null

  return (
    <nav aria-label="Switch business" className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
        Your businesses
      </p>
      <ul className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <li key={c.id}>
            <Link
              href={`${basePath}?org=${encodeURIComponent(c.id)}`}
              aria-current={c.active ? 'page' : undefined}
              className={[
                'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                c.active
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-800 hover:border-ink-400',
              ].join(' ')}
            >
              <span className="truncate max-w-[14rem]">{c.name}</span>
              {/* Whether each business can take money, so an organiser with several
                  can see at a glance which one needs attention rather than having to
                  open each in turn. */}
              <span
                aria-hidden="true"
                className={[
                  'h-2 w-2 shrink-0 rounded-full',
                  c.canSell ? 'bg-success' : 'bg-gold-500',
                ].join(' ')}
              />
              <span className="sr-only">
                {c.canSell ? 'can sell paid tickets' : 'needs Stripe attention'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
