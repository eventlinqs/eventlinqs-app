import { switchOrganisation } from '@/lib/organisations/switch-action'
import type { OwnedOrganisation } from '@/lib/organisations/scope'

interface Props {
  organisations: OwnedOrganisation[]
  activeId: string
  /** The dashboard path to come back to, so a switch keeps the organiser where they are. */
  basePath: string
}

/**
 * Switch between the businesses one person owns.
 *
 * WHY THIS EXISTS AT ALL. The founder's ruling is that a person may run endless
 * businesses with endless bank accounts. Until this branch the dashboard silently
 * assumed exactly one: it resolved the organisation with `single()`, which errors
 * rather than choosing when several match, so an owner of 26 was told they had none.
 *
 * WHY A FORM AND NOT A LINK. A switch has to survive the next click. A link can put
 * `?org=` in the address bar but cannot write the cookie that keeps the sidebar on
 * the same business, because Next.js only permits a cookie write from a Server
 * Function or Route Handler. The form posts to switchOrganisation, which verifies
 * ownership, remembers the choice and redirects back here with `?org=` set, so the
 * business is named in BOTH places: the URL pins this tab, the cookie carries the
 * choice across the sidebar.
 *
 * NO SHARED CLIENT STATE. Every switch is a fresh server render scoped to one
 * verified organisation, so one business's payout state cannot leak onto another's
 * screen: there is nothing held between them to leak.
 *
 * Rendered only when there are two or more, so a single-business organiser sees no
 * new chrome at all and that surface is provably unchanged.
 */
export function OrganisationSwitcher({ organisations, activeId, basePath }: Props) {
  if (organisations.length < 2) return null

  return (
    <nav aria-label="Switch business" className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
        Your businesses
      </p>
      <ul className="flex flex-wrap gap-2">
        {organisations.map((o) => {
          const active = o.id === activeId
          return (
            <li key={o.id}>
              <form action={switchOrganisation}>
                <input type="hidden" name="organisationId" value={o.id} />
                <input type="hidden" name="returnTo" value={basePath} />
                <button
                  type="submit"
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                    active
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-200 bg-white text-ink-800 hover:border-ink-400',
                  ].join(' ')}
                >
                  <span className="max-w-[14rem] truncate">{o.name}</span>
                  {/* Whether each business can take money, so an organiser with
                      several sees at a glance which one needs attention rather than
                      having to open each in turn. */}
                  <span
                    aria-hidden="true"
                    className={[
                      'h-2 w-2 shrink-0 rounded-full',
                      o.canSell ? 'bg-success' : 'bg-gold-500',
                    ].join(' ')}
                  />
                  <span className="sr-only">
                    {o.canSell ? 'can sell paid tickets' : 'needs Stripe attention'}
                  </span>
                </button>
              </form>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
