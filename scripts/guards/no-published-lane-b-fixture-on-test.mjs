/**
 * NO LANE B FIXTURE IS LEFT PUBLISHED ON THE SHARED TEST DATABASE.
 *
 * THE THIRD LOCK, AND THE ONLY ONE THAT ASKS THE WORLD.
 *
 *   scripts/guards/fixtures-are-not-published.mjs   reads the drives and refuses
 *                                                   the two literals. A claim
 *                                                   about SOURCE.
 *   the per-drive checks in each drive              ask the database before the
 *                                                   drive starts and after it
 *                                                   tears down. A claim about
 *                                                   THAT RUN.
 *   this                                            asks the database about the
 *                                                   STATE, whoever left it and
 *                                                   whenever.
 *
 * WHY THE THIRD ONE IS NOT REDUNDANT, and the evidence is two days old. On
 * 13 September 2026 a GA5 run left `lane-b-ga5-event-202609131728` on TEST:
 * published, public, with an organisation, four confirmed orders, a tier and
 * three campaigns behind it. GA5 reported `teardown.left-as-found` on every run
 * after that, because the only thing it counted was campaign rows. It was in the
 * sitemap for two days at three URLs, and on 14 September a fixture of exactly
 * that shape refused lane A's push:
 *
 *     [indexing-drive] FAIL: RULE 2: /organisers/lane-b-pl1-org-202609141153
 *                            is in the sitemap and answered 404
 *
 * Neither of the first two locks would have caught it. The source was already
 * being changed; the run had long since ended. A leftover is a STATE, and only a
 * question put to the database finds one.
 *
 * WHAT IT ASKS, and it is the sitemap's own question: is any row whose slug
 * begins `lane-b-` currently published by src/app/sitemap.ts. An organisation is
 * published when `status = 'active'`; an event when it matches
 * PUBLIC_EVENT_MATCH, and a published event also publishes a `/venues/<handle>`
 * derived from its `venue_name`.
 *
 * WHY ONLY `lane-b-`. Lane A and lane C have fixtures of the same shape, and the
 * same hazard, and the eighteen scripts that build them are listed in
 * REVIEW-QUEUE-B.md for their owners. Judging them here would mean lane B
 * deciding which of another lane's fixtures are legitimate, on a machine where
 * all three are mid-flight. A guard that fires on somebody else's work without
 * their agreement is a guard they switch off.
 *
 * THE ONE EXCEPTION, and it is a real one rather than a convenience.
 * `lane-b-fo1-` fixtures are PERSISTENT BY DESIGN: fo1-founding-offer-drive tops
 * the tree up to two sellable lane B organisations and REUSES them rather than
 * churning them, and fo1-founding-purchase-drive keeps its rows because they
 * carry the orders that are its evidence. Nothing about them ever disappears, so
 * nothing about them ever 404s, which is the entire hazard. They also cannot be
 * anything other than published: the sale gate refuses an organisation that is
 * not active.
 *
 * SKIPS BY NAME where there is no database, exactly as schema-ahead-of-code
 * does, because CI's typecheck build carries placeholder values by design.
 */
import { existsSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[no-published-lane-b-fixture-on-test]'

/*
 * PREFIXES THAT MAY BE PUBLISHED, each with the reason it is not a hazard.
 * Printed on every run, and a prefix that matches nothing is reported, so this
 * cannot rot into an unexamined allowlist.
 */
const PERSISTENT = [
  {
    prefix: 'lane-b-fo1-',
    why: 'FO1 tops the tree up to two SELLABLE lane B organisations and reuses them; they are never deleted, so they never 404, and the sale gate refuses an organisation that is not active',
  },
]

/**
 * THE DECISION, SEPARATED FROM THE FETCH, so it can be driven in both
 * directions in milliseconds.
 *
 * The DRILL below proves the wiring by removing the exemption and watching the
 * guard name the rows it was exempting. What a drill against the real database
 * CANNOT prove without committing the very hazard this guard exists to stop is
 * that a genuinely new published leftover is caught: doing that means creating
 * a published organiser page on a database three lanes share, which is the
 * incident. tests/unit/guards/no-published-lane-b-fixture-on-test.test.ts does
 * it over synthetic rows instead, which costs nothing and risks nobody.
 *
 * @param {{slug: string}[]} organisations active lane-b organisations
 * @param {{slug: string, venue_name?: string|null}[]} events published public lane-b events
 * @param {{prefix: string, why: string}[]} persistent the prefixes allowed to be published
 * @returns {{published: string[], matched: Set<string>}}
 */
export function judgeRows(organisations, events, persistent) {
  const exemptionFor = (slug) => persistent.find((p) => slug.startsWith(p.prefix)) ?? null
  const published = []
  const matched = new Set()
  for (const o of organisations) {
    const allowed = exemptionFor(o.slug)
    if (allowed) {
      matched.add(allowed.prefix)
      continue
    }
    published.push(`/organisers/${o.slug}`)
  }
  for (const e of events) {
    const allowed = exemptionFor(e.slug)
    if (allowed) {
      matched.add(allowed.prefix)
      continue
    }
    published.push(`/events/${e.slug}`)
    /* The sitemap derives a venue handle from venue_name on every public event. */
    const handle = String(e.venue_name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (handle) published.push(`/venues/${handle}`)
  }
  return { published, matched }
}

/*
 * WRAPPED IN main() RATHER THAN RUN AT THE TOP LEVEL, and the reason is worth
 * a line: the unit test IMPORTS judgeRows from this file, and a module whose
 * body calls process.exit takes the test runner down with it on import. The
 * first version did exactly that and vitest reported the file as collecting no
 * tests, which is the shape the test-count canary exists to catch.
 */
async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
    for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/
  if (url && !REAL_PROJECT.test(url)) {
    console.log(`${TAG} SKIP: NEXT_PUBLIC_SUPABASE_URL is not a real Supabase project URL (${url.length} characters),`)
    console.log(`${TAG}       so there is no database to ask. This is the CI typecheck build, which uses placeholders by design.`)
    process.exit(0)
  }
  if (!url || !key) {
    console.log(`${TAG} SKIP: no database to ask (NEXT_PUBLIC_SUPABASE_URL and a key are both required).`)
    console.log(`${TAG}       Run it with: node --env-file=.env.local scripts/guards/no-published-lane-b-fixture-on-test.mjs`)
    process.exit(0)
  }

  /*
   * PRODUCTION IS NOT ASKED. Fixture prefixes are a TEST convention, a production
   * row named `lane-b-` would be a different and much worse problem than this
   * guard is for, and a guard that reads production to decide a build is a guard
   * that can be broken by somebody else's data.
   */
  if (!/vkapkibzokmfaxqogypq/.test(url)) {
    console.log(`${TAG} SKIP: this asks TEST vkapkibzokmfaxqogypq only, and the environment names another project.`)
    process.exit(0)
  }

  async function rows(path) {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      console.error(`${TAG} FAIL: ${path} answered ${res.status}. A guard that cannot look does not pass.`)
      process.exit(1)
    }
    return res.json()
  }

  const organisations = await rows('organisations?slug=like.lane-b-*&status=eq.active&select=slug')
  const events = await rows('events?slug=like.lane-b-*&status=eq.published&visibility=eq.public&select=slug,venue_name')
  const { published, matched } = judgeRows(organisations, events, PERSISTENT)

  console.log(`${TAG} prefixes allowed to be published (${PERSISTENT.length}), printed every run on purpose:`)
  for (const p of PERSISTENT) {
    const stale = matched.has(p.prefix) ? '' : '  STALE: nothing on TEST matches it now'
    console.log(`${TAG}   ${p.prefix}: ${p.why}${stale}`)
  }

  declareWork('no-published-lane-b-fixture-on-test', {
    did: { 'lane B organisation read': organisations.length, 'lane B event read': events.length },
    found: { 'lane B fixture the sitemap publishes': published.length },
    zeroIsFine: {
      'lane B organisation read': 'a tree with no lane B fixtures on TEST is the clean state, not a failure to look',
      'lane B event read': 'the same',
    },
  })

  if (published.length > 0) {
    console.error(`${TAG} lane B fixture(s) are PUBLISHED on the database three lanes share:`)
    for (const p of [...new Set(published)].sort()) console.error(`${TAG}   ${p}`)
    console.error(`${TAG} Every one of them is advertised in the sitemap and answers 404 the moment the row goes,`)
    console.error(`${TAG} which is what refused lane A's push at step 13 of 16 on 14 September 2026.`)
    console.error(`${TAG} Remove them with the sweep, which keeps money records and archives what it may not delete:`)
    console.error(`${TAG}   node --env-file=.env.local scripts/ops/sweep-lane-b-fixture-leftovers.mjs --prefix lane-b-<item>- --apply`)
    process.exit(1)
  }

  console.log(`${TAG} PASS: ${organisations.length} lane B organisation(s) and ${events.length} lane B event(s) on TEST, none published outside the allowed prefixes`)
}

if (process.argv[1] && process.argv[1].endsWith('no-published-lane-b-fixture-on-test.mjs')) await main()
