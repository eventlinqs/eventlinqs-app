import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { readCollaboratorKit, readMyCollaborations } from '@/lib/events/collaborators'
import { ShareKit } from '@/components/broadcast/share-kit'
import { getRequestOrigin } from '@/lib/site-origin'
import { formatEventDate } from '@/lib/dates/event-time'
import { declineCollaborationAction, joinCollaborationAction } from './actions'

export const metadata: Metadata = {
  title: 'Collaborations | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const SAID: Record<string, string> = {
  joined: 'You joined. Your links are below, and what they bring is counted as yours.',
  declined: 'Declined. The organiser will not see your venue on the event.',
  refused: 'That could not be done. It may already be answered, or it is not yours to answer.',
}

/**
 * COLLABORATIONS (the locked plan of 27 October 2026, item 15): the events a
 * venue was asked to join, each answered with one press, and for each it joined,
 * its own tracked links and what they brought (src/lib/events/collaborators.ts).
 */
export default async function CollaborationsPage({ searchParams }: { searchParams?: Promise<{ said?: string }> }) {
  const mine = await readMyCollaborations()
  if (mine === null) redirect('/login')
  const said = SAID[(await searchParams)?.said ?? ''] ?? null
  const asked = mine.rows.filter((r) => r.status === 'invited')
  const joined = mine.rows.filter((r) => r.status === 'joined')
  const origin = await getRequestOrigin()
  const kits = await Promise.all(joined.map((r) => readCollaboratorKit(r.id, origin)))

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Collaborations</h1>
      <p className="mt-1 text-sm text-ink-600">Events at your venues that other organisers run. Join one to get your own tracked links for it.</p>
      {said && (
        <p role="status" data-said className="mt-4 rounded-lg bg-ink-100 px-4 py-3 text-sm text-ink-900">
          {said}
        </p>
      )}

      {mine.rows.length === 0 && <p className="mt-8 text-sm text-ink-700">No organiser has asked your venues to join an event yet.</p>}

      {asked.length > 0 && (
        <section aria-label="Asked to join" className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Asked to join</h2>
          <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
            {asked.map((r) => (
              <li key={r.id} data-asked={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={`/events/${r.eventSlug}`} className="font-semibold text-ink-900 hover:underline">
                    {r.eventTitle}
                  </Link>
                  <p className="text-sm text-ink-600">
                    {r.venueName} · {formatEventDate(r.startDate, r.timezone)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={joinCollaborationAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" data-action="join" className="inline-flex min-h-[44px] items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800">
                      Join
                    </button>
                  </form>
                  <form action={declineCollaborationAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" data-action="decline" className="inline-flex min-h-[44px] items-center rounded-full border border-ink-300 bg-white px-5 text-sm font-semibold text-ink-900 hover:bg-ink-100">
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {joined.map((r, i) => {
        const kit = kits[i]
        return (
          <section key={r.id} aria-label={r.eventTitle} data-joined={r.id} className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link href={`/events/${r.eventSlug}`} className="text-lg font-bold text-ink-900 hover:underline">
                  {r.eventTitle}
                </Link>
                <p className="text-sm text-ink-600">
                  {r.venueName} · {formatEventDate(r.startDate, r.timezone)}
                </p>
              </div>
              {kit && (
                <p className="text-sm text-ink-700">
                  <span className="font-semibold tabular-nums">{kit.clicks.toLocaleString('en-AU')}</span> clicks ·{' '}
                  <span className="font-semibold tabular-nums">{kit.views.toLocaleString('en-AU')}</span> views through your links
                </p>
              )}
            </div>
            {kit && kit.links.length > 0 ? <ShareKit links={kit.links} /> : <p className="text-sm text-ink-700">Your links could not be made just now. Open this page again.</p>}
          </section>
        )
      })}
    </div>
  )
}
