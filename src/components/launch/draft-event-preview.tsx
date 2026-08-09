import type { KitDraftPayload } from '@/lib/launch/draft-store'

/**
 * The event page, as a buyer would meet it, rendered from a draft.
 *
 * Ruling 0.2a lists "event page preview" first among the things a stranger
 * sees, so this is a real rendered surface in the platform's own design
 * system, not a description of one and not an iframe of another page.
 *
 * THE PRIVATE ADDRESS RULE HOLDS HERE TOO. When the composer held the address
 * back, this shows the suburb and says so, because a preview that leaked the
 * street would defeat the point of holding it back on the poster.
 *
 * Law 6: no image is ever generated. With no supplied artwork this draws the
 * branded typographic composition, which is the designed answer rather than a
 * blank frame.
 */

/**
 * A draft's startDate is a NAIVE local wall-clock string ("YYYY-MM-DDTHH:mm",
 * no zone), because the organiser typed a time and has not yet chosen a venue
 * or a zone for it. There is no event row and so no `events.timezone` to pin.
 *
 * The previous version built the Date with the local constructor and formatted
 * with no timeZone. Those two runtime-zone reads happened to CANCEL, so the
 * rendered string was in fact stable, but it is indistinguishable from the
 * defect the clock guard exists to catch and one refactor away from becoming
 * it. Both reads are now explicit: the parts are assembled as UTC and
 * formatted as UTC, so the wall-clock the organiser typed is the wall-clock
 * every reader sees, on every machine, for a reason a reader can check.
 */
const DRAFT_ZONE = 'UTC'

function formatDate(local: string): { date: string; time: string } {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return { date: '', time: '' }
  const [, y, mo, d, hh, mm] = m
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)))
  if (Number.isNaN(dt.getTime())) return { date: '', time: '' }
  return {
    date: new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: DRAFT_ZONE,
    }).format(dt),
    time: new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DRAFT_ZONE,
    })
      .format(dt)
      .toLowerCase(),
  }
}

function priceLine(payload: KitDraftPayload): string {
  if (payload.isFree || payload.price == null || payload.price <= 0) return 'Free entry'
  return `From $${Math.round(payload.price)}`
}

export function DraftEventPreview({ payload }: { payload: KitDraftPayload }) {
  const { date, time } = formatDate(payload.startDate)
  const place = payload.addressHeldBack
    ? [payload.venueSuburb, payload.venueCity].filter(Boolean).join(', ')
    : [payload.venueName, payload.venueCity].filter(Boolean).join(', ')

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      {/* The hero. Navy scrim over supplied artwork, or the typographic
          composition when there is none. Never a generated image (Law 6). */}
      <div className="relative flex min-h-[220px] flex-col justify-end bg-[#0A1628] p-6 sm:min-h-[280px] sm:p-8">
        {payload.coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={payload.coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#0A1628] via-[#0A1628]/70 to-transparent"
            />
          </>
        ) : null}

        <div className="relative">
          <p
            className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
            style={{ fontWeight: 600 }}
          >
            {[payload.categoryName, payload.venueCity].filter(Boolean).join(' · ') || 'Live event'}
          </p>
          <h3 className="mt-2 font-headline text-2xl font-bold leading-tight text-white sm:text-3xl">
            {payload.title || 'Your event'}
          </h3>
          {date ? (
            <p className="mt-3 text-sm text-white/80">
              {date}
              {time ? ` · ${time}` : ''}
              {place ? ` · ${place}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <span className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white">
            {priceLine(payload)}
          </span>
          {payload.capacity ? (
            <span className="text-sm text-ink-600">{payload.capacity} places</span>
          ) : null}
        </div>

        {payload.summary ? (
          <p className="mt-5 text-base leading-relaxed text-ink-700">{payload.summary}</p>
        ) : null}

        {payload.description && payload.description !== payload.summary ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
            {payload.description}
          </p>
        ) : null}

        {payload.addressHeldBack ? (
          <p className="mt-5 text-sm text-ink-500">
            The exact address goes to people who are coming, not to this page.
          </p>
        ) : null}
      </div>
    </div>
  )
}
