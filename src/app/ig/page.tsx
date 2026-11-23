import type { Metadata } from 'next'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { MarketEventCard } from '@/components/features/home-market/market-card'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'
import { readIgItems, readIgPiecePage, type IgItem } from '@/lib/growth/ig'
import { igSource } from '@/lib/growth/ig-math'
import { EVENT_DATA_CACHE_TAGS } from '@/lib/events/cache-tags'

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
 * The header is static safe, so the page is the same for everyone. Never indexed: it is a doorway for people who
 * came from a post, not a page for search (src/lib/seo/indexing-policy.ts).
 *
 * ONE PIECE NAMED, /ig?piece=<id> (the PM's RETURN of 04:05 on 24 November 2026: a set piece's link landed on
 * /city/melbourne, every Melbourne night, where its shows had to be hunted for; Lawal's 13:12 item 3, the whole booking
 * journey to the right event): the same page shows exactly that piece's nights, still ahead and public, in date order, on
 * the same approved marketplace card, each leading to its event page and its booking button, its heading and title from
 * the piece's own hook (src/lib/growth/ig.ts readIgPiecePage). It is a set piece's own link (campaign.ts
 * planApprovedSet), reached through the /go hop, which tags the network the visitor came from; the cards carry it on.
 *
 * Reading the query renders the page on each request ("Using searchParams opts your page into dynamic rendering",
 * node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md), so the page of every post keeps its
 * five minute window in the data cache instead (everyPost below, the way src/lib/categories/taxonomy.ts holds its rows;
 * Cache Components and 'use cache' are not on in this project): its posts are read at most once in five minutes, as
 * before; the ending purge's revalidatePath('/ig') still clears them, since the cached read carries the page's own path
 * tag, and so does every event change, by the events grid's own tag (cache-tags.ts, cleared by revalidateEventSurfaces):
 * a cached row never outlives the night it copied (scripts/guards/one-visibility-source.mjs).
 */
export const revalidate = 300

/** The page of every post: its read held five minutes, as the rendered page was before a piece could be named. */
const everyPost = unstable_cache(() => readIgItems(), ['ig-every-post-v1'], { revalidate: 300, tags: [EVENT_DATA_CACHE_TAGS[0]] })

const PIECE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type IgQuery = { piece?: string | string[]; utm_source?: string | string[] }
type IgProps = { searchParams: Promise<IgQuery> }

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null

/** The piece the address names, or null for the page of every post. */
function pieceOf(q: IgQuery): string | null {
  const piece = first(q.piece)
  return piece && PIECE_ID.test(piece) ? piece.toLowerCase() : null
}

/** One read of a piece per request, shared by its title and its page. */
const piecePage = cache((piece: string, source: 'instagram' | 'facebook') => readIgPiecePage(piece, source))

const EVERY_POST: Metadata = {
  title: 'From our Instagram | EventLinqs',
  description: 'Every event from our latest Instagram posts, newest first. Tap one for its date, venue and where to book.',
  ...noIndexMetadata(),
}

export async function generateMetadata({ searchParams }: IgProps): Promise<Metadata> {
  const q = await searchParams
  const piece = pieceOf(q)
  if (!piece) return EVERY_POST
  let heading: string | null = null
  try {
    heading = (await piecePage(piece, igSource(first(q.utm_source)))).heading
  } catch {
    heading = null
  }
  return {
    title: `${heading ?? 'From our post'} | EventLinqs`,
    description: 'The events from this post, in date order. Tap one for its date, venue and where to book.',
    ...noIndexMetadata(),
  }
}

const CONTAINER = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
const SEE_MORE =
  'inline-flex min-h-12 items-center rounded-full border-2 border-ink-900 px-8 font-display text-base font-extrabold text-ink-900 transition-colors hover:bg-ink-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'

export default async function IgPage({ searchParams }: IgProps) {
  const q = await searchParams
  const piece = pieceOf(q)
  let items: IgItem[] = []
  let heading: string | null = null
  let unread = false
  try {
    if (piece) {
      const page = await piecePage(piece, igSource(first(q.utm_source)))
      items = page.items
      heading = page.heading
    } else {
      items = await everyPost()
    }
  } catch (err) {
    unread = true
    console.warn(piece ? '[ig] the piece could not be read' : '[ig] the Instagram posts could not be read', err instanceof Error ? err.message : String(err))
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader staticSafe />
      <main className={CONTAINER}>
        <section aria-labelledby="ig-heading" className="pb-16 pt-8 sm:pt-12">
          <h1 id="ig-heading" className="font-headline text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            {piece ? (heading ?? 'From our post') : 'From our Instagram'}
          </h1>
          <p className="mt-2 max-w-xl font-display text-base text-ink-600">
            {piece
              ? 'The events from this post, in date order. Tap one for its date, venue and where to book.'
              : 'Every event from our latest posts, newest first. Tap one for its date, venue and where to book.'}
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
                    ? piece
                      ? 'This post could not be loaded just now. Everything on is still one tap away.'
                      : 'Our latest posts could not be loaded just now. Everything on is still one tap away.'
                    : piece
                      ? 'Nothing from this post is still ahead right now. Everything on is one tap away.'
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
