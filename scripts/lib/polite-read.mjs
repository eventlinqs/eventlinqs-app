/**
 * THE POLITE READ, FOR A PLAIN NODE SCRIPT (law 14 (k) of C:\dev\CLAUDE.md: "every read of an event source page, by any
 * window for any purpose, goes through the page reader's polite fetch: robots.txt first, one request a second per host,
 * a stop at the first 403 or 429, a named user agent").
 *
 * WHY A PORT. The platform's own reader lives in TypeScript (src/lib/listings/collect.ts: COLLECTOR_AGENT and
 * robotsVerdict, which .mts scripts import under tsx). A plain .mjs script cannot import it, and
 * scripts/ops/outreach-basis.mjs read organisers' own pages four at a time with no robots.txt and no spacing (found
 * 11 November 2026, PM order 3; it predates the law). So the same decisions are carried here word for word, and
 * tests/unit/ops/polite-read.test.ts runs both on the same robots files and paths and fails on any difference: one
 * spine, held by a test rather than by hope.
 */

export const COLLECTOR_PRODUCT = 'EventLinqs'
export const COLLECTOR_AGENT = 'EventLinqs/1.0 (+https://www.eventlinqs.com.au)'

/** The rules for our token, or the "*" group's when no group names us (RFC 9309 2.2.1). Ported from collect.ts. */
export function robotsRules(txt, product = COLLECTOR_PRODUCT) {
  const groups = []
  let current = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false
      if (!current) continue
      if (value === '') continue
      current.rules.push({ allow: key === 'allow', pattern: value })
    } else {
      lastWasAgent = false
    }
  }
  const ours = groups.filter((g) => g.agents.includes(product.toLowerCase()))
  const chosen = ours.length > 0 ? ours : groups.filter((g) => g.agents.includes('*'))
  return chosen.flatMap((g) => g.rules)
}

function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path)
}

/** The longest matching pattern wins; an equal allow beats a disallow (RFC 9309 2.2.2). Ported from collect.ts. */
export function robotsAllows(rules, path) {
  let best = null
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r
  }
  return best === null || best.allow
}

/** robots.txt's own status decides first: 2xx parsed, 4xx other than 429 allowed, anything else disallowed. Ported. */
export function robotsVerdict(status, txt, path) {
  if (status !== null && status >= 200 && status < 300) return robotsAllows(robotsRules(txt), path) ? 'allowed' : 'disallowed'
  if (status !== null && status >= 400 && status < 500 && status !== 429) return 'allowed'
  return 'disallowed'
}

/**
 * A reader that keeps the law for every page it is handed: robots.txt read once per host before its first page, one
 * request a second per host (robots.txt included), a host stopped for the rest of the run at its first 403 or 429,
 * redirects followed by hand so each new host's robots.txt is read too, and the collector's named agent. Calls are
 * served one at a time, so two callers can never reach one host inside a second. Returns { url, html, type } or null,
 * saying why through `log` whenever a page is not read.
 */
export function politeReader({ agent = COLLECTOR_AGENT, gapMs = 1000, timeoutMs = 15000, maxRedirects = 5, fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), log = (line) => console.warn(line) } = {}) {
  const robots = new Map()
  const last = new Map()
  const stopped = new Set()
  let queue = Promise.resolve()

  async function spaced(host) {
    const wait = gapMs - (now() - (last.get(host) ?? -Infinity))
    if (wait > 0) await sleep(wait)
    last.set(host, now())
  }

  async function raw(url) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const r = await fetchImpl(url, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': agent } })
      const ok = r.status >= 200 && r.status < 300
      // The limit covers the body as well as the headers (a site once sent headers and stalled for half an hour).
      const body = ok ? await r.text() : ''
      return { status: r.status, location: r.headers.get('location'), type: r.headers.get('content-type') ?? '', body }
    } finally {
      clearTimeout(timer)
    }
  }

  async function mayRead(u) {
    if (!robots.has(u.host)) {
      await spaced(u.host)
      let answer
      try {
        answer = await raw(`${u.origin}/robots.txt`)
      } catch {
        answer = { status: null, body: '' }
      }
      robots.set(u.host, answer)
      if (answer.status === 403 || answer.status === 429) stopped.add(u.host)
    }
    const r = robots.get(u.host)
    return robotsVerdict(r.status, r.body, u.pathname + u.search) === 'allowed'
  }

  async function readOne(url) {
    let current = url
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let u
      try {
        u = new URL(current)
      } catch {
        log(`  ${current} not read: not an address`)
        return null
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
      if (stopped.has(u.host)) {
        log(`  ${current} not read: ${u.host} refused an earlier read, so this run reads it no more`)
        return null
      }
      if (!(await mayRead(u))) {
        log(`  ${current} not read: ${u.host}'s robots.txt does not allow it`)
        return null
      }
      if (stopped.has(u.host)) {
        log(`  ${current} not read: ${u.host} refused its robots.txt read`)
        return null
      }
      await spaced(u.host)
      let r
      try {
        r = await raw(current)
      } catch (error) {
        log(`  ${current} could not be read: ${error?.cause?.code ?? error?.name ?? error}`)
        return null
      }
      if (r.status === 403 || r.status === 429) {
        stopped.add(u.host)
        log(`  ${current} answered ${r.status}: ${u.host} is read no more this run`)
        return null
      }
      if (r.status >= 300 && r.status < 400 && r.location) {
        current = new URL(r.location, current).toString()
        continue
      }
      if (r.status < 200 || r.status >= 300) return null
      return { url: current, html: r.body, type: r.type }
    }
    log(`  ${url} not read: it redirects too many times`)
    return null
  }

  return function read(url) {
    const next = queue.then(() => readOne(url))
    queue = next.catch(() => undefined)
    return next
  }
}
