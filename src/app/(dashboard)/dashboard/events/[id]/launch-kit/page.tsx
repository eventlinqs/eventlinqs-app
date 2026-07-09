import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import {
  ArrowUpRight,
  CalendarDays,
  DoorOpen,
  Download,
  ImageIcon,
  MapPin,
  Pencil,
  TicketPercent,
  Users,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFlagEnabled } from '@/lib/flags'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchReachSummary } from '@/lib/broadcast/reach'
import {
  buildShortUrl,
  getOrCreateShareLink,
  type ShareChannel,
} from '@/lib/broadcast/share-links'
import { getSiteUrl } from '@/lib/site-url'
import { HeroMedia } from '@/components/media'
import { Reveal } from '@/components/ui/reveal'
import { CopyLinkButton } from '@/components/launch-kit/copy-link-button'
import { LaunchShareRow } from '@/components/launch-kit/launch-share-row'
import { SeatMapPreview } from '@/components/seating/seat-map-preview'
import type { SeatData, SectionData, SeatAreaData } from '@/components/checkout/seat-selector'

export const metadata: Metadata = {
  title: 'Launch Kit | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ published?: string }>
}

/** The channels the kit pre-mints, in share-priority order. */
const KIT_CHANNELS: readonly ShareChannel[] = [
  'whatsapp',
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'email',
  'copy',
]

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  messenger: 'Messenger',
  email: 'Email',
  sms: 'SMS',
  copy: 'Copied links',
  native: 'Share sheet',
  qr: 'Poster QR',
  other: 'Other',
}

