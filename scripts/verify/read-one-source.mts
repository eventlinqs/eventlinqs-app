/**
 * ONE SOURCE PAGE, READ POLITELY, READ ONLY (law 14 (k): robots.txt first, our agent named, one request a second per host,
 * a stop at the first 403 or 429). Saves the page's visible text to <out.txt> so a person or a window can see what the page
 * itself states. Writes nothing to any database.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/read-one-source.mts <page url> <out.txt>
 */
import { writeFileSync } from 'node:fs'
import type * as CollectModule from '@/lib/listings/collect'

const collectMod = (await import('@/lib/listings/collect')) as typeof CollectModule & { default?: typeof CollectModule }
const { COLLECTOR_AGENT, robotsVerdict } = collectMod.default ?? collectMod

const [pageUrl, out] = process.argv.slice(2)
if (!pageUrl || !out) throw new Error('usage: read-one-source.mts <page url> <out.txt>')
const u = new URL(pageUrl)
const get = async (url: string) => {
  const res = await fetch(url, { headers: { 'user-agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
  return { status: res.status, body: res.ok ? await res.text() : '' }
}
const robots = await get(`${u.origin}/robots.txt`)
if (robots.status === 403 || robots.status === 429) throw new Error(`STOPPED: robots.txt answered ${robots.status}`)
if (robotsVerdict(robots.status, robots.body, u.pathname + u.search) === 'disallowed') throw new Error('STOPPED: robots.txt disallows this page')
await new Promise((r) => setTimeout(r, 1000))
const page = await get(pageUrl)
if (page.status !== 200) throw new Error(`the page answered ${page.status}`)
const text = page.body
  .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<(br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
writeFileSync(out, `${pageUrl}\nread ${new Date().toISOString()} as ${COLLECTOR_AGENT}\n\n${text}`)
writeFileSync(out.replace(/\.txt$/, '.html'), page.body)
console.log(`[read-one-source] ${pageUrl}: HTTP ${page.status}, ${page.body.length} bytes, visible text in ${out}`)
