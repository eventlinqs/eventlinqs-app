import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { getSiteUrl } from '@/lib/site-url'
import { readWhatsOnEdition } from '@/lib/newsletter/edition'
import { buildWhatsOn } from '@/lib/newsletter/whats-on'
import { planWebCopy, webCopyEmptyHtml } from '@/lib/newsletter/web-copy'

/**
 * GET /newsletter/<edition>/<city>/<date>, THE EDITION'S WEB COPY ('View in browser'; the PM's order of 21 November
 * 2026, about 03:30). The same builder and readers the send uses, as of that day's 07:00 send, read only, never indexed.
 * It names no reader: its unsubscribe and manage links open /newsletter/city, which asks for nothing a link did not
 * carry. The answer is the same for everyone, so the edge may keep it ten minutes.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ edition: string; city: string; date: string }> }

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const origin = getSiteUrl()
  const plan = planWebCopy(await params, new Date())
  if (plan.kind === 'not_found') {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } })
  }
  const empty = (reason: Parameters<typeof webCopyEmptyHtml>[0]['reason'], status: number, cache: string) =>
    new Response(webCopyEmptyHtml({ origin, cityName: plan.city.name, citySlug: plan.city.slug, edition: plan.edition, reason }), {
      status,
      headers: { ...HTML_HEADERS, 'Cache-Control': cache },
    })
  if (plan.kind === 'empty') return empty(plan.reason, 200, 'public, s-maxage=300')
  // No service-role key on this host (a CI build): nothing is read, and the page says so rather than inventing one.
  if (!getSupabaseServiceRoleKey()) return empty('unreadable', 503, 'no-store')
  try {
    const { edition } = await readWhatsOnEdition(createAdminClient(), {
      citySlug: plan.city.slug,
      cityName: plan.city.name,
      edition: plan.edition,
      now: plan.sendAt,
      origin,
      unsubscribeUrl: `${origin}/newsletter/city`,
    })
    const { html } = buildWhatsOn({ ...edition, webUrl: null })
    return new Response(html, { status: 200, headers: { ...HTML_HEADERS, 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
  } catch (error) {
    console.error('[newsletter-web-copy] the edition could not be read:', error instanceof Error ? error.message : error)
    return empty('unreadable', 503, 'no-store')
  }
}
