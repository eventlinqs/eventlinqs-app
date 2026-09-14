import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVENT_STATUSES,
  ARCHIVED_STATUS,
  PUBLIC_AFTER_THE_FACT_STATUSES,
  rendersAfterTheFact,
} from '@/lib/event-lifecycle'

/**
 * PAUSED, POSTPONED, CANCELLED AND COMPLETED ARE PUBLIC PAGES.
 *
 * ============================================================================
 * WHAT THIS IS PROTECTING, AND HOW IT WAS FOUND
 * ============================================================================
 *
 * `docs/EVENT-LIFECYCLE.md` is the AUTHORITY and its state table says, in five
 * rows:
 *
 *   published  full page
 *   paused     full page, ticketing suspended banner
 *   postponed  full page, postponed banner
 *   cancelled  full page, cancelled banner
 *   completed  full page, past banner
 *
 * Four of those five answered a real 404 to every visitor, and had since the
 * row-level security policies were written: they admit `status = 'published'`
 * and nothing else, so the anonymous read the page makes found no row and the
 * route's existence guard called `notFound()`.
 *
 * IT WAS FOUND BY DRIVING A BROWSER AT A COMPLETED EVENT, under close-out SEO5
 * step 5, which asks for "a deliberate past event state on the event page,
 * since neither has ever been observed". It had never been observed because it
 * could not be. The page's banner code for all four states had been in the tree
 * for months and had never run for a stranger.
 *
 * These tests exist so that cannot come back quietly. The rendered proof is
 * `scripts/verify/seo5-states-drive.mjs`, which loads a completed lane-C event
 * at 390, 768 and 1440 and asserts the ended banner is on the page.
 */

const MODULE = join(process.cwd(), 'src', 'lib', 'events', 'after-the-fact-view.ts')

describe('the four after-the-fact statuses', () => {
  it('are exactly the ones the lifecycle document calls a full page with a banner', () => {
    expect([...PUBLIC_AFTER_THE_FACT_STATUSES]).toEqual([
      'paused',
      'postponed',
      'cancelled',
      'completed',
    ])
  })

  it('never include archived, whose page is per viewer and lives elsewhere', () => {
    // An archived event answers 404 to a stranger and 200 to a ticket holder.
    // That decision needs a session and belongs to archived-view.ts. Letting it
    // in here would publish every archived event to everybody.
    expect([...PUBLIC_AFTER_THE_FACT_STATUSES]).not.toContain(ARCHIVED_STATUS)
    expect(rendersAfterTheFact(ARCHIVED_STATUS)).toBe(false)
  })

  it('never include a status that was never published', () => {
    expect(rendersAfterTheFact('draft')).toBe(false)
    expect(rendersAfterTheFact('scheduled')).toBe(false)
  })

  it('do not include published, which the ordinary anonymous read already serves', () => {
    expect(rendersAfterTheFact('published')).toBe(false)
  })

  it('account for every status the database enum carries, one way or the other', () => {
    // A new status added to the enum must be classified deliberately rather than
    // defaulting into a 404 nobody decided on. This fails on the day one is
    // added, which is the day the decision is cheapest.
    const classified = new Set<string>([
      ...PUBLIC_AFTER_THE_FACT_STATUSES,
      'published',
      'draft',
      'scheduled',
      ARCHIVED_STATUS,
    ])
    for (const status of EVENT_STATUSES) expect(classified.has(status)).toBe(true)
    expect(classified.size).toBe(EVENT_STATUSES.length)
  })
})

describe('the door is narrow, and its source says so', () => {
  const source = readFileSync(MODULE, 'utf8')

  it('constrains status in the query itself, not only in a comment', () => {
    expect(source).toContain(".in('status', [...PUBLIC_AFTER_THE_FACT_STATUSES])")
  })

  it('constrains visibility in the query itself, so a private event never leaks', () => {
    expect(source).toContain(".in('visibility', [...PUBLIC_VISIBILITIES])")
    expect(source).toContain("const PUBLIC_VISIBILITIES = ['public', 'unlisted'] as const")
  })

  it('reads events and nothing else', () => {
    // The holder path needs orders and tickets to answer "is this you". This
    // path has no such question, so touching either would be a new capability
    // nobody asked for on a service-role client.
    const tables = Array.from(source.matchAll(/\.from\('([a-z_]+)'\)/g)).map(m => m[1])
    expect(new Set(tables)).toEqual(new Set(['events']))
  })

  it('takes no session, so the answer stays the same for everyone and cacheable', () => {
    expect(source).not.toContain('cookies(')
    expect(source).not.toContain('getUser(')
  })

  it('throws on a failed read rather than folding it into "no such event"', () => {
    // A dropped socket answering 404 is the class recorded four times over in
    // src/lib/supabase/read-or-throw.ts.
    expect(source).toContain('readOrThrow')
  })
})

describe('both doors are actually wired, which is where the last one failed', () => {
  it('the route existence guard consults it before answering 404', () => {
    // The archived path records the exact failure this prevents: the first drive
    // of it found the page's own holder branch never ran, because the layout had
    // already said 404 above it.
    const layout = readFileSync(
      join(process.cwd(), 'src', 'app', 'events', '[slug]', 'layout.tsx'),
      'utf8',
    )
    expect(layout).toContain('afterTheFactEventExists(slug)')
    // `lastIndexOf`, because the FIRST `notFound` in the file is the import and
    // the first version of this assertion compared against that and failed.
    expect(layout.indexOf('afterTheFactEventExists(slug)')).toBeLessThan(
      layout.lastIndexOf('notFound()'),
    )
  })

  it('the page reads the row through it when the anonymous read finds nothing', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'events', '[slug]', 'page.tsx'),
      'utf8',
    )
    expect(page).toContain('fetchAfterTheFactEvent<FullEvent>(slug, EVENT_PAGE_SELECT)')
  })
})
