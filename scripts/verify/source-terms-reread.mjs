/**
 * THE ELEVEN SOURCES' TERMS READ AGAIN TODAY (the project manager's ruling of 29 October 2026, 16:28 (1): before the
 * register goes to production, "WINDOW 3 re-reads each of the eleven sources' terms TODAY ... and writes the date and
 * quote it read; a source whose terms changed or cannot be read goes in as 'ask', never 'read'").
 *
 *   node scripts/verify/source-terms-reread.mjs <register.json> <out dir>
 *
 * <register.json> is the eleven rows as TEST holds them (listing_sources, read by the caller). Public GETs only, one
 * per page, naming EventLinqs; no database is touched. For a source collected as 'read' (a publisher's own calendar
 * feed) it reads the page that offers the feed, the feed itself and robots.txt; for an 'ask' source, its terms page.
 * Each is judged against what the register recorded on 28 October, and the verdict is READ ONLY where every part of the
 * offer is still there today; anything changed, missing or unreadable is ASK. Writes reread.json and pages/ (each page
 * as read, for the record).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [registerFile, out] = process.argv.slice(2)
if (!registerFile || !out) {
  console.error('usage: node scripts/verify/source-terms-reread.mjs <register.json> <out dir>')
  process.exit(2)
}
const UA = 'EventLinqs-terms-check/1.0 (+https://www.eventlinqs.com.au; reading terms once, by hand-run script)'
const sources = JSON.parse(readFileSync(registerFile, 'utf8'))
mkdirSync(join(out, 'pages'), { recursive: true })
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date())

const decode = (s) => s.replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&quot;/g, '"')
const flat = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const slug = (u) => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 90)

async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(30000) })
    const body = await res.text()
    writeFileSync(join(out, 'pages', `${slug(url)}.txt`), body)
    return { url, status: res.status, type: res.headers.get('content-type') ?? '', body }
  } catch (error) {
    return { url, status: null, type: '', body: '', error: error.message }
  }
}

/** Whether robots.txt lets "*" fetch the path (the longest matching Allow or Disallow wins). */
function robotsAllow(robots, path) {
  let inStar = false
  let best = { len: -1, allow: true }
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line)
    if (!m) continue
    const [, key, value] = m
    if (/user-agent/i.test(key)) {
      inStar = value.trim() === '*'
      continue
    }
    if (!inStar || value === '') continue
    if (path.startsWith(value) && value.length > best.len) best = { len: value.length, allow: /allow/i.test(key) && !/disallow/i.test(key) }
  }
  return best.allow
}

const results = []
for (const s of sources) {
  const r = { name: s.name, recorded: s.collection, readOn: today, checks: [], quote: null, verdict: 'ask' }
  if (s.collection === 'read') {
    const feedUrl = s.page_url
    const offerUrl = s.terms_url
    const offer = await get(offerUrl)
    const origin = new URL(feedUrl).origin
    const robots = await get(`${origin}/robots.txt`)
    const feed = await get(feedUrl)
    const linkTag = /<link[^>]+type="text\/calendar"[^>]*>/i.exec(offer.body)?.[0] ?? null
    const feedOffered = linkTag !== null
      ? decode(linkTag).includes(new URL(feedUrl).pathname) || decode(linkTag).includes(feedUrl)
      : /showICAL\s*:\s*true/.test(offer.body)
    const isCalendar = feed.status === 200 && /^\s*BEGIN:VCALENDAR/.test(feed.body)
    const robotsOk = robots.status === 404 || (robots.status === 200 && robotsAllow(robots.body, new URL(feedUrl).pathname))
    r.checks.push({ what: 'the publisher still offers its calendar feed on its events page', url: offerUrl, status: offer.status, ok: offer.status === 200 && feedOffered, saw: linkTag ? decode(linkTag) : feedOffered ? `the events platform's own settings on the page: '${/showRSS\s*:\s*\w+/.exec(offer.body)?.[0] ?? 'showRSS absent'}', 'showICAL: true' (they draw its RSS and Add to Calendar buttons; the feed URL is built by its script, read 28 October from the rendered page)` : 'no calendar offer found' })
    r.checks.push({ what: 'the feed answers as a calendar', url: feedUrl, status: feed.status, ok: isCalendar, saw: `${feed.type}; ${feed.body.slice(0, 40).replace(/\s+/g, ' ')}; ${(feed.body.match(/BEGIN:VEVENT/g) ?? []).length} event(s)` })
    r.checks.push({ what: 'robots.txt lets a general agent read the feed path', url: robots.url, status: robots.status, ok: robotsOk, saw: robots.status === 404 ? 'no robots.txt' : robotsOk ? 'allowed' : 'disallowed' })
    r.quote = linkTag ? decode(linkTag) : r.checks[0].saw
    r.verdict = r.checks.every((c) => c.ok) ? 'read' : 'ask'
  } else if (s.terms_url) {
    const terms = await get(s.terms_url)
    /* The longest quoted sentence the register recorded (a page title quoted beside it is not the clause). */
    const recorded = [...(s.terms_quote ?? '').matchAll(/"([^"]{20,})"/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0] ?? null
    const text = flat(terms.body)
    const stillSays = recorded === null ? null : text.includes(flat(recorded).replace(/ \.\.\. /g, ' ').split(' ... ')[0].slice(0, 60))
    r.checks.push({ what: 'the terms page read today', url: s.terms_url, status: terms.status, ok: terms.status === 200, saw: recorded === null ? 'no reuse clause was recorded; read again for any' : stillSays ? 'the recorded words are still there' : 'the recorded words were NOT found' })
    const reuse = /([^.]{0,160}\b(reproduc|commercial|copyright|reuse|re-use|permission)\b[^.]{0,200}\.)/i.exec(text)?.[1]?.trim() ?? null
    r.quote = recorded && stillSays ? recorded : reuse ?? (terms.status === 200 ? 'none found on the page' : `could not be read (HTTP ${terms.status ?? terms.error})`)
    r.verdict = 'ask'
  } else {
    const page = await get(s.page_url)
    r.checks.push({ what: 'its What’s On page read today (no terms page is recorded)', url: s.page_url, status: page.status, ok: page.status === 200, saw: page.status === 200 ? 'answered' : `HTTP ${page.status ?? page.error}` })
    const termsLink = /href="([^"]*(terms|conditions|copyright|disclaimer)[^"]*)"/i.exec(page.body)?.[1] ?? null
    r.quote = termsLink ? `a terms link on the page: ${termsLink}` : page.status === 200 ? 'no terms link found on the page' : `could not be read (HTTP ${page.status ?? page.error})`
    r.verdict = 'ask'
  }
  results.push(r)
  console.log(`${r.verdict.toUpperCase().padEnd(4)} ${s.name} (recorded ${s.collection}): ${r.checks.map((c) => `${c.ok ? 'ok' : 'NO'} ${c.status ?? 'none'}`).join(', ')}`)
}
writeFileSync(join(out, 'reread.json'), JSON.stringify(results, null, 2))
const changed = results.filter((r) => r.recorded === 'read' && r.verdict !== 'read')
console.log(`\n${today}: ${results.filter((r) => r.verdict === 'read').length} read, ${results.filter((r) => r.verdict === 'ask').length} ask; ${changed.length} recorded 'read' now 'ask'${changed.length ? `: ${changed.map((r) => r.name).join(', ')}` : ''}`)
