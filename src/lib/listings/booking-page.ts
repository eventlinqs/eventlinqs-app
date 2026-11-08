import 'server-only'
import { COLLECTOR_AGENT, robotsVerdict } from './collect'
import { readBookingFacts } from './booking-facts'
import type { PageReading } from './self-listing'

/**
 * ONE READ OF AN ORGANISER'S OWN BOOKING PAGE, POLITELY (C:\dev\CLAUDE.md law 14 (k): robots.txt first, our named agent,
 * a stop at the first 403 or 429, never more than one request a second to a host). The self-listing checks read the page
 * the organiser gave us, once, when they send their event. A page that cannot be read is reported with its reason, so
 * the submission is held and said why, never published unchecked.
 *
 * The address comes from a public form, so the reader never goes where the public internet does not: no address
 * written as a number, no local or internal name, at most three redirects each judged the same way, and never more
 * than 3MB read.
 */

const TIMEOUT_MS = 12_000
const MAX_BYTES = 3_000_000
const MAX_REDIRECTS = 3

/** Whether a host is one the reader may visit: a public name, never an address written as numbers. Pure. */
export function publicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === '' || h === 'localhost' || !h.includes('.')) return false
  if (/^\[.*\]$/.test(h) || /^[0-9.]+$/.test(h) || h.includes(':')) return false
  if (/\.(local|localhost|internal|intranet|lan|home|corp|test|invalid|arpa)$/.test(h)) return false
  return true
}

async function bodyOf(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES))
}

async function get(start: string): Promise<{ status: number; body: string; refused?: string }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !publicHost(u.hostname)) return { status: 0, body: '', refused: 'it leads off the public web' }
    const res = await fetch(url, {
      headers: { 'user-agent': COLLECTOR_AGENT, accept: 'text/html,application/xhtml+xml,text/plain' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (next) {
      await res.body?.cancel().catch(() => undefined)
      url = new URL(next, url).toString()
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined)
      return { status: res.status, body: '' }
    }
    return { status: res.status, body: await bodyOf(res) }
  }
  return { status: 0, body: '', refused: 'it redirects too many times' }
}

export async function readBookingPage(pageUrl: string): Promise<PageReading> {
  let u: URL
  try {
    u = new URL(pageUrl)
  } catch {
    return { ok: false, reason: 'the address is not a web page' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'the address is not an https page' }
  if (!publicHost(u.hostname)) return { ok: false, reason: 'the address is not a public web page' }
  try {
    const robots = await get(`${u.origin}/robots.txt`)
    if (robots.refused) return { ok: false, reason: `its robots.txt ${robots.refused}` }
    if (robots.status === 403 || robots.status === 429) return { ok: false, reason: `its site refused our reader (robots.txt answered ${robots.status})` }
    if (robotsVerdict(robots.status, robots.body, u.pathname + u.search) === 'disallowed') return { ok: false, reason: "its site's robots.txt does not let readers in" }
    await new Promise((r) => setTimeout(r, 1000))
    const page = await get(pageUrl)
    if (page.refused) return { ok: false, reason: `the page ${page.refused}` }
    if (page.status !== 200) return { ok: false, reason: `the page answered ${page.status}` }
    return { ok: true, facts: readBookingFacts(page.body) }
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === 'TimeoutError' ? 'the page did not answer in time' : 'the page could not be reached' }
  }
}
