import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { cadenceFor, lastPosted, readPosts, type PostRow } from '@/lib/social/store'
import { FORMAT_NAME, cadenceLine, nextAllowed, type CadenceRule, type SocialFormat } from '@/lib/social/cadence'
import { approveAction, planWeekAction, recordPostedAction, writeWordsAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Social posts | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * EVENTLINQS' OWN POSTS, PLANNED, APPROVED AND COUNTED (item 11, the social engine; docs/SOCIAL-ENGINE.md).
 *
 * First what the posts brought in the last 30 days: tickets and money, then people who arrived and pressed out to the
 * organiser's page, each through a post's own link. Then the week's posts by city, each a Launch Kit card with the
 * night's own photo and the kit's own words: change the words, approve the newest, post it on Instagram by hand, and
 * paste its address here. Then the posts that went, each with what it brought. Likes are never shown.
 */

const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET =
  'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white'
const FIELD = 'block w-full rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-[13px] text-white'

const money = (cents: number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)

function ruleLine(format: SocialFormat, rule: CadenceRule, next: Date, now: Date): string {
  const when = next.getTime() <= now.getTime() ? 'one may go now' : `the next may go ${formatPlatformDateTime(next.toISOString())}`
  return cadenceLine(format, rule, when)
}

function Results({ r }: { r: PostRow['result'] }) {
  return (
    <p className="text-sm text-white/70" data-result>
      {r.tickets} ticket{r.tickets === 1 ? '' : 's'}, {money(r.cents)}. {r.arrived} arrived, {r.pressedOut} pressed out to book.
    </p>
  )
}

function Post({ p }: { p: PostRow }) {
  const card = `/admin/social/card/${p.id}`
  return (
    <li data-post={p.id} data-format={p.format} className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of a rendered card, never a public image */}
      <img src={card} alt={`${FORMAT_NAME[p.format].one} for ${p.eventTitle}`} loading="lazy" className="w-full max-w-[180px] rounded-lg border border-white/[0.08]" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
          Instagram {FORMAT_NAME[p.format].one.toLowerCase()}, {formatPlatformDateTime(p.eventStart)}
        </p>
        <h3 className="mt-1 font-display text-base font-semibold text-white">{p.eventTitle}</h3>
        {p.draft === null ? (
          <p data-state="no-words" className="mt-2 text-sm text-white/70">
            No words are kept for this post yet. Write them below.
          </p>
        ) : null}
        {p.postedAt === null ? (
          <>
            <form action={writeWordsAction} className="mt-3">
              <input type="hidden" name="post" value={p.id} />
              <label className="text-[11px] uppercase tracking-[0.18em] text-white/50" htmlFor={`words-${p.id}`}>
                The words{p.draft === null ? '' : `, version ${p.draft.version}${p.draft.writtenBy === 'kit' ? ', the Launch Kit’s' : ', yours'}`}
              </label>
              <textarea id={`words-${p.id}`} name="caption" data-words defaultValue={p.draft?.caption ?? `\n\n${p.link}`} rows={9} className={`mt-1 ${FIELD}`} />
              <p className="mt-1 text-xs text-white/50">Keep the link {p.link}. Every number must be one the listing holds.</p>
              <button type="submit" data-press="words" className={`mt-2 ${QUIET}`}>
                Keep these words
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={`${card}?download=1`} className={QUIET} data-press="download">
                Download the card
              </a>
              {p.draft !== null && p.approvedAt === null ? (
                <form action={approveAction}>
                  <input type="hidden" name="draft" value={p.draft.id} />
                  <button type="submit" data-press="approve" className={BUTTON}>
                    Approve version {p.draft.version}
                  </button>
                </form>
              ) : null}
            </div>
            {p.approvedAt !== null ? (
              <form action={recordPostedAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="post" value={p.id} />
                <label className="min-w-0 flex-1 text-sm text-white/70">
                  Approved {formatPlatformDateTime(p.approvedAt)}. Posted? Paste its address
                  <input name="url" type="url" required placeholder="https://www.instagram.com/p/" data-posted-url className={`mt-1 ${FIELD}`} />
                </label>
                <button type="submit" data-press="posted" className={BUTTON}>
                  Record it
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-white/70">
              Went {formatPlatformDateTime(p.postedAt)}.{' '}
              {p.postUrl === null ? null : (
                <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  See the post
                </a>
              )}
            </p>
            <Results r={p.result} />
          </div>
        )}
      </div>
    </li>
  )
}

export default async function AdminSocialPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.social.view', session })
  const { said } = await searchParams

  const db = createAdminClient()
  const now = new Date()
  const posts = await readPosts(db, now)
  const rules = await Promise.all(
    (['feed', 'story'] as const).map(async (format) => {
      const rule = await cadenceFor(db, 'instagram', format, now)
      return { format, rule, next: nextAllowed(rule, await lastPosted(db, 'instagram', format), now) }
    }),
  )
  const gone = posts.filter((p) => p.postedAt !== null).sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  const waiting = posts.filter((p) => p.postedAt === null).sort((a, b) => a.eventStart.localeCompare(b.eventStart) || a.format.localeCompare(b.format))
  const total = gone.reduce(
    (t, p) => ({ tickets: t.tickets + p.result.tickets, cents: t.cents + p.result.cents, arrived: t.arrived + p.result.arrived, pressedOut: t.pressedOut + p.result.pressedOut }),
    { tickets: 0, cents: 0, arrived: 0, pressedOut: 0 },
  )
  const cities = [...new Set(waiting.map((p) => p.city ?? 'Elsewhere'))]

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Social posts</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Our own Instagram posts, one feed card and one story for each night this week, made by the Launch Kit from the night&apos;s own photo and
          details. Each carries its own link, so the tickets it sells and the people it sends are counted as its own.
        </p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}

      <section data-section="brought" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">What our posts brought</h2>
        {gone.length === 0 ? (
          <p data-state="none-gone" className="mt-2 text-sm text-white/70">
            No post has gone yet, so nothing is counted. The first one you record starts the count.
          </p>
        ) : (
          <p data-total className="mt-2 text-sm text-white">
            {total.tickets} ticket{total.tickets === 1 ? '' : 's'} sold, {money(total.cents)}, from {gone.length} post{gone.length === 1 ? '' : 's'}.{' '}
            <span className="text-white/70">
              {total.arrived} people arrived through them and {total.pressedOut} pressed on to book with the organiser.
            </span>
          </p>
        )}
        <ul className="mt-4 space-y-1 text-sm text-white/60">
          {rules.map((r) => (
            <li key={r.format} data-rule={r.format} data-basis={r.rule.basis}>
              {ruleLine(r.format, r.rule, r.next, now)}
            </li>
          ))}
        </ul>
      </section>

      <section data-section="to-post" className="mb-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">To post this week</h2>
          <form action={planWeekAction}>
            <button type="submit" data-press="plan" className={QUIET}>
              Plan this week&apos;s posts
            </button>
          </form>
        </div>
        {waiting.length === 0 ? (
          <p data-state="none-waiting" className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">
            Nothing is waiting. Plan this week&apos;s posts to make one for every published night in the next seven days.
          </p>
        ) : (
          cities.map((city) => (
            <div key={city} data-city={city} className="mb-6">
              <h3 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/50">{city}</h3>
              <ul className="space-y-4">
                {waiting
                  .filter((p) => (p.city ?? 'Elsewhere') === city)
                  .map((p) => (
                    <Post key={p.id} p={p} />
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section data-section="gone">
        <h2 className="mb-4 font-display text-lg font-semibold text-white">Gone, and what each brought</h2>
        {gone.length === 0 ? (
          <p className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">None yet.</p>
        ) : (
          <ul className="space-y-4">
            {gone.map((p) => (
              <Post key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
