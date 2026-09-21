import { describe, expect, it } from 'vitest'
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

/**
 * A LINK THAT IS ALREADY IN SOMEBODY'S INBOX MAY NOT BE CALLED INVALID BECAUSE A
 * SOCKET DROPPED.
 *
 * Three pages a person reaches by following a link out of their own email. Each
 * one looks a token up, each one discarded that read's error until 21 September
 * 2026, and each one therefore answered a blink with a sentence about the link:
 *
 *     "This link is not valid ... It may have already been used."
 *     "This invite is not valid ... It may have already been claimed."
 *
 * THE FIRST IS A STATUTORY REMEDY. The Spam Act unsubscribe facility has to
 * work. A dropped socket told the reader theirs had already been spent, so they
 * stop pressing it, the mail keeps arriving, and the one control they had over
 * it has been declared used. Nothing on the platform notices, because the page
 * answered 200.
 *
 * THE SECOND IS THE SAME SHAPE AND ITS OWN HEADER CONVICTS IT. Nine lines above
 * the read, the file says these links are already sitting in people's inboxes
 * and every one of them has to keep working.
 *
 * THE THIRD IS SINGLE-USE, which is what makes a false answer expensive. The
 * performer is sent back to the organiser for a fresh link and the organiser
 * cannot mint one, because the first was never claimed.
 *
 * WHAT THESE TESTS DECIDE. A Next.js page's body cannot be called from here, so
 * what is decided is the judgement (does any read on these pages publish a
 * failure as an absence) and the propagation (is there anything between the door
 * and the reader that would swallow the throw). Both go through the guard's own
 * matchers rather than a grep for `readOrThrow`, so they are about the rule and
 * not a spelling. The pages themselves are driven in a browser at 390, 768 and
 * 1440, in both directions, by
 * scripts/verify/a-live-link-is-not-invalid-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')

/** The three token doors, named once. */
const DOORS_IN_AN_INBOX = [
  'src/app/unsubscribe/[token]/page.tsx',
  'src/app/waitlist/unsubscribe/[token]/page.tsx',
  'src/app/artists/claim/[token]/page.tsx',
]

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

type Binding = { name: string; handled: boolean; line: number }
type Destructure = { handled: boolean; line: number }

describe('the three token doors publish no failure as an absence', () => {
  it.each(DOORS_IN_AN_INBOX)('%s binds no response whose error goes unread', (rel) => {
    const found = (wholeResultBindings(read(rel), DOORS) as Binding[]).filter((b) => !b.handled)
    expect(found).toEqual([])
  })

  it.each(DOORS_IN_AN_INBOX)('%s destructures no response without binding its error', (rel) => {
    const found = (awaitedDestructures(read(rel)) as Destructure[]).filter((d) => !d.handled)
    expect(found).toEqual([])
  })

  /*
   * NOT VACUOUS. Each page must still look its token up for the two assertions
   * above to mean anything: a page that reads nothing passes them perfectly.
   */
  it.each(DOORS_IN_AN_INBOX)('%s still looks its token up through a door', (rel) => {
    const source = read(rel)
    expect(source).toMatch(/\.from\(/)
    const doored = (DOORS as string[]).reduce(
      (total: number, door: string) =>
        total + [...source.matchAll(new RegExp(`\\b${door}\\s*[(<]`, 'g'))].length,
      0,
    )
    expect(doored).toBeGreaterThan(0)
  })

  /*
   * THE SENTENCE THE DEFECT WAS HIDING BEHIND IS STILL THERE, AND STILL REACHED.
   * A careless version of this fix deletes the not-valid branch along with the
   * bug, and then a token that really has been used lands on an error page
   * instead of an explanation. The branch is the answer to a genuinely absent
   * row and it has to survive.
   */
  /*
   * THE HEADING, NOT THE STRING. `toContain('This link is not valid')` passed on
   * the COMMENT above the read, which quotes the sentence to explain the defect,
   * so deleting the rendered heading would not have failed it. A red proof
   * caught that the same morning it was written. These match the JSX.
   */
  it('the organiser unsubscribe still explains a token that genuinely matches nothing', () => {
    const source = read('src/app/unsubscribe/[token]/page.tsx')
    expect(source).toMatch(/>\s*This link is not valid\s*<\/h1>/)
    expect(source).toMatch(/const valid = !!data/)
  })

  it('the waitlist unsubscribe still explains a token that genuinely matches nothing', () => {
    const source = read('src/app/waitlist/unsubscribe/[token]/page.tsx')
    expect(source).toMatch(/const valid = !!data/)
  })

  it('the performer claim still explains an invite that genuinely matches nothing', () => {
    const source = read('src/app/artists/claim/[token]/page.tsx')
    expect(source).toMatch(/This invite is not valid\s*<\/h1>/)
    expect(source).toMatch(/\{!tag \?/)
  })

  /*
   * THE ONE THING THAT WOULD SILENTLY NEUTRALISE ALL OF IT. `readOrThrow` only
   * helps while the throw reaches the reader. A page that wraps its own lookup
   * in a try/catch and falls through to the not-valid branch puts the defect
   * back with every assertion above still green. Checked by balancing braces, so
   * a try/catch elsewhere in the same file is not mistaken for this one.
   */
  it.each(DOORS_IN_AN_INBOX)('%s does not catch the throw it is meant to receive', (rel) => {
    const source = read(rel)
    const swallowed: number[] = []
    for (const m of source.matchAll(/\breadOrThrow\s*\(/g)) {
      for (const t of source.matchAll(/\btry\s*\{/g)) {
        if (t.index! > m.index!) break
        const open = source.indexOf('{', t.index!)
        const close = skipBalanced(source, open, '{', '}') as number
        if (open < m.index! && close > m.index!) swallowed.push(m.index!)
      }
    }
    expect(swallowed, `${rel}: the lookup is inside a try block`).toEqual([])
  })
})

type ScopeEntry = [string, string, string?]

describe('the guard scope covers the three token doors', () => {
  const entries = SCOPE as ScopeEntry[]

  it('names all three directories', () => {
    expect(entries.map((e) => e[0])).toEqual(
      expect.arrayContaining(['src/app/unsubscribe', 'src/app/waitlist', 'src/app/artists']),
    )
  })

  /*
   * THE SENTENCE IS THE POINT OF THE LIST. A directory earns its place by what
   * its failures SAY, and an entry whose sentence stops naming a person is one
   * nobody will weigh against the cost of the rule.
   */
  it.each(['src/app/unsubscribe', 'src/app/waitlist', 'src/app/artists'])(
    '%s says what a failed read becomes there, in terms of the person reading it',
    (dir) => {
      const entry = entries.find((e) => e[0] === dir)
      expect(entry, `${dir} is not in SCOPE`).toBeTruthy()
      const becomes = (entry as ScopeEntry)[1]
      expect(becomes.length).toBeGreaterThan(60)
      expect(becomes).toMatch(/link|invite/)
    },
  )
})
