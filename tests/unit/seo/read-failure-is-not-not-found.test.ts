import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isTransientPoolError } from '@/lib/supabase/build-retry'

/**
 * A PAGE MAY NEVER ANSWER "THIS DOES NOT EXIST" BECAUSE IT COULD NOT ASK.
 * Close-out UX6, 10 September 2026. Third occurrence of one class.
 *
 * The gate's indexing drive reported `/organisers/kit-presents-029298` in the
 * sitemap and answering 404. The organisation is real and active with a
 * published event still to come, and the same URL answers 200 on the next
 * request. The server log carries the cause twice on the one request, once for
 * the metadata and once for the render:
 *
 *     TypeError: fetch failed
 *     Caused by: SocketError: other side closed (UND_ERR_SOCKET)
 *
 * A stale pooled socket. The read did not come back empty, it did not come back
 * at all, and the page turned that into `notFound()`. To a crawler following our
 * own sitemap that is not "try again later", it is "delete this from the index",
 * and the SEO engine the growth plan runs on is made of these pages.
 *
 * It is the third occurrence because the same file's own header records the
 * first ("a discarded error ... turned a permission problem into a silent 404 on
 * every organiser profile") and the fix then was to make the error VISIBLE. It
 * still answered 404. Making an error visible and making it honest are different
 * jobs.
 *
 * These tests hold the distinction where it is now made, and hold that the
 * shared retry primitive still recognises the socket class that caused it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the shared retry primitive recognises a dropped socket', () => {
  it('matches the exact shape the gate caught', () => {
    expect(
      isTransientPoolError({
        message: 'TypeError: fetch failed',
        details: 'Caused by: SocketError: other side closed (UND_ERR_SOCKET)',
      }),
    ).toBe(true)
  })

  it('matches a reset and a timeout, which are the same story', () => {
    expect(isTransientPoolError({ message: 'ECONNRESET' })).toBe(true)
    expect(isTransientPoolError({ message: 'ETIMEDOUT' })).toBe(true)
  })

  it('does NOT match a real query fault, so a genuine error is never retried away', () => {
    expect(isTransientPoolError({ code: '42501', message: 'permission denied for table organisations' })).toBe(false)
    expect(isTransientPoolError({ code: 'PGRST116', message: 'no rows returned' })).toBe(false)
    expect(isTransientPoolError(null)).toBe(false)
  })
})

describe('the organiser profile separates "not there" from "could not ask"', () => {
  const source = read('src/app/organisers/[handle]/page.tsx')

  it('retries the read through the shared primitive rather than a new one', () => {
    expect(source).toContain("from '@/lib/supabase/build-retry'")
    // both reads: the status gate and the public-column read
    expect(source.match(/withBuildRetry\(/g) ?? []).toHaveLength(2)
  })

  it('throws when a read fails, so the answer is a 500 and not a 404', () => {
    expect(source).toContain('class OrganiserReadFailed')
    expect(source.match(/throw new OrganiserReadFailed\(/g) ?? []).toHaveLength(2)
  })

  it('still answers 404 for an organisation that is genuinely absent or inactive', () => {
    // The truth is still the truth: no row, or not active, returns null and the
    // caller 404s. The fix must not have turned every miss into a 500.
    expect(source).toContain("if (!row || row.status !== 'active') return null")
    expect(source).toContain('if (!organisation) notFound()')
  })
})

describe('the squad payment page makes the same distinction', () => {
  const source = read('src/app/squad/[token]/pay/[member_id]/page.tsx')

  it('no longer folds a read error into notFound', () => {
    expect(source).not.toContain('if (error || !member) notFound()')
  })

  it('treats PGRST116, and only PGRST116, as "there is no such member"', () => {
    expect(source).toContain("error.code !== 'PGRST116'")
    expect(source).toContain('if (!member) notFound()')
  })
})

/**
 * THE EVENT ROUTE, 12 September 2026, the FOURTH occurrence of the class. The
 * pre-push gate's checkout drive opened a published, public, paid event at 768
 * and the route answered 404, once, between a 200 at 390 and a 200 at 1440; the
 * re-run passed with 0 faults; the server log carried no failed read; the row
 * is published and public and the select policies carry no time clause. The
 * read that decided the answer was the LAYOUT's existence guard, and it
 * discarded its error (`const { data } = await ...maybeSingle()`), so a dropped
 * socket left `data` null exactly as an empty table would, nothing was logged,
 * and a real event was declared not to exist. The page's own fetchEvent had the
 * older shape one layer down: it logged the error and returned null for the
 * caller to 404 on.
 *
 * The fix is now ONE DOOR rather than a paragraph per route:
 * src/lib/supabase/read-or-throw.ts. Every read below decides a 404 and every
 * one goes through it, so the fifth occurrence has nowhere to happen; the guard
 * scripts/guards/read-failure-is-not-not-found.mjs fails the build if a
 * decisive read is ever destructured with its error discarded, folded or
 * merely logged again.
 */
