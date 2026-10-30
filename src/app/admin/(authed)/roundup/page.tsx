import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { getCity } from '@/lib/cities/data'
import { editionDigestCities, fetchDigestCities, fetchDigestEvents, resolveDigestPeriod } from '@/lib/broadcast/digest'
import { whatsappEdition, whatsappShareUrl } from '@/lib/broadcast/whatsapp-edition'
import { roundupApproval } from '@/lib/broadcast/roundup'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { approveRoundupAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Weekly roundup | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE WEEKLY ROUNDUP PER CITY, DRAFTED FOR APPROVAL (Train C, row 9: "email to subscribers, the WhatsApp edition
 * drafted for Lawal", done when "Thursday's edition is drafted from verified listings, approved, sent").
 *
 * For each city with subscribers: this week's listings exactly as the weekly email carries them
 * (src/lib/broadcast/digest.ts), the WhatsApp edition drafted from the same listings for Lawal to post in the channel
 * or share, and one press to approve. The weekly digest cron (Thursday 09:00 on the platform's clock) sends a city only
 * once it is approved here. Nothing on this page sends anything.
 */

const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET =
  'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white'

export default async function AdminRoundupPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.roundup.view', session })
  const { said } = await searchParams

  const admin = createAdminClient()
  const now = new Date()
  const origin = getSiteUrl()
  const period = resolveDigestPeriod(now)
  const slugs = editionDigestCities(await fetchDigestCities(admin))
  const editions = await Promise.all(
    slugs.map(async (slug) => {
      const city = getCity(slug)
      const name = city?.name ?? slug
      const events = await fetchDigestEvents(admin, slug, period, 10, origin, name)
      const text = whatsappEdition({ cityName: name, events, cityUrl: `${origin}/city/${slug}` })
      const approval = await roundupApproval(admin, slug, now)
      return { slug, name, events, text, approval }
    }),
  )

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Weekly roundup</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          This week&apos;s listings for each city with subscribers, as the Thursday email carries them, and the WhatsApp edition drafted from
          the same listings. A city&apos;s email goes on Thursday only once it is approved here.
        </p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}

      {editions.length === 0 ? (
        <p data-state="empty" className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">
          No city has subscribers yet, so there is no roundup to approve.
        </p>
      ) : (
        editions.map((e) => (
          <section key={e.slug} data-city={e.slug} className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">{e.name}</h2>
              <p data-approval={e.approval === null ? 'none' : e.approval === 'unreadable' ? 'unreadable' : 'approved'} className="text-sm text-white/60">
                {e.approval === null
                  ? 'Not approved this week'
                  : e.approval === 'unreadable'
                    ? 'Whether it is approved could not be read just now'
                    : `Approved ${formatPlatformDateTime(e.approval.approvedAt)}`}
              </p>
            </div>
            {e.events.length === 0 ? (
              <p data-state="no-listings" className="mt-4 text-sm text-white/70">
                No listings this week, so this city gets no email and no edition.
              </p>
            ) : (
              <>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-white">
                  {e.events.map((ev) => (
                    <li key={ev.id}>
                      <a href={ev.url} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                        {ev.title}
                      </a>
                      <span className="text-white/60">
                        {' '}
                        {ev.dateLabel}, {ev.venueLabel}. {ev.priceLabel}.
                      </span>
                    </li>
                  ))}
                </ol>
                <h3 className="mt-6 text-[11px] uppercase tracking-[0.18em] text-white/50">The WhatsApp edition</h3>
                <textarea
                  readOnly
                  aria-label={`The WhatsApp edition for ${e.name}`}
                  data-whatsapp={e.slug}
                  value={e.text}
                  rows={Math.min(18, e.text.split('\n').length + 1)}
                  className="mt-2 block w-full max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 font-mono text-[13px] text-white"
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href={whatsappShareUrl(e.text)} target="_blank" rel="noopener noreferrer" className={QUIET}>
                    Share on WhatsApp
                  </a>
                  {e.approval === null ? (
                    <form action={approveRoundupAction}>
                      <input type="hidden" name="city" value={e.slug} />
                      <button type="submit" data-press="approve" className={BUTTON}>
                        Approve {e.name}&apos;s roundup
                      </button>
                    </form>
                  ) : null}
                </div>
              </>
            )}
          </section>
        ))
      )}
    </div>
  )
}
