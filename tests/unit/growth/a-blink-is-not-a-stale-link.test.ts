import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  wholeResultBindings,
  skipBalanced,
} from '../../../scripts/guards/lib/whole-result-bindings.mjs'
import {
  SCOPE,
  DOORS,
  awaitedDestructures,
} from '../../../scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs'
import { fakeConsentAdmin } from '../../helpers/consent-ledger-fake'

/**
 * A STALE CODE AND A BLINKED READ ARE DIFFERENT FACTS AND MAY NOT SHARE ONE
 * ANSWER.
 *
 * Nine reads across six files on the tracked-link, consent and campaigner
 * spine discarded their error until 21 September 2026. Each of the six already
 * held a correct, deliberate fallback for a row that is genuinely absent, and
 * each of those fallbacks quietly doubled as the answer to a dropped socket.
 *
 * THE ONE THAT NAMES THE GROUP is the printed poster. `/s/[code]` is what the
 * QR code on an organiser's poster resolves to, and its own comment says a link
 * whose event has been DELETED degrades to the browse page rather than a dead
 * end. That is right. But the read deciding it answered `data: null` for a
 * dropped socket too, so a buyer standing in front of the poster was sent to a
 * generic browse page, concluded the poster was wrong, and the organiser lost
 * the sale and was never told, because at HTTP 302 nothing failed.
 *
 * THE OTHER EIGHT, in descending order of what they cost:
 *
 *   the digest consent CITY       a consent filed against NO city when the
 *                                 person chose one, into an append-only ledger
 *                                 that is evidence under the Spam Act and, by
 *                                 this platform's own rule, is never removed,
 *                                 so it can be neither corrected nor widened
 *   the carried consent RESERVATION  "no such reservation" said about a
 *                                 reservation that exists, and the answer the
 *                                 person had just given dropped with it
 *   the resolver's event          a tracked link resolving to nothing
 *   the resolver's artist         an artist losing the credit for a sale
 *   the short link's artist       the same credit, on the other path
 *   the Launch Kit event          an organiser told their own event is gone
 *   the share-link API event      404 event_not_found about a live event, to
 *                                 the attendee who was trying to share it
 *   the campaign CHANNEL table    a send's reach counted against an empty
 *                                 channel code, on the screen where a person
 *                                 approves who gets written to
 *
 * WHAT THESE TESTS DECIDE, AND HOW. Two of them are driven for real, through
 * the module's own code, against a fake whose reads can FAIL: the poster case
 * and the consent case, which are the two that cost the most. The rest are
 * judged by the guard's own matchers rather than by grepping for `readOrThrow`,
 * so they are about the rule and not about a spelling. The surfaces themselves
 * are driven in a browser at 390, 768 and 1440 by
 * scripts/verify/a-blink-is-not-a-stale-link-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')

/** The six files this item fixed, named once. */
const SPINE = [
  'src/app/s/[code]/route.ts',
  'src/lib/broadcast/resolve-short-link.ts',
  'src/lib/broadcast/kit-artefacts.ts',
  'src/app/api/broadcast/share-link/route.ts',
  'src/app/admin/(authed)/campaigns/page.tsx',
  'src/app/actions/consent.ts',
  'src/app/actions/discovery-consent.ts',
]

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

type Binding = { name: string; handled: boolean; line: number }
type Destructure = { handled: boolean; line: number }

/** A transient fault: `withBuildRetry` retries these before giving up. */
const TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' }

// ---------------------------------------------------------------------------
// The poster, driven.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  admin: { current: null as unknown },
  link: {
    current: null as unknown,
  },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin.current }))
vi.mock('@/lib/broadcast/share-links', () => ({
  resolveShareLink: async () => h.link.current,
  recordShareLinkEvent: async () => undefined,
  visitorHash: () => 'hash',
}))
vi.mock('@/lib/broadcast/share-codes', () => ({ isValidShareCode: () => true }))
vi.mock('@/lib/broadcast/short-links', () => ({ isValidReadableCode: () => true }))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => true }))
vi.mock('@/lib/broadcast/crawler', () => ({ isPreviewCrawler: () => false }))

const EVENT = { id: 'event-1', slug: 'lane-b-blinklink-night', external_ticket_url: null }
const ARTIST = { id: 'artist-1', slug: 'lane-b-blinklink-artist' }

