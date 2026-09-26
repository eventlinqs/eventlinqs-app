import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { ilikeAnyOf } from '@/lib/supabase/or-filter'
import { getDemandSignal } from '@/lib/admin/demand-signal'
import { foundingCityName } from '@/lib/founding/invites'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'
import { WaitlistBridge } from './waitlist-bridge'
import { FoundingTerms, type FoundingTermsRow } from './founding-terms'
import {
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_REFERRAL_MONTHS,
  isWaiverActive,
} from '@/lib/payments/founding-waiver'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * How many organisations the Founding terms list shows before the owner has to
 * search. Fifty, and it is a named constant rather than a numeral because the
 * bound now lives on the builder and a reader has to be able to see what it is
 * without following the chain.
 */
const FOUNDING_TERMS_SHOWN = 50

export const metadata = {
  title: 'Demand signal | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * The founder's tipping-point dashboard. Read-only aggregates over TEST data:
 * per-city waitlist demand and its recent momentum, founding organisers
 * joined (uncapped since LAW 24), invites issued and converted, and Launch Kit usage. Below it, the
 * waitlist-to-invite bridge, covering every Australian city rather than a
 * launch subset (nationwide from day one, founder ruling 2026-08-23).
 */
export default async function AdminNetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>
}) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.network.view', session })

  const signal = await getDemandSignal()

  // The waitlist entries the founder can invite (not yet invited,
  // not unsubscribed). Small list; real rows only.
  //
  // NATIONWIDE (founder ruling 2026-08-23). This filter named 'geelong' and
  // 'melbourne' until that ruling, which made it the last place the two-city
  // gate survived: the copy, the error message and the display name were all
  // opened up, but this query still decided which rows existed at all. The
  // effect was that a waitlist organiser in Perth or Darwin never appeared in
  // the bridge, so the founder could not invite them and the reworded refusal
  // in inviteWaitlistEntry() could never be reached for that case.
  //
  // It filters against the canonical city registry rather than dropping the
  // clause entirely, matching getDemandSignal(), so a row carrying a junk
  // city_slug cannot render a bridge row whose city renders as the raw slug.
  //
  // BOTH OF THESE READ EVERY ROW, AND THE SECOND ONE IS WHY IT MATTERS MOST.
  //
  // `invited` is a SUPPRESSION list: the bridge subtracts it from the waitlist
  // so nobody is invited twice. Every other read on this screen fails towards
  // showing too little, and this one fails towards doing too much. An unbounded
  // read that stopped at the server's thousand-row ceiling (HTTP 200, `error`
  // null, a full-looking array) would put already-invited organisers back on
  // the list, and dropping `error` was worse still: a read that FAILED made the
  // set empty, so every founding organiser ever invited reappeared as though
  // they had never been contacted. A founding invitation is a fee-free window
  // and a personal email, and sending it twice is not a cosmetic fault.
  //
  // `readEveryRow` throws on a failed page, so the screen now refuses to render
  // rather than rendering a list that is wrong in the expensive direction.
  const admin = createAdminClient()
  const openEntries = await readEveryRow<{
    id: string
    city_slug: string
    full_name: string
    email: string
    role: string
    created_at: string
  }>('the open waitlist entries', (from, to) =>
    admin
      .from('city_waitlist_signups')
      .select('id, city_slug, full_name, email, role, created_at')
      .in(
        'city_slug',
        getWaitlistCities().map(c => c.slug),
      )
      .is('unsubscribed_at', null)
      // Oldest first, because the fairest order to invite a waitlist in is the
      // order it was joined. `id` is the tiebreak that makes it a TOTAL order:
      // two people who joined in the same millisecond would otherwise leave the
      // paging undefined, and an undefined order can repeat one row across two
      // windows and skip another entirely.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  const invited = await readEveryRow<{ invitee_email: string | null }>(
    'the founder-issued founding invites',
    (from, to) =>
      admin
        .from('founding_invites')
        .select('invitee_email')
        .eq('inviter_kind', 'founder')
        .order('id', { ascending: true })
        .range(from, to),
  )
  const invitedEmails = new Set(invited.map(i => (i.invitee_email ?? '').toLowerCase()))
  const bridgeRows = openEntries
    .filter(e => e.role === 'organiser' && !invitedEmails.has(e.email.toLowerCase()))
    .map(e => ({ id: e.id, name: e.full_name, email: e.email, city: foundingCityName(e.city_slug) }))

  // FOUNDING TERMS, close-out FO1. Every organisation that already holds a
  // window, plus the most recent accounts, so the owner can grant one to an
  // organiser they have just recruited without hunting for an id. Real rows
  // only; nothing here is fabricated and nothing is paginated away silently,
  // because a hidden organisation is one the owner cannot grant terms to.
  //
  // AND IT IS SEARCHABLE, because a list is not a way to find one of 250
  // organisations. Found on 13 September by driving it: the owner could not
  // reach the organisation they had just recruited, because it was not among
  // the fifty most recent, and a control the owner cannot reach is a control
  // that does not exist.
  const foundingQuery = (await searchParams)?.org?.trim() ?? ''
  let termQuery = admin
    .from('organisations')
    .select('id, name, slug, is_founding, founding_fee_free_until, created_at')
    /*
     * BOUNDED WHERE THE READ IS BUILT, not where it is awaited.
     *
     * The `.limit()` was two statements below, on the await, which is the same
     * query and an invisible bound: read here, this was a select of every one
     * of 293 organisations with nothing to stop it. The chain walker in
     * scripts/guards/lib/supabase-select-chains.mjs reads a builder chain and
     * cannot follow a variable across statements, so it called this unbounded,
     * and it was right to: a human reading the same four lines gets the same
     * wrong answer. A bound that only exists somewhere else is a bound the next
     * person deletes by moving a line.
     */
    .limit(FOUNDING_TERMS_SHOWN)
  if (foundingQuery) {
    /*
     * ESCAPED, NOT STRIPPED, and the comment that stood here was wrong about
     * what its own code did. It said a comma was "refused rather than silently
     * searching for half a name", and what it actually did was replace `,()`
     * with spaces and search for the mangled string: an organisation called
     * "Rock, Paper" was looked for as "Rock  Paper" and was not found, silently,
     * on the screen an owner grants a Founding window from. Quoting the value
     * makes it literal, so the name is searched for as typed.
     */
    termQuery = termQuery.or(ilikeAnyOf(['name', 'slug'], foundingQuery))
  }
  // BOUNDED BY ITS OWN `.limit(50)`, which is the point of the list: the fifty
  // most relevant, with a search box for everything else. The error is no
  // longer discarded, because a failed read rendered an empty Founding terms
  // table, which reads as a platform with no founding organisers rather than as
  // a database that could not be reached.
  const { data: termRows, error: termError } = await termQuery
    .order('founding_fee_free_until', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (termError) {
    throw new Error(`the founding terms list could not be read: ${termError.message}`)
  }

  const termOrgs = termRows ?? []
  const holders = termOrgs.filter(o => o.founding_fee_free_until !== null).length
  const referralCounts = new Map<string, number>()
  if (termOrgs.length > 0) {
    // Every organisation these fifty have referred and been credited for. The
    // `in` list bounds the QUESTION at fifty inviters, not the ANSWER: one
    // successful founding organiser can refer any number of others, and this
    // number is what the screen shows as fee-free months earned. Paged, and a
    // failed read raises rather than showing everybody nil referrals.
    const credited = await readEveryRow<{ referred_by_organisation_id: string | null }>(
      'the founding referral credits',
      (from, to) =>
        admin
          .from('organisations')
          .select('referred_by_organisation_id')
          .in(
            'referred_by_organisation_id',
            termOrgs.map(o => o.id),
          )
          .not('referral_credited_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
    )
    for (const row of credited) {
      const key = row.referred_by_organisation_id
      if (!key) continue
      referralCounts.set(key, (referralCounts.get(key) ?? 0) + 1)
    }
  }

  const foundingTermRows: FoundingTermsRow[] = termOrgs.map(o => ({
    id: o.id,
    name: o.name ?? 'Unnamed organisation',
    slug: o.slug ?? null,
    isFounding: o.is_founding === true,
    feeFreeUntil: o.founding_fee_free_until ?? null,
    active: isWaiverActive(o.founding_fee_free_until),
    referralsConfirmed: referralCounts.get(o.id) ?? 0,
  }))

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Demand signal</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          The tipping-point view: where demand is building, how many founding organisers have joined, and how the
          Launch Kit is being used. All figures are live counts.
        </p>
      </header>

      {/* Founding programme */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Founding organisers" value={String(signal.founding.spotsTaken)} accent />
        <Metric label="Invites issued" value={String(signal.founding.invitesIssued)} />
        <Metric label="Invites converted" value={String(signal.founding.invitesAccepted)} />
      </section>

      {/* Kit usage */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white/60">Launch Kit usage</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Events published" value={String(signal.kit.eventsPublished)} />
          <Metric label="Posters downloaded" value={String(signal.kit.postersDownloaded)} />
          <Metric label="Tracked link clicks" value={String(signal.kit.linkClicks)} />
          <Metric label="Link conversions" value={String(signal.kit.linkConversions)} />
        </div>
      </section>

      {/* Per-city waitlist demand */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white/60">Waitlist demand by city</h2>
        {/*
          A SCROLLING REGION A FINGER CAN REACH AND A KEYBOARD CANNOT IS A
          SERIOUS VIOLATION, AND THIS ONE FIRED ON EVERY MOBILE LOAD.

          Driven at 390 on 20 September 2026, before this line was written: axe
          reported `scrollable-region-focusable`, serious, one node, `.overflow-x-auto`.
          A `min-w-[640px]` table inside an `overflow-x-auto` box is a horizontally
          scrolling region, and with no `tabIndex` it cannot be scrolled without
          a mouse: the last two columns of this table, "Last 7 days" and "Last 30
          days", which are the momentum figures the whole screen exists for, were
          unreachable to a keyboard or screen-reader user at that width.

          UNLIKE the identical fault fixed on /admin/pricing the same day, this
          one needed no data to appear. The city rows come from the canonical
          registry rather than the database, so there are always fourteen of
          them and the table always overflows at 390. It has been there since
          the screen was built.

          The shape is the one src/app/admin/(authed)/health/page.tsx already
          uses: tabIndex, role="region" and a name, so a screen reader announces
          the region as something rather than dropping into an unlabelled box.
        */}
        <div
          className="overflow-x-auto rounded-xl border border-white/15 bg-[#131A2A]"
          tabIndex={0}
          role="region"
          aria-label="Waitlist demand by city"
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/50">
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Organisers</th>
                <th className="px-4 py-3 font-medium">Attendees</th>
                <th className="px-4 py-3 font-medium">Last 7 days</th>
                <th className="px-4 py-3 font-medium">Last 30 days</th>
              </tr>
            </thead>
            <tbody>
              {signal.cities
                .sort((a, b) => b.total - a.total)
                .map(c => (
                  <tr key={c.slug} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 font-semibold text-white">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-white">{c.total}</td>
                    <td className="px-4 py-3 text-white/80">{c.organisers}</td>
                    <td className="px-4 py-3 text-white/80">{c.attendees}</td>
                    <td className="px-4 py-3 text-white/80">{c.last7}</td>
                    <td className="px-4 py-3 text-white/80">{c.last30}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Waitlist-to-invite bridge */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white/60">
          Invite founding organisers from the waitlist
        </h2>
        <p className="mb-3 max-w-2xl text-sm text-white/60">
          These are organiser waitlist sign-ups in the open cities who have not yet been invited. Inviting one mints
          a founding invite and emails them the warm link. They consented to hear about founding invitations when
          they joined, and every email carries the one-click leave link.
        </p>
        <WaitlistBridge rows={bridgeRows} />
      </section>

      {/* Founding terms, by hand */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white/60">
          Founding terms
        </h2>
        <p className="mb-3 max-w-2xl text-sm text-white/60">
          Grant, extend or revoke a Founding Organiser fee-free window. The charge reads this field on every order,
          so a change here applies to the next order placed, with no deploy. Every change is written to the audit log
          with who made it and what it moved. The list shows every organisation holding a window first, then the
          newest accounts; search by name or handle to reach any other.
        </p>
        <form method="get" action="/admin/network" className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="org-search" className="text-xs text-white/60">
            Find an organisation
          </label>
          <input
            id="org-search"
            name="org"
            type="search"
            defaultValue={foundingQuery}
            placeholder="Name or handle"
            className="min-h-[40px] min-w-[220px] rounded-full border border-white/20 bg-[#131A2A] px-4 text-sm text-white placeholder:text-white/30"
          />
          <button
            type="submit"
            className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
          {foundingQuery ? (
            <a href="/admin/network" className="text-xs text-white/50 underline">
              Clear
            </a>
          ) : null}
        </form>
        <FoundingTerms
          rows={foundingTermRows}
          holders={holders}
          initialMonths={FOUNDING_INITIAL_MONTHS}
          referralMonths={FOUNDING_REFERRAL_MONTHS}
        />
      </section>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/15 bg-[#131A2A] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold ${accent ? 'text-[var(--brand-accent)]' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}