const DOOR = "from '@/lib/supabase/read-or-throw'"
const usesTheDoor = (source: string, times: number) => {
  expect(source).toContain(DOOR)
  expect(source.match(/readOrThrow\(/g) ?? [], `expected ${times} readOrThrow call(s)`).toHaveLength(times)
}

describe('the one door: readOrThrow', () => {
  const source = read('src/lib/supabase/read-or-throw.ts')

  it('retries through the shared primitive rather than a new one', () => {
    expect(source).toContain("from './build-retry'")
    expect(source).toContain('withBuildRetry(')
  })

  it('answers null for PGRST116 only, and throws a named error for everything else', () => {
    expect(source).toContain("export const NO_ROW_CODE = 'PGRST116'")
    expect(source).toContain('if (isNoRowError(error)) return null')
    expect(source).toContain('throw new ReadFailed(label, error)')
    expect(source).toContain('answering 500 rather than 404')
  })
})

describe('the event route separates "not there" from "could not ask"', () => {
  const resolver = read('src/lib/events/event-detail-read.ts')
  const layout = read('src/app/events/[slug]/layout.tsx')
  const page = read('src/app/events/[slug]/page.tsx')

  /*
   * THE READ MOVED OUT OF src/app ON 21 SEPTEMBER 2026, AND THE GUARD CANNOT
   * FOLLOW IT. Close-out C8 collapsed this route's three reads of one row into
   * one shared resolver in src/lib, memoised per request. Both call sites still
   * 404 on null exactly as before, but the read that DECIDES now lives outside
   * `scripts/guards/read-failure-is-not-not-found.mjs`, which judges src/app
   * alone and says so in its own header: "A helper in src/lib that folds a read
   * into null for a caller in src/app to 404 on is invisible here ... the ones
   * found on 12 September were fixed by hand and are pinned by
   * tests/unit/seo/read-failure-is-not-not-found.test.ts".
   *
   * This is that pin, and it is stated here rather than left implied, because a
   * change that quietly moves code out of a guard's field of view is how
   * coverage is lost without anything going red.
   */
  it('the resolver, which is where existence is now decided, reads through the door', () => {
    usesTheDoor(resolver, 1)
    expect(resolver).not.toMatch(/const \{ data \} = await supabase/)
    // The four branches, in the order docs/EVENT-LIFECYCLE.md gives them.
    expect(resolver).toContain('fetchFixtureEvent(slug)')
    expect(resolver).toContain('fetchArchivedEventForHolder<FullEvent>(slug, EVENT_PAGE_SELECT)')
    expect(resolver).toContain('fetchAfterTheFactEvent<FullEvent>(slug, EVENT_PAGE_SELECT)')
  })

  it('the resolver says in the log when a slug genuinely has no public row', () => {
    expect(resolver).toContain('[event-detail] no public row for')
  })

  it('the layout, which decides existence before the page renders, 404s only on a real absence', () => {
    // The property, not the spelling: a row that exists renders the page, and a
    // read that FAILED throws inside the resolver rather than returning null.
    expect(layout).toContain('await readEventForRoute(slug)')
    expect(layout).toMatch(/if \(!event\) notFound\(\)/)
    expect(layout).not.toMatch(/const \{ data \} = await supabase/)
  })

  it('the page reads the same memoised answer and no longer folds a read error into null', () => {
    expect(page).toContain('await readEventForRoute(slug)')
    expect(page).not.toContain("console.error('[event-detail] fetchEvent failed:', error)")
    expect(page).toContain('if (!event) notFound()')
  })
})

describe('the archived-event second look throws when it cannot ask', () => {
  const source = read('src/lib/events/archived-view.ts')

  it('every read on the holder path goes through the door, the two counts included', () => {
    usesTheDoor(source, 4)
    expect(source).not.toContain("console.error('[archived-view] could not look up'")
    expect(source).not.toContain('could not read archived event')
  })
})

describe('the buyer surfaces read through the door', () => {
  it('the checkout: the reservation and the event', () => {
    const source = read('src/app/checkout/[reservation_id]/page.tsx')
    usesTheDoor(source, 2)
    expect(source).not.toContain('if (resError || !reservation)')
  })

  it('the order confirmation: the order and the event', () => {
    const source = read('src/app/orders/[order_id]/confirmation/page.tsx')
    usesTheDoor(source, 2)
  })

  it('the bearer ticket at the door', () => {
    const source = read('src/app/t/[code]/page.tsx')
    usesTheDoor(source, 1)
    expect(source).toContain('if (!ticket || ticket.secret !== secret) notFound()')
  })

  it('the queue', () => {
    usesTheDoor(read('src/app/queue/[slug]/page.tsx'), 1)
  })

  it('the door scan: the event and the three authorisation reads', () => {
    usesTheDoor(read('src/app/scan/[eventId]/page.tsx'), 4)
  })
})

describe('the helpers one layer down, which the guard cannot follow, read through the door', () => {
  it('resolveEventAccess: the event, the owner and the member', () => {
    const source = read('src/lib/organisations/event-access.ts')
    usesTheDoor(source, 3)
  })

  /**
   * Three, not two, since 20 September 2026. The first two are
   * getOrganiserEvent's: the event, then the organisation, both of which decide
   * a notFound().
   *
   * The third is the attendee list's own resolution of the event's
   * organisation, which decides the MARKETING CONSENT lookup rather than a 404,
   * and it belongs here for the same reason as the others. It discarded its
   * error, and a failure there does not produce an error page: the consent
   * index comes back empty, `isEmailConsented` defaults everybody to false, and
   * the organiser's export tells them that not one of their attendees may
   * lawfully be emailed. A wrong consent answer is worse than no page.
   */
  it('attendees.ts: the event, the organisation, and the consent lookup', () => {
    usesTheDoor(read('src/lib/reporting/attendees.ts'), 3)
  })

  it('fetchGigById', () => {
    usesTheDoor(read('src/lib/marketplace/gigs.ts'), 1)
  })
})