describe('the tracked link, when the read behind it blinks', () => {
  beforeEach(() => {
    h.link.current = {
      id: 'link-1',
      code: 'abcd1234',
      event_id: EVENT.id,
      artist_id: null,
      destination_url: null,
    }
  })

  it('resolves to the event when every read works, which is the baseline the rest is measured against', async () => {
    h.admin.current = fakeConsentAdmin({ events: [EVENT], artists: [ARTIST] }).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).resolves.toMatchObject({
      kind: 'event',
      slug: EVENT.slug,
    })
  })

  /*
   * THE DEFECT ITSELF. Before the fix this resolved to `null`, which the route
   * above turns into the browse-page redirect written for a DELETED event.
   */
  it('RAISES rather than answering as though the event had been deleted', async () => {
    h.admin.current = fakeConsentAdmin(
      { events: [EVENT], artists: [ARTIST] },
      { failing: { events: TIMEOUT } },
    ).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).rejects.toThrow(/could not read/)
  })

  it('still answers null for a link whose event row is genuinely gone, which is a different fact', async () => {
    h.admin.current = fakeConsentAdmin({ events: [], artists: [] }).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).resolves.toBeNull()
  })

  /*
   * THE QUIETER HALF. The artist read decided nothing but attribution, so a
   * blink cost an artist the credit for a sale they drove and said nothing.
   */
  it('RAISES rather than dropping the artist a link was tagged with', async () => {
    h.link.current = {
      id: 'link-1',
      code: 'abcd1234',
      event_id: EVENT.id,
      artist_id: ARTIST.id,
      destination_url: null,
    }
    h.admin.current = fakeConsentAdmin(
      { events: [EVENT], artists: [ARTIST] },
      { failing: { artists: TIMEOUT } },
    ).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).rejects.toThrow(/could not read/)
  })

  it('still carries the artist through when every read works, so the test above is not vacuous', async () => {
    h.link.current = {
      id: 'link-1',
      code: 'abcd1234',
      event_id: EVENT.id,
      artist_id: ARTIST.id,
      destination_url: null,
    }
    h.admin.current = fakeConsentAdmin({ events: [EVENT], artists: [ARTIST] }).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).resolves.toMatchObject({
      artistSlug: ARTIST.slug,
    })
  })

  /*
   * NOT REACHED AT ALL. An externally hosted link never touches the database,
   * so a failing events table must not change its answer. This pins that the
   * door was put on the read rather than on the function.
   */
  it('answers an external link without reading the database, even while every read is failing', async () => {
    h.link.current = {
      id: 'link-2',
      code: 'abcd1234',
      event_id: null,
      artist_id: null,
      destination_url: 'https://example.com/tickets',
    }
    h.admin.current = fakeConsentAdmin({ events: [] }, { failing: { events: TIMEOUT } }).client
    const { resolveShortCode } = await import('@/lib/broadcast/resolve-short-link')
    await expect(resolveShortCode('abcd1234')).resolves.toMatchObject({ kind: 'external' })
  })
})

// ---------------------------------------------------------------------------
// The judgement, across the whole spine.
// ---------------------------------------------------------------------------

