import Link from 'next/link'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import type { PieceSummary, ThreePosts } from '@/lib/social/three-posts'
import { planSpotlightAction } from '../social/actions'

const PRESS =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const OPEN = 'inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline underline-offset-4'

const PIECE_WORDS: Record<PieceSummary['state'], string> = {
  drafted: 'Drafted, waiting for your approval.',
  approved: 'Approved. Post it from your phone, then press Posted on the studio.',
  gone: 'Posted.',
  rejected: 'You turned this one down. Make it again on the studio.',
}

const GRANT_WORDS = {
  approved: 'Its own photographs are cleared for social use.',
  pending: 'Its own photographs wait for your yes under Images and their rights; until then the post carries no photograph.',
  none: 'No photograph of its own is cleared for social use, so the post carries no photograph.',
} as const

function PieceLine({ label, p }: { label: string; p: PieceSummary | null }) {
  return (
    <li className="py-4">
      <p className="text-sm font-semibold text-white">{label}</p>
      {p === null ? (
        <p className="mt-1 text-sm text-white/70">Not in this week&apos;s campaign. Press Plan on the studio to make the week.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/70">
            {PIECE_WORDS[p.state]}
            {p.postUrl ? (
              <>
                {' '}
                <a href={p.postUrl} className="underline underline-offset-2" rel="noreferrer noopener" target="_blank">
                  See the post
                </a>
              </>
            ) : null}
          </p>
          <Link href={p.href} className={OPEN}>
            Open it on the studio
          </Link>
        </>
      )}
    </li>
  )
}

/**
 * THIS WEEK'S THREE POSTS (Lawal, 12 November 2026, 11:11, items 3 and 4): Melbourne's weekend guide and tonight and
 * tomorrow pieces from the week's campaign, and the organiser spotlight, each with where it stands and a link to it on
 * /admin/social, where he reads, changes, approves and records it. Nothing here posts anything.
 */
export function PostsSection({ view }: { view: { ok: true; v: ThreePosts } | { ok: false; why: string } }) {
  return (
    <section id="posts" data-section="posts" aria-label="This week's three posts" className="mb-8 scroll-mt-24 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-white">This week&apos;s three posts</h2>
      {!view.ok ? (
        <p className="mt-2 text-sm text-amber-200">The posts could not be read just now ({view.why}). Nothing is lost.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          <PieceLine label="Melbourne this weekend" p={view.v.weekend} />
          <PieceLine label="Melbourne tonight and tomorrow" p={view.v.tonight} />
          <li className="py-4" data-spotlight={view.v.spotlight?.night.eventId ?? ''}>
            <p className="text-sm font-semibold text-white">Organiser spotlight</p>
            {view.v.spotlight === null ? (
              <p className="mt-1 text-sm text-white/70">No Melbourne organiser has a night of their own in the next fortnight.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-white/80">
                  {view.v.spotlight.night.title}, {formatPlatformDateTime(view.v.spotlight.night.startDate)}.{' '}
                  <Link href={`/events/${view.v.spotlight.night.slug}`} className="underline underline-offset-2">
                    Its page
                  </Link>
                </p>
                <p className="mt-1 text-xs text-white/60">{GRANT_WORDS[view.v.spotlight.night.socialGrant ?? 'none']}</p>
                {view.v.spotlight.post === null ? (
                  <form action={planSpotlightAction} className="mt-3">
                    <button type="submit" className={PRESS}>
                      Draft the spotlight post
                    </button>
                  </form>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-white/70">
                      {view.v.spotlight.post.postedAt
                        ? 'Posted.'
                        : view.v.spotlight.post.approvedAt
                          ? 'Approved. Post it from your phone, then press Posted on the studio.'
                          : view.v.spotlight.post.wordsBy === 'person'
                            ? 'Drafted in your words, waiting for your approval.'
                            : 'Drafted from the event page, waiting for you to read, change and approve it.'}
                      {view.v.spotlight.post.postUrl ? (
                        <>
                          {' '}
                          <a href={view.v.spotlight.post.postUrl} className="underline underline-offset-2" rel="noreferrer noopener" target="_blank">
                            See the post
                          </a>
                        </>
                      ) : null}
                    </p>
                    <Link href={view.v.spotlight.post.href} className={OPEN}>
                      Open it on the studio
                    </Link>
                  </>
                )}
              </>
            )}
          </li>
        </ul>
      )}
    </section>
  )
}
