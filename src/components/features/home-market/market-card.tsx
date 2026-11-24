import Link from 'next/link'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { IllustrativeChip } from '@/components/media/illustrative-chip'
import { SaveEventButton } from '@/components/features/events/save-event-button'
import type { MarketCard } from '@/lib/home/market-cards'
import { ShareEventButton } from './share-event-button'

/**
 * THE MARKETPLACE CARD (law 46; the design engine, section 2; site.html), one component wherever a night is drawn as a
 * marketplace card: the home's grid (market-browse.tsx) and /ig. The photograph (the night's own, else its venue's with
 * its credit, else the labelled illustrative photograph of its kind, else the brand panel), Tonight where true, the
 * title, the date in the gold text tier, the venue, the price or where it is booked, the category; save (the account's
 * saved events; signed out, the tap asks to sign in) and share. The whole card is one link; save and share sit beside
 * it, never inside it.
 *
 * `href` is where the card's link goes when a page tags it for the visit ledger (/ig: source instagram, the post's id);
 * share always hands on the listing's own address, so a friend's visit is never counted as the post's.
 */

const PHOTO_BOX = 'relative flex aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl bg-ink-900 sm:aspect-[16/9] sm:w-full'

/** 'Tonight', a true badge on its own navy backing; under the illustrative chip when the photograph carries one. */
function TonightBadge({ below }: { below: boolean }) {
  return (
    <span
      data-badge="tonight"
      className={`pointer-events-none absolute left-2 rounded-md bg-ink-900 px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-accent)] sm:text-[11px] ${below ? 'top-8' : 'top-2'}`}
    >
      Tonight
    </span>
  )
}

export function MarketEventCard({ card, href = card.href }: { card: MarketCard; href?: string }) {
  return (
    <article className="group relative">
      <Link
        href={href}
        prefetch={false}
        className="flex gap-3.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 sm:flex-col sm:gap-0"
      >
        {card.photo ? (
          <span className={PHOTO_BOX}>
            <EventCardMedia src={card.photo.src} alt={card.photo.alt} variant="market-card" />
            {card.photo.illustrative ? <IllustrativeChip small /> : null}
            {card.tonight ? <TonightBadge below={card.photo.illustrative} /> : null}
          </span>
        ) : (
          // The brand panel (law 46 (f) (4)): no lawful photograph, so no picture, only the brand, in a box of its own.
          <span data-brand-panel className={`${PHOTO_BOX} items-center justify-center`}>
            <span aria-hidden="true" className="font-headline text-lg font-extrabold tracking-tight text-white">
              EVENTLINQS<span className="text-[var(--brand-accent)]">.</span>
            </span>
            {card.tonight ? <TonightBadge below={false} /> : null}
          </span>
        )}
        <span className="min-w-0 flex-1 pr-12 sm:pr-0 sm:pt-3">
          <span className="block font-headline text-base font-extrabold leading-snug text-ink-900 [overflow-wrap:anywhere] group-hover:underline sm:text-[17px]">
            {card.title}
          </span>
          <span className="mt-1 block font-display text-sm font-bold text-[var(--brand-accent-strong)]">{card.date}</span>
          {card.venue ? <span className="mt-0.5 block font-display text-sm text-ink-600 [overflow-wrap:anywhere]">{card.venue}</span> : null}
          {card.price ? (
            <span className={`mt-1 block font-display text-sm font-extrabold ${card.free ? 'text-[var(--color-success-strong)]' : 'text-ink-900'}`}>{card.price}</span>
          ) : null}
          {card.category ? <span className="mt-0.5 block font-display text-xs font-semibold text-ink-400">{card.category}</span> : null}
          {card.photo?.credit ? <span className="mt-1 block font-display text-xs text-ink-400 [overflow-wrap:anywhere]">{card.photo.credit}</span> : null}
        </span>
      </Link>
      {/* Save and share beside the link, never inside it. On a phone the heart sits at the row's bottom right; from sm the
          box takes the photograph's own 16:9 shape over it, so the two sit on its bottom right corner at every width. */}
      <div className="pointer-events-none absolute bottom-0 right-0 sm:bottom-auto sm:inset-x-0 sm:top-0 sm:aspect-[16/9]">
        <div className="pointer-events-auto flex gap-2 sm:absolute sm:bottom-2.5 sm:right-2.5">
          <span className="hidden sm:block">
            <ShareEventButton title={card.title} href={card.href} />
          </span>
          <SaveEventButton eventId={card.id} variant="light" className="shadow-[var(--shadow-card)]" />
        </div>
      </div>
    </article>
  )
}
