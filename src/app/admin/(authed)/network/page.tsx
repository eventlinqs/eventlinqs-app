import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDemandSignal } from '@/lib/admin/demand-signal'
import { FOUNDING_SPOT_CAP, foundingCityName } from '@/lib/founding/invites'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'
import { WaitlistBridge } from './waitlist-bridge'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Demand signal | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * The founder's tipping-point dashboard. Read-only aggregates over TEST data:
 * per-city waitlist demand and its recent momentum, founding spots taken vs
 * remaining, invites issued and converted, and Launch Kit usage. Below it, the
 * waitlist-to-invite bridge, covering every Australian city rather than a
 * launch subset (nationwide from day one, founder ruling 2026-08-23).
 */
export default async function AdminNetworkPage() {
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
  const admin = createAdminClient()
  const { data: openEntries } = await admin
    .from('city_waitlist_signups')
    .select('id, city_slug, full_name, email, role, created_at')
    .in(
      'city_slug',
      getWaitlistCities().map(c => c.slug),
    )
    .is('unsubscribed_at', null)
    .order('created_at', { ascending: true })
  const { data: invited } = await admin
    .from('founding_invites')
    .select('invitee_email')
    .eq('inviter_kind', 'founder')
  const invitedEmails = new Set((invited ?? []).map(i => (i.invitee_email ?? '').toLowerCase()))
  const bridgeRows = (openEntries ?? [])
    .filter(e => e.role === 'organiser' && !invitedEmails.has(e.email.toLowerCase()))
    .map(e => ({ id: e.id, name: e.full_name, email: e.email, city: foundingCityName(e.city_slug) }))

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Demand signal</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          The tipping-point view: where demand is building, how many founding spots remain, and how the Launch Kit
          is being used. All figures are live counts.
        </p>
      </header>

      {/* Founding programme */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Founding spots taken" value={`${signal.founding.spotsTaken} / ${FOUNDING_SPOT_CAP}`} />
        <Metric label="Spots remaining" value={String(signal.founding.spotsRemaining)} accent />
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
        <div className="overflow-x-auto rounded-xl border border-white/15 bg-[#131A2A]">
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
        <WaitlistBridge rows={bridgeRows} spotsRemaining={signal.founding.spotsRemaining} />
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
