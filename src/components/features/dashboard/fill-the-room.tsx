import Link from 'next/link'
import { EventShareBar } from '@/components/features/events/event-share-bar'

/**
 * Fill the room: the organiser's reach engine, live on their event screen.
 * Eventbrite shows sales; nobody shows an organiser their own demand and
 * share loop working. Every number is real platform data: confirmed
 * attendance, followers who get alerted, and signups that arrived through
 * shared links of THIS event (the attribution rows the share-a-ticket loop
 * writes). The share kit issues the organiser's own attributed link, so
 * the next number moves because of what they do here.
 */

export interface FillTheRoomProps {
  eventSlug: string
  eventTitle: string
  eventDateLabel: string
  siteUrl: string
  goingCount: number
  followerCount: number
  shareSignups: number
  isPublished: boolean
}

export function FillTheRoom({
  eventSlug,
  eventTitle,
  eventDateLabel,
  siteUrl,
  goingCount,
  followerCount,
  shareSignups,
  isPublished,
}: FillTheRoomProps) {
  const stats = [
    {
      value: goingCount,
      label: 'going',
      body: 'Confirmed tickets, live.',
    },
    {
      value: followerCount,
      label: followerCount === 1 ? 'follower alerted' : 'followers alerted',
      body: 'People following you hear about every event you publish.',
    },
    {
      value: shareSignups,
      label: shareSignups === 1 ? 'signup from shares' : 'signups from shares',
      body: 'New accounts that arrived through shared links of this event.',
    },
  ]

  return (
    <section
      aria-labelledby="fill-the-room-heading"
      className="mt-6 overflow-hidden rounded-card border border-gold-500/30 bg-white shadow-[var(--shadow-card)]"
    >
      <div className="border-b border-ink-100 px-6 py-5">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
          Your reach engine
        </p>
        <h2 id="fill-the-room-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
          Fill the room
        </h2>
      </div>

      <div className="grid gap-px bg-ink-100 sm:grid-cols-3">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white px-6 py-5">
            <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-[var(--brand-accent-strong)]">
              {stat.value}
            </p>
            <p className="mt-1 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-900">
              {stat.label}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">{stat.body}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-100 px-6 py-5">
        {isPublished ? (
          <>
            <p className="text-sm font-semibold text-ink-900">
              Put it in front of more people
            </p>
            <p className="mt-1 text-xs text-ink-600">
              Every link below carries your personal referral code, so signups
              and sales it drives are counted for you above. Shared links
              unfurl as your event&rsquo;s designed invitation card.
            </p>
            <div className="mt-3">
              <EventShareBar
                eventTitle={eventTitle}
                eventDate={eventDateLabel}
                eventUrl={`${siteUrl}/events/${eventSlug}`}
                variant="light"
              />
            </div>
            <p className="mt-3 text-xs text-ink-600">
              <a
                href={`/events/${eventSlug}/opengraph-image`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
              >
                Preview your share card
              </a>
              {' · '}
              <Link
                href={`/events/${eventSlug}`}
                className="font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
              >
                View your event page
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-600">
            Publish the event to unlock your share kit: attributed links, the
            designed share card, and follower alerts.
          </p>
        )}
      </div>
    </section>
  )
}
