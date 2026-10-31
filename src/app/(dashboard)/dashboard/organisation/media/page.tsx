import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import { formatEventDateTimeCompact, formatPlatformDate } from '@/lib/dates/event-time'
import { GalleryImage } from '@/components/media/GalleryImage'
import {
  AddMediaForm,
  GiveYesForm,
  OrganiserMediaAnswerLine,
  OrganiserMediaAnswers,
  RegularNightsForm,
  ReplaceMediaForm,
  WithdrawMediaForm,
  WithdrawYesForm,
} from '@/components/listings/organiser-media-forms'
import { assetStateWords, YES_WITHDRAWN_WORDS } from '@/lib/listings/media-words'
import { AddVenuePhotoForm, ReplaceVenuePhotoForm, VenuePhotoAnswers, WithdrawVenuePhotoForm } from '@/components/listings/venue-media-forms'
import { venuePhotoStateWords } from '@/lib/venues/venue-photo-words'
import { VenueDistributionForm } from '@/components/listings/venue-distribution-form'
import { GiveVenueCalendarForm, StopVenueCalendarForm, VenueCalendarAnswers } from '@/components/listings/venue-calendar-forms'
import { distributionDeps, venueDistributionFor, type VenueDistribution } from '@/lib/venues/venue-distribution'

/**
 * YOUR PHOTOS AND ARTWORK (the engine plan of 28 October 2026, part D; the final directive, section 15: "Upload artwork
 * or photography ... Withdraw or update permissions"). The organisation's permission as it was given, every image it
 * has added with its state, its regular nights, and the presses: add, replace, withdraw one, withdraw the permission,
 * keep a series listing or pause it.
 *
 * Identity by the session and ownership by the scope resolver, as /dashboard/organisation; the rows are read with the
 * service role, because the permission and the asset register are private (no policy, service role only). Every
 * change goes through the database's own functions, which check the user again (src/lib/listings/organiser-media.ts).
 */

const SCOPE_WORDS: Record<string, string> = { current_and_future: 'now and for future events', this_event: 'this event only' }

