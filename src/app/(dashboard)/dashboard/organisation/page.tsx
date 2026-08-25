import { canonicalHost } from '@/lib/site-url'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import {
  organisationIdFromParams,
  resolveOrganisationScope,
  withOrganisation,
} from '@/lib/organisations/scope'
import type { Organisation } from '@/types/database'
import { LogoUploader } from '@/components/organisation/logo-uploader'
import { TaxDetailsForm } from '@/components/organisation/tax-details-form'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { resolveLogoPlacement } from '@/lib/media/logo-pipeline'
import { captureException } from '@/lib/observability/sentry'

export default async function OrganisationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business. This was `.eq('owner_id', user.id).single()`, which returns
  // PGRST116 and `data: null` rather than a row when the caller owns more than one,
  // so an owner of several was shown "No Organisation Yet" and a button to create
  // the organisation they already had several of.
  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))
  const organisationCount = scope.ok ? scope.organisations.length : 0

  // The owner reading their OWN organisation, including its contact email.
  // That is legitimate: the email belongs to them. It is the same column being
  // readable by everyone ELSE that was the defect.
  //
  // Identity is verified with the session client above and ownership by the scope
  // resolver, then the row is read with the service role, because `email` is
  // revoked from `authenticated` by column privilege (migration 20260808000010).
  // Selecting explicit columns rather than (*) keeps this honest about what the
  // page needs.
  const { data: org } = scope.ok
    ? ((await createAdminClient()
        .from('organisations')
        .select('id, name, slug, description, website, email, status, stripe_onboarding_complete, legal_name, abn, gst_registered')
        .eq('id', scope.active.id)
        .maybeSingle()) as { data: Organisation | null })
    : { data: null }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100">
          <svg className="h-8 w-8 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-ink-900">No Organisation Yet</h2>
        <p className="mt-2 max-w-sm text-ink-400">
          Create an organisation to start building and selling event tickets.
        </p>
        <Link
          href="/dashboard/organisation/create"
          className="mt-6 rounded-lg bg-gold-500 px-6 py-3 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
        >
          Create Organisation
        </Link>
      </div>
    )
  }

  // How the mark will actually sit on the navy, measured rather than guessed.
  // The read is deadlined, and an unreachable object falls back to the tile,
  // which is the placement that is always readable.
  let logoPlacement: 'on-navy' | 'on-tile' = 'on-tile'
  if (org.logo_url) {
    const fetched = await fetchImageBytes(org.logo_url, 2500)
    if (fetched) {
      try {
        logoPlacement = (await resolveLogoPlacement(Buffer.from(fetched.bytes))).placement
      } catch (error) {
        captureException(error, { where: 'app/(dashboard)/dashboard/organisation/page:84' })
        logoPlacement = 'on-tile'
      }
    }
  }

  const [{ count: eventCount }, { count: memberCount }] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('organisation_id', org.id),
    supabase.from('organisation_members').select('*', { count: 'exact', head: true }).eq('organisation_id', org.id),
  ])

  const statusColour: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    deactivated: 'bg-ink-100 text-ink-400',
  }

  return (
    <div className="max-w-3xl">
      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/organisation"
        />
      ) : null}

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{org.name}</h1>
          <p className="mt-1 text-sm text-ink-400">{canonicalHost()}/{org.slug}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColour[org.status] ?? 'bg-ink-100 text-ink-400'}`}>
          {org.status}
        </span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Events</p>
          <p className="mt-1 text-3xl font-bold text-ink-900">{eventCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Team Members</p>
          <p className="mt-1 text-3xl font-bold text-ink-900">{memberCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wide">Payouts</p>
          <p className="mt-1 text-sm font-medium text-ink-600">
            {org.stripe_onboarding_complete ? 'Enabled' : 'Setup required'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white divide-y divide-ink-100">
        {org.description && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">About</p>
            <p className="text-sm text-ink-600">{org.description}</p>
          </div>
        )}
        {org.website && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Website</p>
            <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm text-gold-500 hover:underline">
              {org.website}
            </a>
          </div>
        )}
        {org.email && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Contact</p>
            <p className="text-sm text-ink-600">{org.email}</p>
          </div>
        )}
      </div>

      {/* The organiser's own mark. It goes onto their poster, their story card
          and every post image the kit builds, at the top, where a promoter puts
          their own name. Nothing collected it before this, so organisations
          .logo_url was read in four places and written in none. */}
      <div className="mt-6">
        <LogoUploader
          organisationId={org.id}
          organisationName={org.name}
          initialUrl={org.logo_url}
          initialPlacement={logoPlacement}
        />
      </div>

      {/* The two facts a tax invoice needs from the SELLER, and on a ticket sale
          the seller is this organiser: EventLinqs collects on their behalf. Until
          25 August 2026 organisations carried no ABN, no legal name and no
          GST-registration flag, so ATO tax-invoice requirements 2 and 3 were
          unsatisfiable for every organiser on the platform and not one receipt
          this platform issued could be a valid tax invoice. */}
      <div className="mt-6">
        <TaxDetailsForm
          organisationId={org.id}
          tradingName={org.name}
          legalName={org.legal_name ?? null}
          abn={org.abn ?? null}
          gstRegistered={org.gst_registered ?? false}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          href={withOrganisation('/dashboard/reports/gst', org.id, organisationCount)}
          className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          GST report
        </Link>
        <Link
          href={withOrganisation('/dashboard/events/create', org.id, organisationCount)}
          className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
        >
          Create Event
        </Link>
        <Link
          href={withOrganisation('/dashboard/events', org.id, organisationCount)}
          className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          View Events
        </Link>
        {/* The only entry point to a second business. Without it there is no route
            anywhere in the product to the founder's "people can have endless". */}
        <Link
          href="/dashboard/organisation/create"
          className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100"
        >
          Add another business
        </Link>
      </div>
    </div>
  )
}
