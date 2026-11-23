import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { MarketEventCard } from '@/components/features/home-market/market-card'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'
import { readIgItems, type IgItem } from '@/lib/growth/ig'

/**
 * /ig, THE INSTAGRAM PAGE (Lawal, 23 November 2026, 12:47; the rules and why are in src/lib/growth/ig-math.ts). The
 * profile's one link, set once: every event our Instagram posted in the last 14 days that is still ahead, newest post
 * first, each once, each drawn by the marketplace's own card (the picture we may show, name, day, venue) and each a
 * link to its EventLinqs listing, which carries the verified onward booking link, tagged source instagram and the
 * post's id for the visit ledger.
 *
 * Rendered at most five minutes old (the /weekend and /this-weekend window), so a new post appears within minutes and
 * nobody changes the bio; a night leaves it at its end, because a rendered list carries a night only while it has the
 * list lead to run and the ending purge revalidates /ig with every night it purges (src/lib/events/revalidate-event.ts).
 * The header is static safe, so the cached page is the same for everyone. Never indexed: it is a doorway for people who
 * came from a post, not a page for search (src/lib/seo/indexing-policy.ts).
 */
export const revalidate = 300

export const metadata: Metadata = {
  title: 'From our Instagram | EventLinqs',
  description: 'Every event from our latest Instagram posts, newest first. Tap one for its date, venue and where to book.',
  ...noIndexMetadata(),
}

const CONTAINER = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
const SEE_MORE =
  'inline-flex min-h-12 items-center rounded-full border-2 border-ink-900 px-8 font-display text-base font-extrabold text-ink-900 transition-colors hover:bg-ink-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'

export default async function IgPage() {
  let items: IgItem[] = []
  let unread = false
  try {
    items = await readIgItems()
  } catch (err) {
    unread = true
    console.warn('[ig] the Instagram posts could not be read', err instanceof Error ? err.message : String(err))
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader staticSafe />
      <main className={CONTAINER}>
        <section aria-labelledby="ig-heading" className="pb-16 pt-8 sm:pt-12">
          <h1 id="ig-heading" className="font-headline text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            From our Instagram
          </h1>
          <p className="mt-2 max-w-xl font-display text-base text-ink-600">
            Every event from our latest posts, newest first. Tap one for its date, venue and where to book.
          </p>

          {items.length > 0 ? (
            <>
              {/* The home grid's own ladder, so the card's photograph hint (sizes.ts marketCard) holds here too. */}
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-7 lg:grid-cols-4">
                {items.map((item) => (
                  <li key={item.card.id}>
                    <MarketEventCard card={item.card} href={item.href} />
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex justify-center">
                <Link href="/events" prefetch={false} className={SEE_MORE}>
                  See every event
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-6 max-w-xl">
              <EmptyCollectionNote
                message={
                  unread
                    ? 'Our latest posts could not be loaded just now. Everything on is still one tap away.'
                    : 'Nothing from our latest posts is still ahead right now. Everything on is one tap away.'
                }
              />
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