export default async function OrganisationMediaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))
  if (!scope.ok && scope.status === 401) redirect('/login')
  if (!scope.ok) redirect('/dashboard/organisation')
  const orgId = scope.active.id
  const admin = createAdminClient()

  const [yeses, nights, series, claims] = await Promise.all([
    readOrThrow('organisation permissions', () =>
      admin
        .from('organiser_permissions')
        .select('id, claim_id, host_name, wording, scope, granted_at, withdrawn_at, withdrawn_reason')
        .eq('organisation_id', orgId)
        .order('granted_at', { ascending: false }),
    ),
    readOrThrow('organisation nights', () =>
      admin
        .from('events')
        .select('id, title, start_date, timezone')
        .eq('organisation_id', orgId)
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(100),
    ),
    readOrThrow('organisation series', () =>
      admin.from('event_series').select('id, name, status').eq('organisation_id', orgId).neq('status', 'removed').order('name'),
    ),
    readOrThrow('organisation claims', () =>
      admin
        .from('listing_claims')
        .select('id, venue_id, event_id')
        .eq('target_organisation_id', orgId)
        .in('status', ['verified', 'manual_approved'])
        .order('verified_at', { ascending: false }),
    ),
  ])
  const nightIds = (nights ?? []).map((n) => n.id)
  const assets = nightIds.length
    ? await readOrThrow('organisation images', () =>
        admin
          .from('social_assets')
          .select('id, event_id, asset_type, asset_url, original_file, attribution_text, restrictions, approval_status, withdrawal_status, received_on')
          .eq('asset_state', 'organiser_authorised')
          .in('event_id', nightIds)
          .order('created_at', { ascending: false }),
      )
    : []
  const titleOf = new Map((nights ?? []).map((n) => [n.id, n.title]))
  const current = (yeses ?? []).filter((y) => !y.withdrawn_at)
  // A claim with no current yes: made without the tick, or its yes withdrawn. Its organiser may give it here (221201).
  const unanswered = (claims ?? []).filter((c) => !current.some((y) => y.claim_id === c.id))
  const venueIds = unanswered.flatMap((c) => (c.venue_id ? [c.venue_id] : []))
  const eventIds = unanswered.flatMap((c) => (c.event_id ? [c.event_id] : []))
  const [claimedVenues, claimedEvents] = await Promise.all([
    venueIds.length ? readOrThrow('claimed venue names', () => admin.from('venues').select('id, name').in('id', venueIds)) : [],
    eventIds.length ? readOrThrow('claimed event titles', () => admin.from('events').select('id, title').in('id', eventIds)) : [],
  ])
  // The venues this organisation holds once claimed, and the photographs of them it sent (never a harvested one).
  const heldVenues =
    (await readOrThrow('organisation venues', () =>
      admin.from('venues').select('id, name').eq('organisation_id', orgId).eq('listing_source', 'organiser').is('removed_at', null).order('name'),
    )) ?? []
  // A failed read here takes only this section away, said plainly, never the organiser's whole media page (the table
  // arrives with 20261030171501_venue_images.sql, applied to production by Lawal).
  let venuePhotosUnreadable = false
  const venuePhotos = heldVenues.length
    ? await readOrThrow('venue photographs', () =>
        admin
          .from('venue_images')
          .select('id, venue_id, image_url, attribution_text, approval_state, created_at')
          .in('venue_id', heldVenues.map((v) => v.id))
          .in('source', ['venue', 'organiser'])
          .order('created_at', { ascending: false }),
      ).then(
        (rows) => rows ?? [],
        () => {
          venuePhotosUnreadable = true
          return []
        },
      )
    : []
  // D3 (6), where EventLinqs may carry each held venue's nights; a failed read takes only that section away, said
  // plainly (the table arrives with 20261031033001_venue_distribution_preferences.sql).
  let distribution: Map<string, VenueDistribution> | null = null
  if (heldVenues.length) {
    distribution = await venueDistributionFor(
      heldVenues.map((v) => v.id),
      distributionDeps(admin),
    ).catch(() => null)
  }
  // D3 (3), each held venue's own calendar we read, and the kinds of nights a new one may hold; a failed read takes
  // only that section away, said plainly.
  const calendars = heldVenues.length
    ? await Promise.all([
        readOrThrow('venue calendars', () =>
          admin
            .from('listing_sources')
            .select('id, venue_id, page_url, terms_read_on')
            .in('venue_id', heldVenues.map((v) => v.id))
            .eq('source_type', 'venue_partnership')
            .eq('collection', 'read'),
        ),
        readOrThrow('event categories', () => admin.from('event_categories').select('id, name').order('name')),
      ]).then(
        ([live, kinds]) => ({ live: live ?? [], kinds: kinds ?? [] }),
        () => null,
      )
    : null
  const venueName = new Map(heldVenues.map((v) => [v.id, v.name]))
  const claimName = new Map<string, string>([
    ...(claimedVenues ?? []).map((v) => [v.id, v.name] as [string, string]),
    ...(claimedEvents ?? []).map((e) => [e.id, e.title] as [string, string]),
  ])

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Your photos and artwork</h1>
      <p className="mt-1 text-sm text-ink-600">
        Images you add here appear on your EventLinqs listings and social posts, under the permission you gave. Our team checks each one before it
        is used. You can replace or withdraw any image, or your permission, at any time; a withdrawn image comes out of every post not yet published
        within the hour.
      </p>

      {/* One holder for the organiser's answers, around every section its forms sit in, each answer shown in a section
          that stays after the refresh: a yes given empties 'Give your permission', so its thank you shows here. */}
      <OrganiserMediaAnswers line={false}>
      <section className="mt-8 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="yes-heading">
        <h2 id="yes-heading" className="text-lg font-semibold text-ink-900">
          Your permission
        </h2>
        <OrganiserMediaAnswerLine kinds={['giveYes', 'withdrawYes']} />
        {(yeses ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-600">
            There is no permission on record for {scope.active.name}. It is given when you claim a listing with the permission ticked.{' '}
            <Link href="/submit-event" className="font-semibold text-ink-900 underline">
              List an event with your photos
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {(yeses ?? []).map((y) => (
              <li key={y.id} data-permission={y.id} className="text-sm text-ink-600">
                <p className="text-ink-900">&ldquo;{y.wording}&rdquo;</p>
                <p className="mt-1">
                  {y.host_name}, given {formatPlatformDate(y.granted_at)}, {SCOPE_WORDS[y.scope] ?? y.scope}.
                  {y.withdrawn_at ? ` Withdrawn ${formatPlatformDate(y.withdrawn_at)}: ${y.withdrawn_reason}` : ''}
                </p>
                {y.withdrawn_at ? <p className="mt-1 font-medium text-ink-900">{YES_WITHDRAWN_WORDS}</p> : null}
                {y.withdrawn_at ? null : (
                  <div className="mt-3">
                    <WithdrawYesForm permissionId={y.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {unanswered.length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="give-heading">
          <h2 id="give-heading" className="text-lg font-semibold text-ink-900">
            Give your permission
          </h2>
          <ul className="mt-3 space-y-6">
            {unanswered.map((c) => (
              <li key={c.id} data-claim={c.id}>
                <p className="text-sm font-semibold text-ink-900">{claimName.get(c.venue_id ?? c.event_id ?? '') ?? 'Your listing'}</p>
                <div className="mt-2">
                  <GiveYesForm claimId={c.id} kind={c.venue_id ? 'venue' : 'event'} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current.length > 0 && nightIds.length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="add-heading">
          <h2 id="add-heading" className="text-lg font-semibold text-ink-900">
            Add a photo or artwork
          </h2>
          <p className="mt-1 text-sm text-ink-600">Only add images you own or have the right to share.</p>
          <OrganiserMediaAnswerLine kinds={['add']} />
          <div className="mt-4">
            <AddMediaForm
              nights={(nights ?? []).map((n) => ({ id: n.id, label: `${n.title}, ${formatEventDateTimeCompact(n.start_date, n.timezone)}` }))}
            />
          </div>
        </section>
      ) : null}

      {(series ?? []).length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="nights-heading">
          <h2 id="nights-heading" className="text-lg font-semibold text-ink-900">
            Your regular nights
          </h2>
          <RegularNightsForm series={(series ?? []).map((r) => ({ id: r.id, name: r.name, keep: r.status === 'active' }))} finishLabel="Save" />
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="images-heading">
        <h2 id="images-heading" className="text-lg font-semibold text-ink-900">
          Your images
        </h2>
        <OrganiserMediaAnswerLine kinds={['replace', 'withdraw']} />
        {(assets ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-600">No images yet. Your listings show their details in our own design until you add one.</p>
        ) : (
          <ul className="mt-3 space-y-6">
            {(assets ?? []).map((a) => (
              <li key={a.id} data-asset={a.id} className="flex flex-col gap-4 sm:flex-row">
                <a href={a.asset_url} target="_blank" rel="noopener" className="relative block h-40 w-full shrink-0 overflow-hidden rounded-lg sm:w-56">
                  <GalleryImage src={a.asset_url} alt={`${a.asset_type === 'photo' ? 'Photo' : 'Artwork'} for ${titleOf.get(a.event_id ?? '') ?? 'your night'}`} />
                </a>
                <div className="min-w-0 flex-1 text-sm text-ink-600">
                  <p className="font-semibold text-ink-900">{titleOf.get(a.event_id ?? '') ?? 'Your night'}</p>
                  <p className="mt-1">
                    {a.original_file ?? 'Image'}, {a.attribution_text}
                    {a.received_on ? `, added ${formatPlatformDate(a.received_on)}` : ''}
                  </p>
                  {a.restrictions ? <p className="mt-1">Restrictions: {a.restrictions}</p> : null}
                  <p className="mt-1 font-medium text-ink-900">
                    {assetStateWords(a)}
                  </p>
                  {a.withdrawal_status === 'current' ? (
                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <ReplaceMediaForm assetId={a.id} />
                      <WithdrawMediaForm assetId={a.id} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </OrganiserMediaAnswers>

      {/* The project manager's 16:42 of 30 October 2026: a claimed venue sends photographs of itself, with its yes; once
          our team approves one, it shows on every night at the venue (public.venue_images). */}
      {heldVenues.length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="venue-photos-heading">
          <h2 id="venue-photos-heading" className="text-lg font-semibold text-ink-900">
            Photographs of your venue
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {heldVenues.map((v) => (
              <a key={v.id} href={`/api/venues/${v.id}/qr-sheet`} className="mr-4 inline-flex min-h-[44px] items-center font-semibold text-ink-900 underline underline-offset-2">
                Download a QR sheet for {v.name}
              </a>
            ))}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Send us three photographs of your venue. Once our team approves one, it shows on every night at your venue, with your credit.
          </p>
          <VenuePhotoAnswers>
          {venuePhotosUnreadable ? (
            <p role="alert" className="mt-3 text-sm text-ink-600">
              Your venue photographs could not be read just now, so none can be sent here yet. Try again later.
            </p>
          ) : null}
          {venuePhotos.length > 0 ? (
            <ul className="mt-4 space-y-6">
              {venuePhotos.map((p) => (
                <li key={p.id} data-venue-photo={p.id} className="flex flex-col gap-4 sm:flex-row">
                  <a href={p.image_url} target="_blank" rel="noopener" className="relative block h-40 w-full shrink-0 overflow-hidden rounded-lg sm:w-56">
                    <GalleryImage src={p.image_url} alt={`A photograph of ${venueName.get(p.venue_id ?? '') ?? 'your venue'}`} />
                  </a>
                  <div className="min-w-0 flex-1 text-sm text-ink-600">
                    <p className="font-semibold text-ink-900">{venueName.get(p.venue_id ?? '') ?? 'Your venue'}</p>
                    <p className="mt-1">
                      {p.attribution_text}, added {formatPlatformDate(p.created_at)}
                    </p>
                    <p className="mt-1 font-medium text-ink-900">{venuePhotoStateWords(p.approval_state)}</p>
                    {p.approval_state !== 'withdrawn' && p.venue_id ? (
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <ReplaceVenuePhotoForm venueId={p.venue_id} imageId={p.id} />
                        <WithdrawVenuePhotoForm imageId={p.id} />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {venuePhotosUnreadable ? null : (
            <div className="mt-4">
              <AddVenuePhotoForm venues={heldVenues.map((v) => ({ id: v.id, name: v.name }))} />
            </div>
          )}
          </VenuePhotoAnswers>
        </section>
      ) : null}
      {heldVenues.length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="venue-calendar-heading">
          <h2 id="venue-calendar-heading" className="text-lg font-semibold text-ink-900">
            Your events calendar
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Give us your calendar&apos;s iCal address and we list your new nights every day, each with a link to book with you. You keep your own ticketing.
          </p>
          {calendars === null ? (
            <p className="mt-3 text-sm text-ink-600">Your calendar could not be read just now, so none can be given here yet. Try again later.</p>
          ) : (
            <VenueCalendarAnswers>
              {calendars.live.length > 0 ? (
                <ul className="mt-4 space-y-4">
                  {calendars.live.map((c) => (
                    <li key={c.id} data-venue-calendar={c.id} className="text-sm text-ink-600">
                      <p className="font-semibold text-ink-900">{venueName.get(c.venue_id ?? '') ?? 'Your venue'}</p>
                      <p className="mt-1 break-all">{c.page_url}</p>
                      <p className="mt-1">Read every day since {c.terms_read_on}.</p>
                      <div className="mt-2">
                        <StopVenueCalendarForm sourceId={c.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {heldVenues.some((v) => !calendars.live.some((c) => c.venue_id === v.id)) ? (
                <div className="mt-4">
                  <GiveVenueCalendarForm
                    venues={heldVenues.filter((v) => !calendars.live.some((c) => c.venue_id === v.id)).map((v) => ({ id: v.id, name: v.name }))}
                    categories={calendars.kinds.map((k) => ({ id: k.id, name: k.name }))}
                  />
                </div>
              ) : null}
            </VenueCalendarAnswers>
          )}
        </section>
      ) : null}
      {heldVenues.length > 0 ? (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-5" aria-labelledby="venue-sharing-heading">
          <h2 id="venue-sharing-heading" className="text-lg font-semibold text-ink-900">
            Where we share your nights
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Your venue page and your event pages stay on EventLinqs either way. These two choices are about our own posts and our weekly round-up.
          </p>
          {distribution === null ? (
            <p className="mt-3 text-sm text-ink-600">Your sharing choices could not be read just now, so none can be changed here yet. Try again later.</p>
          ) : (
            <div className="mt-4 space-y-6">
              {heldVenues.map((v) => {
                const said = distribution?.get(v.id)
                return <VenueDistributionForm key={v.id} venue={{ id: v.id, name: v.name }} ourPosts={said?.ourPosts ?? true} weeklyRoundup={said?.weeklyRoundup ?? true} />
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
