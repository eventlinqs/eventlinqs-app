import { SectionHeader } from '@/components/ui/SectionHeader'
import { outsidePanelWords } from '@/lib/events/outside-panel-words'

/**
 * The ticket column for an event whose ticketing lives on another platform.
 *
 * Founder ruling 15 August 2026, non-negotiable 3: "An external event must never
 * render a ticket selector, a price, a quantity stepper or anything a buyer
 * could mistake for a checkout here. The call to action is one button that
 * leaves."
 *
 * ONE PRICE, AND ONLY A FRESH ONE (WI3, Lawal's 12:23 and the project manager's
 * 12:30 of 27 October 2026, point 4: "Price shown only when checked within 24
 * hours, otherwise none"). The ruling of 15 August refused a price because a
 * price beside a button reads as ours and may be stale; the newest ruling keeps
 * that and narrows it: the one figure shown is the organiser's own lowest price
 * including fees, read from their site within the last day and said as "From
 * $35.50" beside the site's name, and none at all otherwise
 * (src/lib/listings/ticket-panel.ts). Still no selector, no quantity and no fee
 * line, because we take no money on these events.
 *
 * ONE BUTTON, AND THE OTHER PLACES IT SELLS IN ONE QUIET LINE: "Also on
 * Eventbrite · Moshtix", each one tap. Every link sold out: "Sold out on
 * Humanitix" and no button at all, never a dead one.
 *
 * The links carry `rel="noopener"` because they open a third-party site, and
 * they are plain anchors rather than router links because they leave the app.
 *
 * THE BUTTON LIVES IN ONE PLACE (the PROJECT MANAGER's 13:10 of 30 October
 * 2026). The hero's "View tickets at <site>" only jumped down to this panel's
 * identical button, so the page offered the same button twice. The page now
 * puts the booking link itself in the hero and says so with `bookingInHero`:
 * this panel then keeps the facts (where it sells, a fresh price, the other
 * sites) and draws no second button.
 */
export function ExternalTicketsPanel({
  destinationUrl,
  host,
  label,
  price = null,
  also = [],
  soldOut = null,
  bookingInHero = false,
  registration = false,
}: {
  destinationUrl: string
  /** The destination's hostname, shown so the visitor knows where they land. */
  host: string | null
  /** The words on the button, naming the site where it can (src/lib/listings/ticket-panel.ts). */
  label: string
  /** "From $35.50", only when read within the last day; else none. */
  price?: string | null
  /** The other sites still selling, for the one quiet line under the button. */
  also?: readonly { href: string; name: string }[]
  /** "Sold out on Humanitix" when every link has sold out: then there is no button. */
  soldOut?: string | null
  /** The hero carries this button already (the event page's outside night): draw none here. */
  bookingInHero?: boolean
  /** A free night whose organiser takes registrations on its own site: the panel says registration, never tickets sold. */
  registration?: boolean
}) {
  const words = outsidePanelWords({ registration, bookingInHero, host })
  return (
    <div className="sticky top-20 space-y-5">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)]">
        <SectionHeader eyebrow={registration ? 'Registration' : 'Tickets'} title={soldOut ?? words.heading} size="sm" className="mb-4" />

        {soldOut === null ? (
          <>
            {/* With the button in the hero, "the button below" would point at nothing: the site is named instead. */}
            <p className="text-sm leading-relaxed text-ink-600">
              {words.body}
            </p>

            {price && (
              <p data-price className="mt-4 text-base font-semibold text-ink-900">
                {price}
              </p>
            )}

            {bookingInHero ? null : (
            <>
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-booking-button
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-ink-900 px-6 text-base font-semibold text-white transition hover:bg-ink-800"
            >
              {label}
            </a>

            {/*
              The destination host, stated plainly. A button that silently throws
              somebody onto a domain they did not expect is how a link stops being
              trusted, and naming it costs nothing.
            */}
            {host && (
              <p className="mt-3 text-center text-xs text-ink-400">
                Opens {host}
              </p>
            )}
            </>
            )}

            {also.length > 0 && (
              <p data-also-on className="mt-4 text-center text-sm text-ink-600">
                Also on{' '}
                {also.map((a, i) => (
                  <span key={a.href}>
                    {i > 0 && <span aria-hidden> · </span>}
                    <a href={a.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-900 underline-offset-2 hover:underline">
                      {a.name}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-ink-600">Every place selling this event has sold out.</p>
        )}
      </div>
    </div>
  )
}
