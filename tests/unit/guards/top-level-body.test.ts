import { describe, it, expect } from 'vitest'
// A guard helper, plain JavaScript: the guards import it the same way.
import { topLevelBody } from '../../../scripts/lib/js-source.mjs'

/**
 * THE HELPER TWO GUARDS READ A FUNCTION'S BODY WITH, AND THE TWO WAYS IT WENT
 * BLIND IN ONE AFTERNOON.
 *
 * `scripts/guards/the-head-and-the-body-ask-once.mjs` and
 * `scripts/guards/a-refusal-keeps-its-door.mjs` both ask "does this function's
 * body mention X". Both got the answer wrong at first, in different ways, and
 * both said PASS in a full sentence while wrong:
 *
 *   1. Brace-matching from the first `{` after the declaration takes the
 *      DESTRUCTURED PARAMETER. `generateMetadata({ params }: Props)` has a body
 *      of `{ params }` under that rule, and the guard reported 20 routes judged
 *      and 0 faults on a tree with four real faults in it.
 *   2. Skipping the parameter list is not enough, because a RETURN TYPE can
 *      contain a brace too: `): Promise<{ refusal: ActionResult | null }> {`
 *      yields the type literal, so the helper carrying the refusal's door was
 *      not recognised as carrying it.
 *   3. And the line ending is not UNIX here. Searching for a literal
 *      newline-brace-newline never matched in a CRLF checkout, so every body
 *      came back as the whole rest of the file: the first guard went from 0
 *      faults to 9 and the second derived three door-carrying actions where
 *      there are two-and-a-half.
 *
 * Each case below is one of those three, in the exact shape that produced it.
 */
describe('topLevelBody reads a whole top-level declaration and stops at its end', () => {
  const NEXT = '\n'
  const CRLF = '\r\n'

  const twoDeclarations = (nl: string) =>
    [
      'export async function generateMetadata({ params }: Props): Promise<Metadata> {',
      '  const { slug } = await params',
      '  const event = await readEventForRoute(slug)',
      '  return { title: event.title }',
      '}',
      '',
      'export default async function Page({ params }: Props) {',
      '  const { slug } = await params',
      '  const event = await readEventForRoute(slug)',
      '  return <main>{event.title}</main>',
      '}',
      '',
    ].join(nl)

  it('does not stop at the destructured parameter, which is what made a guard blind', () => {
    const source = twoDeclarations(NEXT)
    const body = topLevelBody(source, source.indexOf('export async function generateMetadata'))
    expect(body).toContain('await readEventForRoute(slug)')
    expect(body.length).toBeGreaterThan('{ params }'.length)
  })

  it('stops at the END of the declaration and does not swallow the next one', () => {
    const source = twoDeclarations(NEXT)
    const body = topLevelBody(source, source.indexOf('export async function generateMetadata'))
    expect(body).not.toContain('export default async function Page')
  })

  it('does the same with CRLF, which is how every file in this worktree is checked out', () => {
    const source = twoDeclarations(CRLF)
    const body = topLevelBody(source, source.indexOf('export async function generateMetadata'))
    expect(body).toContain('await readEventForRoute(slug)')
    expect(body).not.toContain('export default async function Page')
  })

  it('is not fooled by a return type that contains a brace', () => {
    const source = [
      'async function refuseUnlessPublishable(',
      '  supabase: Client,',
      '  userId: string,',
      '): Promise<{ refusal: ActionResult | null; tiers: Tier[] }> {',
      '  if (!gate.ok) return { refusal: { error: gate.message, nextAction: gate.nextAction }, tiers }',
      '  return { refusal: null, tiers }',
      '}',
      '',
    ].join(CRLF)
    const body = topLevelBody(source, source.indexOf('async function refuseUnlessPublishable'))
    expect(body).toContain('nextAction')
  })

  it('answers with nothing when the declaration is not there, rather than with everything', () => {
    expect(topLevelBody('const a = 1\n', -1)).toBe('')
    expect(topLevelBody('const a = 1\n', undefined as unknown as number)).toBe('')
  })

  it('returns the rest of the file when a declaration is never closed in the first column', () => {
    // A truncated file is a real state on this machine: a long heredoc has cut
    // a script in half more than once. Returning what there is beats throwing.
    const source = 'export function half() {\n  return 1'
    expect(topLevelBody(source, 0)).toBe(source)
  })
})