function formatEventDate(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

/**
 * The Launch Kit - the signature post-publish moment.
 *
 * The organiser publishes and lands here: their live page, their room, their
 * A4 QR poster, their invitation card, one-tap tracked sharing for every
 * channel, and their live reach, delivered as one complete kit. Everything on
 * this screen is real and working: every link resolves, the QR scans to the
 * tracked short link, and the reach numbers are measured platform data.
 */
export default async function LaunchKitPage({ params, searchParams }: Props) {
  const [{ id }, { published }] = await Promise.all([params, searchParams])

  if (!(await isFlagEnabled('launch_kit'))) {
    redirect(`/dashboard/events/${id}`)
  }

  const organiserEvent = await getOrganiserEvent(id)
  if (!organiserEvent) notFound()

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select(
      'status, cover_image_url, venue_name, venue_city, has_reserved_seating, seat_map_id, summary',
    )
    .eq('id', id)
    .maybeSingle()
  if (!event) notFound()

  const justPublished = published === '1'
  const isLive = event.status === 'published'
  const siteUrl = getSiteUrl()
  const eventUrl = `${siteUrl}/events/${organiserEvent.slug}`
  const dateLabel = organiserEvent.startDate
    ? formatEventDate(organiserEvent.startDate, organiserEvent.timezone ?? 'Australia/Melbourne')
    : ''
  const placeLabel = [event.venue_name, event.venue_city].filter(Boolean).join(', ')

  // ── The locked state: the kit is delivered at publish, never before ──────
  if (!isLive) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            Launch Kit
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">
            Your launch kit unlocks when you publish
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-600">
            Publish {organiserEvent.title} and this screen becomes your complete kit: the live
            page link, your seat map, a print-ready QR poster, share cards for every channel,
            and live reach numbers.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/dashboard/events/${id}/edit`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Finish and publish
            </Link>
            <Link
              href={`/dashboard/events/${id}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-50"
            >
              Back to event
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Kit assembly (all real, all tracked) ──────────────────────────────────
  const shareOn = await isFeatureEnabled('broadcast_share')

  const kitLinks: Partial<Record<ShareChannel, string>> = {}
  let qrShortUrl: string | null = null
  if (shareOn) {
    for (const channel of [...KIT_CHANNELS, 'qr'] as ShareChannel[]) {
      const link = await getOrCreateShareLink({
        eventId: id,
        channel,
        createdBy: organiserEvent.userId,
      })
      if (link) {
        const url = buildShortUrl(siteUrl, link.code)
        if (channel === 'qr') qrShortUrl = url
        else kitLinks[channel] = url
      }
    }
  } else {
    // Share tooling off: every button still works with the plain live URL, so
    // nothing here is ever a dead control. Reach explains itself below.
    for (const channel of KIT_CHANNELS) kitLinks[channel] = eventUrl
  }

  const qrSvg = qrShortUrl
    ? await QRCode.toString(qrShortUrl, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
        color: { dark: '#0A1628', light: '#FFFFFF' },
      })
    : null

  const summary = shareOn
    ? await fetchReachSummary(id)
    : { totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 }, byChannel: [], linkCount: 0 }

  // Seated events: the room preview, exactly as buyers see it.
  let seats: SeatData[] = []
  let sections: SectionData[] = []
  let areas: SeatAreaData[] = []
  if (event.has_reserved_seating && event.seat_map_id) {
    const [seatsRes, sectionsRes, mapRes] = await Promise.all([
      admin
        .from('seats')
        .select(
          'id, row_label, seat_number, seat_type, status, x, y, price_cents, seat_map_section_id, ticket_tier_id',
        )
        .eq('event_id', id)
        .order('row_label')
        .order('seat_number')
        .range(0, 1999),
      admin
        .from('seat_map_sections')
        .select('id, name, color')
        .eq('seat_map_id', event.seat_map_id)
        .order('sort_order'),
      admin.from('seat_maps').select('layout').eq('id', event.seat_map_id).maybeSingle(),
    ])
    seats = (seatsRes.data ?? []) as SeatData[]
    sections = (sectionsRes.data ?? []) as SectionData[]
    areas = ((mapRes.data?.layout as { areas?: SeatAreaData[] } | null)?.areas ?? []).filter(
      a => typeof a?.x === 'number' && typeof a?.y === 'number',
    )
  }
  const openSeats = seats.filter(s => s.status === 'available').length

  const reachStats = [
    { label: 'Link views', value: summary.totals.views },
    { label: 'Link clicks', value: summary.totals.clicks },
    { label: 'Orders from links', value: summary.totals.conversions },
    { label: 'Tickets from links', value: summary.totals.tickets },
  ]
  const topChannels = [...summary.byChannel]
    .sort((a, b) => b.clicks + b.views - (a.clicks + a.views))
    .slice(0, 4)

  const nextSteps = [
    { href: `/dashboard/events/${id}`, label: 'Manage event', icon: Pencil },
    { href: `/dashboard/events/${id}/attendees`, label: 'Attendees', icon: Users },
    { href: `/dashboard/events/${id}/discounts`, label: 'Discount codes', icon: TicketPercent },
    { href: `/scan/${id}`, label: 'Door check-in', icon: DoorOpen },
  ]

  return (
    <div className="pb-4">
      {/* ── The delivery moment: the kit masthead ─────────────────────────── */}
      <section
        aria-labelledby="launch-kit-heading"
        className="relative overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(10,22,40,0.45)] ring-1 ring-black/5"
      >
        <div className="relative min-h-[300px] sm:min-h-[320px]">
          <HeroMedia
            image={event.cover_image_url ?? ''}
            alt=""
            priority
            objectPosition="50% 30%"
          />
          {/* The platform hero scrim: darkness only ever comes from the photo. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(10,22,40,0.88) 0%, rgba(10,22,40,0.55) 45%, rgba(10,22,40,0.12) 80%, rgba(10,22,40,0.00) 100%)',
            }}
          />
          <div className="relative z-10 flex min-h-[300px] flex-col justify-end p-6 sm:min-h-[320px] sm:p-8">
            <div className="hero-enter max-w-3xl">
              <p className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                />
                {justPublished ? 'Published · your launch kit is ready' : 'Your launch kit'}
              </p>
              <h1
                id="launch-kit-heading"
                className="mt-2 font-headline text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl"
              >
                {organiserEvent.title} is live.
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
                  {dateLabel}
                </span>
                {placeLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
                    {placeLabel}
                  </span>
                )}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600"
                >
                  Open your live page
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </a>
                <CopyLinkButton url={eventUrl} variant="dark" />
                <span className="max-w-full truncate text-xs text-white/70 sm:text-sm">
                  {eventUrl.replace(/^https?:\/\//, '')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Send it everywhere: one-tap tracked sharing ───────────────────── */}
      <Reveal as="section" aria-labelledby="kit-share-heading" className="mt-6">
        <div className="rounded-2xl border border-gold-500/30 bg-white shadow-[var(--shadow-card)]">
          <div className="border-b border-ink-100 px-6 py-5">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
              In the kit · tracked sharing
            </p>
            <h2 id="kit-share-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
              Send it everywhere
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-600">
              {shareOn
                ? 'Each button carries its own tracked link, so every click and every sale shows up in your reach below, attributed to the exact channel. Shared links unfurl as your designed invitation card.'
                : 'Share tooling is switched off on this platform right now, so these buttons carry your plain live link. Your event page and ticket sales are unaffected.'}
            </p>
          </div>
          <div className="px-6 py-5">
            <LaunchShareRow
              links={kitLinks}
              shareText={`${organiserEvent.title} - ${dateLabel}`}
            />
          </div>
        </div>
      </Reveal>

      {/* ── The print + preview pair: QR poster and invitation card ───────── */}
      <Reveal stagger as="div" className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* QR poster */}
        <section
          aria-labelledby="kit-poster-heading"
          className="flex flex-col rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-ink-100 px-6 py-5">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
              In the kit · print
            </p>
            <h2 id="kit-poster-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
              Your A4 QR poster
            </h2>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-6 px-6 py-5">
            {qrSvg ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  aria-hidden
                  className="h-36 w-36 rounded-xl border border-ink-200 bg-white p-3 shadow-sm [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="text-[11px] font-medium text-ink-600">Scan it: it works right now</p>
              </div>
            ) : null}
            <div className="min-w-[200px] flex-1">
              <p className="text-sm leading-relaxed text-ink-600">
                Print-ready, navy and gold, with your cover photo and a QR that opens your live
                page through a tracked link: every scan lands in your reach as Poster QR.
              </p>
              <a
                href={`/api/organiser/events/${id}/poster`}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download A4 poster (PDF)
              </a>
            </div>
          </div>
        </section>

        {/* Invitation share card */}
        <section
          aria-labelledby="kit-card-heading"
          className="flex flex-col rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-ink-100 px-6 py-5">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
              In the kit · social
            </p>
            <h2 id="kit-card-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
              Your invitation card
            </h2>
          </div>
          <div className="flex flex-1 flex-col justify-between px-6 py-5">
            <p className="text-sm leading-relaxed text-ink-600">
              Every link you share unfurls as a designed invitation: your cover photo, the title,
              date and venue on the EventLinqs navy, automatically, on WhatsApp, Instagram,
              Facebook, X and LinkedIn. Nothing to build, nothing to export.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={`/events/${organiserEvent.slug}/opengraph-image`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)]"
              >
                <ImageIcon className="h-4 w-4" aria-hidden />
                Preview your card
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
              <p className="text-xs text-ink-600">Opens full size: right-click or long-press to save.</p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── The room (seated events) ──────────────────────────────────────── */}
      {seats.length > 0 || areas.length > 0 ? (
        <Reveal as="section" aria-labelledby="kit-room-heading" className="mt-6">
          <div className="rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-6 py-5">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
                  In the kit · your room
                </p>
                <h2 id="kit-room-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
                  Your seat map, live and selling
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  {seats.length} seats
                  {sections.length > 0 &&
                    ` across ${sections.length} section${sections.length === 1 ? '' : 's'}`}
                  {` · ${openSeats} open right now. Buyers pick their exact seat on your live page.`}
                </p>
              </div>
              <Link
                href={`/dashboard/events/${id}/seats`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)] hover:bg-ink-50"
              >
                Manage seats
              </Link>
            </div>
            <div className="px-6 py-5">
              <div className="overflow-hidden rounded-xl border border-ink-100 bg-canvas p-3">
                <SeatMapPreview
                  seats={seats}
                  sections={sections}
                  areas={areas}
                  className="mx-auto block max-h-[340px] w-full"
                />
              </div>
              {sections.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  {sections.map(s => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 text-ink-600">
                      <span
                        aria-hidden
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* ── Live reach ────────────────────────────────────────────────────── */}
      <Reveal as="section" aria-labelledby="kit-reach-heading" className="mt-6">
        <div className="rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 px-6 py-5">
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
                In the kit · live reach
              </p>
              <h2 id="kit-reach-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
                Watch it travel
              </h2>
            </div>
            <Link
              href={`/dashboard/events/${id}/reach`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)] hover:bg-ink-50"
            >
              Full reach panel
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-px bg-ink-100 sm:grid-cols-4">
            {reachStats.map(stat => (
              <div key={stat.label} className="bg-white px-6 py-5">
                <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-[var(--brand-accent-strong)]">
                  {stat.value}
                </p>
                <p className="mt-1 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-900">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-ink-100 px-6 py-4">
            {topChannels.length === 0 ? (
              <p className="text-sm text-ink-600">
                {shareOn
                  ? 'Numbers land here the moment your first shared link is opened. Only measured platform activity is counted, never estimates.'
                  : 'Share tooling is off, so tracked reach is paused. Your event page and sales are unaffected.'}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-semibold text-ink-900">Top channels:</span>
                {topChannels.map(row => (
                  <span key={row.channel} className="text-ink-600">
                    {CHANNEL_LABELS[row.channel] ?? row.channel}
                    <span className="ml-1.5 font-semibold text-ink-900">
                      {row.clicks + row.views}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* ── Next steps ────────────────────────────────────────────────────── */}
      <Reveal as="nav" aria-label="Next steps" className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {nextSteps.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-5 py-4 text-sm font-semibold text-ink-900 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)] hover:shadow-md"
            >
              <span className="inline-flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-[var(--brand-accent-strong)]" aria-hidden />
                {label}
              </span>
              <ArrowUpRight
                className="h-4 w-4 text-ink-400 transition-colors group-hover:text-[var(--brand-accent-strong)]"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </Reveal>
    </div>
  )
}