describe('the tracked-link, consent and campaigner spine publishes no failure as an absence', () => {
  it.each(SPINE)('%s binds no response whose error goes unread', (rel) => {
    const found = (wholeResultBindings(read(rel), DOORS) as Binding[]).filter((b) => !b.handled)
    expect(found).toEqual([])
  })

  it.each(SPINE)('%s destructures no response without binding its error', (rel) => {
    const found = (awaitedDestructures(read(rel)) as Destructure[]).filter((d) => !d.handled)
    expect(found).toEqual([])
  })

  /*
   * NOT VACUOUS. Every file must still CONTAIN reads for the two assertions
   * above to mean anything: a file with no reads at all passes them perfectly.
   */
  it.each(SPINE)('%s still reads the database through a door, so the two above are not vacuous', (rel) => {
    const source = read(rel)
    const doored = (DOORS as string[]).reduce(
      (total: number, door: string) =>
        total + [...source.matchAll(new RegExp(`\\b${door}\\s*[(<]`, 'g'))].length,
      0,
    )
    expect(doored).toBeGreaterThan(0)
  })

  /*
   * THE FALLBACK THE DEFECT WAS HIDING BEHIND IS STILL THERE. A careless
   * version of this fix deletes the browse-page degrade along with the bug and
   * turns a deleted event into a 500, which is the opposite mistake.
   */
  it('the short link still degrades a genuinely deleted event to the browse page', () => {
    const source = read('src/app/s/[code]/route.ts')
    expect(source).toMatch(/NextResponse\.redirect\(new URL\('\/events', origin\), 302\)/)
    expect(source).toMatch(/if \(!event\?\.slug\) return fallback/)
  })

  /*
   * THE CONSENT ACTION REFUSES THE SAVE rather than narrowing it. A throw from
   * the city read has to become a failed result, because this action's caller
   * is a form and an unhandled throw there is a blank screen rather than an
   * answer a person can act on.
   */
  /*
   * THE ONE THING THAT WOULD SILENTLY NEUTRALISE ALL OF IT.
   *
   * `readOrThrow` only helps while the throw reaches somebody. A caller that
   * wraps the call in a try/catch and falls back to its null path puts the
   * defect straight back, in a file this item never touched, and every
   * assertion above would still pass. Both resolvers already answer `null` for
   * a row that is genuinely absent, so a caller has no honest reason to catch
   * here: the absence case is a return value, not an exception.
   *
   * Checked by balancing braces rather than by looking for the word `try`
   * nearby, because a try/catch somewhere ELSE in a long route file is fine and
   * a guard that cannot tell the difference is one somebody switches off.
   */
  const CALLERS: [string, string][] = [
    ['src/app/e/[code]/page.tsx', 'resolveShortCode'],
    ['src/app/s/[code]/route.ts', 'readOrThrow'],
    ['src/lib/events/generated-cover.ts', 'loadArtefactContext'],
    ['src/app/api/organiser/events/[id]/card/[format]/route.ts', 'loadArtefactContext'],
    ['src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx', 'loadArtefactContext'],
  ]

  it.each(CALLERS)('%s does not catch the throw it is meant to receive (%s)', (rel, call) => {
    const source = read(rel)
    const swallowed: number[] = []
    for (const m of source.matchAll(new RegExp(`\\b${call}\\s*\\(`, 'g'))) {
      // Every `try {` that opens before this call: does its block cover it?
      for (const t of source.matchAll(/\btry\s*\{/g)) {
        if (t.index! > m.index!) break
        const open = source.indexOf('{', t.index!)
        const close = skipBalanced(source, open, '{', '}') as number
        if (open < m.index! && close > m.index!) swallowed.push(m.index!)
      }
    }
    expect(swallowed, `${rel}: ${call} is inside a try block`).toEqual([])
  })

  it('names callers that actually call, so the test above is not vacuous', () => {
    for (const [rel, call] of CALLERS) {
      expect(read(rel), `${rel} no longer calls ${call}`).toContain(call + '(')
    }
  })

  it('the digest consent action turns a failed city read into a refusal to save, and says so out loud', () => {
    const source = read('src/app/actions/consent.ts')
    expect(source).toMatch(
      /catch \(error\) \{[\s\S]{0,200}?captureException\(error[\s\S]{0,200}?return \{ ok: false, error: 'Could not save' \}/,
    )
  })
})

// ---------------------------------------------------------------------------
// The guard's new shape: a scope entry may name one file, and must say why.
// ---------------------------------------------------------------------------

type ScopeEntry = [string, string, string?]

describe('the guard scope, now that an entry may be a single file', () => {
  const entries = SCOPE as ScopeEntry[]

  it('carries every directory this item put in it', () => {
    const paths = entries.map((e) => e[0])
    expect(paths).toEqual(
      expect.arrayContaining([
        'src/app/s',
        'src/lib/broadcast',
        'src/app/api/broadcast',
        'src/app/admin',
      ]),
    )
  })

  it('names the two consent actions as files rather than scoping their directory', () => {
    const paths = entries.map((e) => e[0])
    expect(paths).toEqual(
      expect.arrayContaining([
        'src/app/actions/consent.ts',
        'src/app/actions/discovery-consent.ts',
      ]),
    )
    expect(paths).not.toContain('src/app/actions')
  })

  /*
   * THE INVARIANT THE GUARD ENFORCES AT RUN TIME, PINNED HERE TOO. A file entry
   * covers that file and nothing beside it, which is a real narrowing, so it
   * has to state what the directory around it holds that keeps it out. A
   * directory entry carrying such a reason is the same rule read backwards.
   */
  it('gives every file entry a reason for being a file, and no directory entry one', () => {
    for (const [path, , insteadOfTheDirectory] of entries) {
      const isFile = /\.(ts|tsx)$/.test(path)
      if (isFile) {
        expect(insteadOfTheDirectory, `${path} is a file and must say why`).toBeTruthy()
        expect((insteadOfTheDirectory as string).length).toBeGreaterThan(20)
      } else {
        expect(insteadOfTheDirectory, `${path} is a directory and must not`).toBeUndefined()
      }
    }
  })

  it('gives every entry a sentence saying what a failed read becomes there', () => {
    for (const [path, becomes] of entries) {
      expect(typeof becomes, path).toBe('string')
      expect(becomes.length, path).toBeGreaterThan(30)
    }
  })
})
