import Link from 'next/link'
import { formatPlatformDate } from '@/lib/dates/event-time'

/**
 * THE PAID FEATURED ROW (Train C, row 12): listings an organiser has paid to feature this week, on the homepage or a
 * city page, every card labelled Featured and the row headed so, never mixed into the unpaid rails. Renders nothing
 * when no slot is running.
 */
export interface FeaturedRowItem {
  readonly orderId: string
  readonly slug: string
  readonly title: string
  readonly startDate: string
}

export function FeaturedRow({ items, where }: { readonly items: readonly FeaturedRowItem[]; readonly where: string }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Featured listings" data-featured-row={where} className="border-t border-ink-200 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="font-headline text-xl font-bold tracking-tight text-ink-900">Featured</h2>
        <p className="mt-1 text-sm text-ink-600">Organisers pay to feature these listings.</p>
        <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => (
            <li key={f.orderId} data-featured={f.slug} className="rounded-2xl border border-ink-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-600">Featured</p>
              <Link href={`/events/${f.slug}`} prefetch={false} className="mt-2 block font-headline text-base font-bold text-ink-900 hover:underline">
                {f.title}
              </Link>
              <p className="mt-1 text-sm text-ink-600">{formatPlatformDate(f.startDate)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
