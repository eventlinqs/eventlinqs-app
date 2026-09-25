/**
 * WHO A ROUTE IS FOR, AND WHY THE OBVIOUS ANSWER WAS THE WRONG ONE.
 *
 * ============================================================================
 * THE SPLIT THIS HAS TO MAKE
 * ============================================================================
 *
 * The bundle budget has to treat a buyer's event page differently from an
 * organiser's seat-map builder. One is the platform's shop window, opened on a
 * phone at a venue on whatever signal is going; the other is a desk tool behind
 * a login, opened once, on a laptop, and used for an hour.
 *
 * ============================================================================
 * THE FIRST ANSWER WAS THE INDEXING POLICY, AND IT WAS WRONG. MEASURED.
 * ============================================================================
 *
 * This repository already holds one split of the whole route table:
 * `INDEXING_POLICY` in src/lib/seo/indexing-policy.ts (close-out SEO3), which
 * classifies 132 of the 133 routes this build emits. Reusing it was the first
 * design, on the reasoning that `never` means "do not index" and the do-not-
 * index set is the logged-in half.
 *
 * It is not. Run against the build of 15 September 2026, `never` contains:
 *
 *     /checkout/[reservation_id]        the buyer paying
 *     /orders/[order_id]/confirmation   the buyer's ticket
 *     /queue/[slug]                     the buyer waiting for an onsale
 *     /t/[code]                         the short link every share resolves to
 *     /tickets, /account/tickets        the buyer's own tickets
 *     /scan/[eventId]                   the door, on a phone, at the venue
 *
 * Every one of those is a buyer on a phone, and `/checkout` is the exact page
 * close-out C8B.5 spent an item proving must survive a bad radio. A budget that
 * exempted them would have missed the pages it exists for. SEO reach and
 * network exposure are different questions and the answer to one is not the
 * answer to the other.
 *
 * ============================================================================
 * THE RULE, AND THE CROSS-CHECK THAT STOPS IT DRIFTING
 * ============================================================================
 *
 * INTERNAL is `/dashboard/*` and `/admin/*`: the two consoles this platform
 * puts behind a staff or organiser login. Everything else is PUBLIC, including
 * every noindex buyer page above.
 *
 * A prefix rule on its own would be a second list in disguise, so it is
 * CROSS-CHECKED against the policy on every run: every route this calls
 * INTERNAL must be classified `never`. If a dashboard page is ever made
 * indexable, or a public route is moved under /dashboard, the two readings
 * disagree and the guard says so instead of quietly re-classifying a page out
 * of its budget. Measured on this build: 59 internal routes, all 59 `never`.
 *
 * An UNCLASSIFIED route (the policy knows 132 of 133; `/_not-found` is Next's
 * own fallback) is treated as PUBLIC. The safe direction for an unknown is the
 * strict one: a new page that slips past the policy is judged against the Scope
 * budget rather than escaping it.
 */

import { spawnSync } from 'node:child_process'

/** The two consoles behind a login. Anything else is reachable by a buyer. */
export const INTERNAL_PREFIXES = ['/dashboard', '/admin']

/** The indexing classes that mean a page is meant to be found. */
export const PUBLIC_CLASSES = ['always', 'conditional', 'alias']

/** PUBLIC or INTERNAL, from the route alone. */
export function audienceOf(route) {
  return INTERNAL_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`)) ? 'internal' : 'public'
}

/**
 * The indexing class per route, obtained by running the real policy module.
 *
 * The policy is TypeScript under src/, so it is reached the way every other
 * guard reaches src: a child node carrying scripts/lib/src-alias-loader.mjs.
 * Parsing the TypeScript textually would be a second implementation of the
 * policy and would disagree with it the first time the file's shape changed.
 */
export function classifyRoutes(routes, root = process.cwd()) {
  const script = `
    import { classifyRoute } from '@/lib/seo/indexing-policy'
    const routes = ${JSON.stringify(routes)}
    const out = {}
    for (const r of routes) out[r] = classifyRoute(r) ?? null
    console.log(JSON.stringify(out))
  `
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(
      'could not read the indexing policy through the alias loader: ' +
        `${(r.stderr || r.stdout).trim().slice(0, 500)}`,
    )
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the indexing policy printed no payload: ${r.stdout.slice(0, 300)}`)
  return JSON.parse(line)
}

/**
 * Routes this module calls INTERNAL that the indexing policy does not call
 * `never`. Empty is the only acceptable answer; anything else means the two
 * readings have drifted and one of them is now wrong.
 */
export function audienceDisagreements(routes, classes) {
  return routes
    .filter((r) => audienceOf(r) === 'internal' && classes[r] !== 'never')
    .map((r) => `${r} is under a console prefix but the indexing policy calls it ${classes[r] ?? 'unclassified'}`)
}
