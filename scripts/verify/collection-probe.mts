/**
 * ITEM 19: what the collection run would make of a candidate source, before it is entered in the register. Read only:
 * robots.txt and the one page, with the run's own agent and rules; nothing is written anywhere.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/collection-probe.mts <https page> [<https page> ...]
 */
import type * as CollectModule from '@/lib/listings/collect'

const mod = (await import('@/lib/listings/collect')) as typeof CollectModule & { default?: typeof CollectModule }
const c: typeof CollectModule = mod.default ?? mod

for (const pageUrl of process.argv.slice(2)) {
  const page = new URL(pageUrl)
  const headers = { 'User-Agent': c.COLLECTOR_AGENT }
  let robotsStatus: number | null = null
  let robotsTxt = ''
  try {
    const r = await fetch(`${page.origin}/robots.txt`, { headers, signal: AbortSignal.timeout(15_000) })
    robotsStatus = r.status
    robotsTxt = r.ok ? await r.text() : ''
  } catch {
    robotsStatus = null
  }
  const verdict = c.robotsVerdict(robotsStatus, robotsTxt, page.pathname + page.search)
  if (verdict === 'disallowed') {
    console.log(`${pageUrl}\n  robots.txt ${robotsStatus ?? 'unreachable'}: disallowed, nothing read`)
    continue
  }
  const res = await fetch(pageUrl, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const html = res && res.ok ? await res.text() : ''
  const events = c.eventsFromHtml(html, pageUrl)
  console.log(`${pageUrl}\n  robots.txt ${robotsStatus}: allowed; page ${res?.status ?? 'unreachable'}; ${events.length} event(s) in its own Event data`)
  for (const e of events.slice(0, 3)) console.log(`    ${e.startsAt} ${e.title} @ ${e.venueName}; ${e.links.length} link(s)`)
}
