import Link from 'next/link'
import { redirect } from 'next/navigation'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { ApiKeyManager } from '@/components/api-keys/api-key-manager'
import { listApiKeys } from '@/lib/api/v1/keys'
import { API_V1_RESOURCES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/api/v1/reads'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import { POLICIES } from '@/lib/rate-limit/policies'
import { getSiteUrl } from '@/lib/site-url'

/**
 * API1. WHERE AN ORGANISER ISSUES AND REVOKES A KEY TO THEIR OWN DATA.
 *
 * THIS SCREEN IS THE DATA OWNERSHIP PROMISE MADE OPERATIONAL. The growth
 * doctrine's second blade is that an organiser owns every attendee
 * relationship: no walled garden, no withheld emails. A promise kept only by an
 * export button is a promise kept once; a read API is the same promise kept
 * continuously, by whatever system the organiser already runs. So the page
 * leads with what the key can reach rather than with how to authenticate.
 *
 * NOTHING ON IT IS TYPED. The page size, the ceiling, the rate limit and the
 * object names are read from the modules that enforce them
 * (src/lib/api/v1/reads.ts, src/lib/rate-limit/policies.ts), so a cap that
 * moves moves here too. The guard fails the build if any of them becomes a
 * literal, for the same reason the forecast tool's numbers are read rather than
 * written: a screen that quietly disagrees with the system it documents is
 * worse than a screen that documents nothing.
 */

export const metadata = {
  title: 'API keys',
  description: 'Issue and revoke read only API keys for your own events, orders and attendees.',
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))

  if (!scope.ok && scope.reason === 'unauthenticated') redirect('/login')

  if (!scope.ok) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-ink-900">API keys</h1>
        <p className="mt-3 text-ink-500">
          API keys belong to an organisation. Create one and this page fills in.
        </p>
        <Link
          href="/dashboard/organisation/create"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-500 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
        >
          Create an organisation
        </Link>
      </div>
    )
  }

  const keys = await listApiKeys(scope.active.id)
  const base = `${getSiteUrl()}/api/v1`
  const tier = POLICIES['api-v1-read']

  return (
    <div className="max-w-4xl">
      <OrganisationSwitcher
        organisations={scope.organisations}
        activeId={scope.active.id}
        basePath="/dashboard/api-keys"
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">Your data</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">API keys</h1>
        <p className="mt-3 max-w-2xl text-ink-500">
          Your events, your orders and your attendees, readable by whatever you already run. You own
          these records: we do not hold them back from you and we never will. A key reads and can do
          nothing else.
        </p>
      </header>

      <ApiKeyManager
        organisationId={scope.active.id}
        organisationName={scope.active.name}
        keys={keys}
      />

      <section className="mt-8 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="type-rail-heading text-ink-900">What a key reaches</h2>
        <p className="mt-2 text-sm text-ink-500">
          Send the key as a bearer token. Every answer names the organisation it is about, so a key
          can never be filed against the wrong business.
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs leading-relaxed text-white">
          <code>{`curl -H "Authorization: Bearer YOUR_KEY" \\\n  ${base}/${Object.keys(API_V1_RESOURCES)[0]}`}</code>
        </pre>

        <ul className="mt-6 space-y-4">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.path} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
              <p className="font-mono text-sm text-ink-900">
                <span className="mr-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs font-semibold text-ink-700">
                  GET
                </span>
                {`/api/v1${endpoint.path}`}
              </p>
              <p className="mt-1 text-sm text-ink-500">{endpoint.what}</p>
            </li>
          ))}
        </ul>

        {/*
          grid-cols-1 at the base, not only sm:grid-cols-3. Without it the
          mobile case is an implicit auto track, which a wide child can widen
          past the viewport at 390, and the page clips rather than scrolls.
        */}
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-ink-100 pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Page size</dt>
            <dd className="mt-1 text-sm text-ink-700">
              {DEFAULT_PAGE_SIZE} by default, {MAX_PAGE_SIZE} at most
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Rate</dt>
            <dd className="mt-1 text-sm text-ink-700">
              {tier.limit} requests every {tier.windowSec} seconds
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Writes</dt>
            <dd className="mt-1 text-sm text-ink-700">None. Every endpoint is read only.</dd>
          </div>
        </dl>

        <p className="mt-6 text-sm text-ink-500">
          Would you rather have a spreadsheet? Your attendees also download from{' '}
          <Link
            href="/dashboard/events"
            className="font-medium text-gold-800 underline underline-offset-2 hover:text-ink-900"
          >
            any event you run
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

/**
 * Derived from the resource table rather than typed, so a resource added to the
 * API appears here and a resource removed from it disappears. The wording is
 * the only part written by hand.
 */
const WHAT: Record<keyof typeof API_V1_RESOURCES, string> = {
  events: 'Every event you run, draft and published, newest first.',
  orders: 'Every order on your events, with its totals and the one platform fee. Filter with event_id.',
  attendees: 'One row per ticket, with the holder, the tier and whether they have been scanned in. Filter with event_id.',
}

const ENDPOINTS = (Object.keys(API_V1_RESOURCES) as Array<keyof typeof API_V1_RESOURCES>).flatMap(
  (resource) => [
    { path: `/${resource}`, what: WHAT[resource] },
    { path: `/${resource}/{id}`, what: `One ${resource.replace(/s$/, '')} of yours by id.` },
  ],
)
