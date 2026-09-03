import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStreamAccess, type StreamAccessRefusal } from '@/lib/stream/access'
import { classifyStreamLink } from '@/lib/stream/embed'
import { describeCountries } from '@/lib/stream/countries'
import { StreamRoom } from '@/components/stream/stream-room'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your livestream | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ code: string }>
  searchParams: Promise<{ k?: string }>
}

/*
 * THE WATCH SURFACE (Scope v5, 3.11): "link is only revealed to ticket holders
 * after purchase", "geo-based access restrictions", "chat, Q&A, and reaction
 * features accessible to livestream ticket holders".
 *
 * Bearer auth, exactly as /t/[code]: the (code, secret) pair is the credential,
 * and both a missing ticket and a wrong secret are a 404 so the address does
 * not act as an oracle. Every other refusal gets a sentence that is true about
 * its own cause, and none of them renders the link.
 */
function formatAuDateTime(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone ?? undefined,
      timeZoneName: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function refusalCopy(reason: StreamAccessRefusal, countries: string[]): { title: string; body: string } {
  switch (reason) {
    case 'not_valid':
      return {
        title: 'This ticket no longer admits',
        body: 'It has been refunded, cancelled or transferred, so the livestream is not available from it.',
      }
    case 'not_livestream_ticket':
      return {
        title: 'This ticket admits in person',
        body: 'It gets you through the door and does not include the livestream. Livestream tickets are sold separately on the event page.',
      }
    case 'geo_unknown':
      return {
        title: 'We could not confirm where you are watching from',
        body: `This livestream is available to viewers in ${describeCountries(countries)} only, and your location could not be confirmed from this connection.`,
      }
    case 'geo_blocked':
      return {
        title: 'This livestream is not available where you are',
        body: `The organiser has made it available to viewers in ${describeCountries(countries)} only.`,
      }
    case 'no_stream_link':
      return {
        title: 'The stream link is not here yet',
        body: 'The organiser has not added it. Check back closer to the start and it will appear on this page.',
      }
    default:
      return { title: 'Not available', body: 'The livestream is not available from this ticket.' }
  }
}

function liveState(start: string, end: string | null): 'before' | 'live' | 'after' {
  const now = Date.now()
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : s + 3 * 60 * 60 * 1000
  if (now < s) return 'before'
  if (now > e + 60 * 60 * 1000) return 'after'
  return 'live'
}

export default async function WatchPage({ params, searchParams }: Props) {
  const { code } = await params
  const { k: secret } = await searchParams
  if (!code || !secret) notFound()

  const hdrs = await headers()
  const country = hdrs.get('x-vercel-ip-country')
  const admin = createAdminClient()
  const access = await resolveStreamAccess(admin, code, secret, country)

  if (!access.ok && (access.reason === 'not_found' || access.reason === 'wrong_secret')) notFound()

  const ticketHref = `/t/${encodeURIComponent(code)}?k=${encodeURIComponent(secret)}`

  if (!access.ok) {
    const room = access.room
    const copy = refusalCopy(access.reason, room?.geoAllow ?? [])
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-canvas px-4 py-8">
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">Livestream</p>
          {room && (
            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight text-ink-900">{room.eventTitle}</h1>
          )}
          <div className="mt-5 rounded-xl border border-ink-200 bg-canvas p-5">
            <p className="font-display text-lg font-extrabold text-ink-900">{copy.title}</p>
            <p className="mt-1 text-sm text-ink-600">{copy.body}</p>
          </div>
          <Link
            href={ticketHref}
            className="mt-5 inline-flex min-h-[44px] items-center text-sm font-medium text-gold-800 underline hover:text-gold-700"
          >
            Back to your ticket
          </Link>
        </div>
      </main>
    )
  }

  const { room } = access
  const link = classifyStreamLink(room.streamUrl)
  const state = liveState(room.startDate, room.endDate)
  const statusLine =
    state === 'before'
      ? `Starts ${formatAuDateTime(room.startDate, room.timezone)}`
      : state === 'live'
        ? 'Live now'
        : 'This event has ended'

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">Livestream</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink-900 sm:text-3xl">{room.eventTitle}</h1>
            <p className="mt-1 text-sm text-ink-600">
              {formatAuDateTime(room.startDate, room.timezone)}
              {room.organisationName ? ` · ${room.organisationName}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                state === 'live' ? 'bg-[var(--color-navy-950)] text-gold-400' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {statusLine}
            </span>
            <p className="text-xs text-ink-600">Watching as {room.holderName}</p>
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="The stream" className="min-w-0">
          {link.ok && (link.kind === 'youtube' || link.kind === 'vimeo') ? (
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-[var(--color-navy-950)] shadow-sm">
              <div className="relative aspect-video w-full">
                <iframe
                  src={link.embedUrl}
                  title={`${room.eventTitle} livestream`}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>
          ) : link.ok && link.kind === 'rtmp' ? (
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <p className="font-display text-lg font-extrabold text-ink-900">Open this stream in your streaming app</p>
              <p className="mt-1 text-sm text-ink-600">
                This is an rtmp address, which a browser cannot play. Copy it into VLC, OBS or the app the organiser named.
              </p>
              <label htmlFor="stream-rtmp" className="mt-4 block text-xs font-medium text-ink-600">Stream address</label>
              <input
                id="stream-rtmp"
                readOnly
                value={link.url}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-canvas px-3 py-2 font-mono text-sm text-ink-900"
              />
            </div>
          ) : link.ok ? (
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <p className="font-display text-lg font-extrabold text-ink-900">
                {link.kind === 'zoom' ? 'This event streams on Zoom' : link.kind === 'streamyard' ? 'This event streams on StreamYard' : 'Your stream is ready'}
              </p>
              <p className="mt-1 text-sm text-ink-600">It opens in a new tab. Keep this page open for the chat and the questions.</p>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--color-navy-950)] px-7 text-sm font-semibold text-white hover:bg-[var(--color-navy-900)]"
              >
                Open the stream
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
              <p className="font-display text-lg font-extrabold text-ink-900">The stream link could not be read</p>
              <p className="mt-1 text-sm text-ink-600">The organiser has been asked to check it. Try again shortly.</p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-5 text-sm text-ink-600 shadow-sm">
            <p>
              {room.geoAllow.length > 0
                ? `This livestream is available to viewers in ${describeCountries(room.geoAllow)}.`
                : 'This livestream is available anywhere.'}{' '}
              Your ticket is the key to it, so keep the link to yourself.
            </p>
            <Link href={ticketHref} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-gold-800 underline hover:text-gold-700">
              Back to your ticket
            </Link>
          </div>
        </section>

        <StreamRoom
          code={room.ticketCode}
          secret={secret}
          holderName={room.holderName}
          timezone={room.timezone ?? PLATFORM_TIME_ZONE}
        />
      </div>
    </main>
  )
}
