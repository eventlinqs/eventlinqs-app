import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'

/**
 * Existence guard for /events/[slug].
 *
 * Why a layout and not just the page: the page renders inside the
 * `events/[slug]/loading.tsx` Suspense boundary. A `loading.tsx` streams its
 * fallback - committing the HTTP 200 - the moment the page suspends on its
 * data fetch, so a page-level `notFound()` thrown AFTER that fetch can only
 * render the not-found UI inline (a soft-404 / HTTP 200), not set a real 404.
 * (Routes with no loading boundary, e.g. /organisers/[handle], 404 correctly.)
 *
 * The layout renders OUTSIDE the page's loading Suspense, so resolving the
 * slug's existence here and calling `notFound()` before `children` mount sets
 * a real 404 for unknown slugs - while the page keeps its designed loading
 * skeleton for the (confirmed-to-exist) event's own render. Uses the same
 * cookie-free anon client + slug the page's fetchEvent uses, so visibility is
 * identical (a row the page would notFound on is a row this guard rejects).
 */
export default async function EventSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) notFound()

  return children
}
