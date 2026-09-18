import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SHAPE_COOKIE, decodeShape } from '@/lib/forecast/shape-cookie'
import { one } from '@/lib/forecast/params'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/features/events/event-form'
import { OrgCreateForm } from '../../organisation/create/org-create-form'
import { isFlagEnabled } from '@/lib/flags'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import type { EventCategory } from '@/types/database'
import { ORG_SALE_FIELDS_SELECT, isOrganiserSellable, verifyOrgSaleFields } from '@/lib/payments/sale-status'

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business this event will belong to.
  //
  // This was `.eq('owner_id', user.id).single()`, which returns PGRST116 and
  // `data: null` when the caller owns more than one. So an owner of several
  // businesses was shown the CREATE AN ORGANISATION form on the create-event page,
  // every time, and could not create an event under any of the businesses they
  // already had. The switcher below is what makes "both organisations sell
  // independently" reachable: the event is written with the active organisation's
  // id, so the money follows that business's Stripe account.
  const params = await searchParams
  const scope = await resolveOrganisationScope(organisationIdFromParams(params))
  const org = scope.ok ? scope.active : null

  /*
   * THE SHAPE SOMEBODY ALREADY TYPED INTO THE PUBLIC FORECAST TOOL (FT1).
   *
   * It arrives on the query string because the forecast's call to action put it
   * on the signup `next`, so it survives the account being created. Read with
   * `one()` because Next hands a repeated parameter back as an array and a form
   * seeded with "80,80" is worse than one seeded with nothing.
   *
   * IT IS IMPORTED RATHER THAN DECLARED HERE, and the reason is worth the
   * sentence: an arrow function assigned to a const inside this component reads
   * as the start of a NEW function to `no-unowned-organisation-read`, which
   * splits the component in two and loses sight of the ownership check above.
   * The guard is right to be naive about what it can see, so the helper lives
   * in a module.
   *
   * The price arrives in CENTS, the unit every money value on this platform
   * travels in, and the form binds DOLLARS, so it is converted here rather than
   * in the form, which must not learn a second unit.
   */
  const queryPriceCents = Number.parseInt(one(params?.price) ?? '', 10)
  /*
   * THE QUERY STRING FIRST, THEN THE COOKIE. A signed-in organiser reaching
   * this form straight from the forecast carries the shape on the link, which
   * is the direct case and the one to prefer. Somebody who had to sign up in
   * between lost the query string at the emailed confirmation link, and the
   * cookie is what survived that hop.
   */
  const carried = decodeShape((await cookies()).get(SHAPE_COOKIE)?.value ?? null)
  const priceCents =
    Number.isFinite(queryPriceCents) && queryPriceCents > 0 ? queryPriceCents : carried.priceCents ?? 0
  const capacity = one(params?.capacity) ?? (carried.capacity ? String(carried.capacity) : null)
  const shapePrefill = {
    categoryId: one(params?.category) ?? carried.categoryId ?? null,
    city: one(params?.city) ?? carried.city ?? null,
    capacity,
    priceDollars: priceCents > 0 ? (priceCents / 100).toFixed(2) : null,
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
            ← My Events
          </Link>
          <h1 className="text-2xl font-bold text-ink-900">Create Event</h1>
        </div>
        <div className="mb-6 rounded-xl border border-gold-400/40 bg-gold-100/50 px-5 py-4">
          <p className="text-sm font-semibold text-ink-900">First, set up your organisation</p>
          <p className="mt-1 text-xs text-ink-600">
            Every event lives under an organisation. Fill this in once and you&rsquo;ll be straight on to creating your event.
          </p>
        </div>
        <OrgCreateForm
          userEmail={user.email ?? ''}
          returnTo="/dashboard/events/create"
          submitLabel="Continue to event details"
        />
      </div>
    )
  }

  /*
   * Can this organisation take money today? Read here so the Publish button can
   * look as blocked as it actually is, instead of inviting a press that the
   * server is going to refuse. The server gate (checkPublishGate) is still the
   * only thing that decides, and it re-reads Stripe before refusing.
   */
  const { data: saleOrg, error: saleOrgError } = await supabase
    .from('organisations')
    .select(ORG_SALE_FIELDS_SELECT)
    .eq('id', org.id)
    .maybeSingle()
  /*
   * verifyOrgSaleFields, not a cast. The branded type exists so nobody can hand
   * the sale gate a row that is missing a column, and a cast here would defeat
   * exactly the safeguard it was added for. If the row is incomplete this
   * resolves to false, which only ever makes the button MORE conservative: the
   * server gate still decides.
   */
  /*
   * A FAILED READ MUST NOT LOOK LIKE A REFUSAL.
   *
   * Destructuring only `data` would turn a transient read failure into a null
   * row, and a null row into "connect Stripe before publishing" shown to an
   * organiser whose Stripe is perfectly fine. That is the exact shape that
   * refused every paid event in production on 18 August 2026, and
   * one-sellability-source caught this line for it.
   *
   * So when the read fails we do NOT block. The button behaves as it always did
   * and the server gate decides, which is the only thing that ever decided
   * anyway. Presentation may make a refusal visible earlier; it may never
   * invent one.
   */
  const saleVerdict = verifyOrgSaleFields(saleOrg)
  const canSellPaid = saleOrgError
    ? true
    : saleVerdict.complete
      ? isOrganiserSellable(saleVerdict.org)
      : false

  const { data: categories } = await supabase
    .from('event_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order') as { data: EventCategory[] | null }

  const { data: venuesWithMaps } = await supabase
    .from('venues')
    .select('id, name, seat_maps(id, name, total_seats)')
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .order('name')

  const venues = (venuesWithMaps ?? []).map(v => ({
    id: v.id,
    name: v.name,
    seat_maps: (v.seat_maps ?? []).filter((m: { id: string; name: string; total_seats: number }) => m),
  }))

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/events" className="text-sm text-ink-400 hover:text-ink-600">
          ← My Events
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Create Event</h1>
      </div>

      {/* Which business this event will be published and paid under. An owner of
          several must be able to see and change that BEFORE filling the form in,
          not discover it afterwards on the payouts page. */}
      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/events/create"
        />
      ) : null}

      <EventForm
        userId={user.id}
        organisationId={org.id}
        categories={categories ?? []}
        venues={venues}
        launchKitEnabled={await isFlagEnabled('launch_kit')}
        lineupEnabled={await isFeatureEnabled('broadcast_artists')}
        magicStartEnabled={await isFlagEnabled('magic_start')}
        canSellPaid={canSellPaid}
        shapePrefill={shapePrefill}
      />
    </div>
  )
}
