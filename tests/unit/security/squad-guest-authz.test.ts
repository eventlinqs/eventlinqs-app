/**
 * IDOR-02 proof: a guest squad membership may only be acted on by someone holding
 * the squad share token.
 *
 * THE DEFECT. Both squad-checkout actions gated with:
 *
 *   if (member.user_id && member.user_id !== user?.id) return Unauthorised
 *
 * and a comment claiming "OR guest (user_id null) with email match". No email match
 * was ever performed. For a GUEST row, `user_id IS NULL`, so the condition
 * short-circuited and the check passed for ANY caller, including an anonymous one.
 *
 * The page at /squad/[token]/pay/[member_id] does verify the share token. That did
 * not help: a server action is its own public HTTP endpoint, so a check in the page
 * does not gate the action. The form even received `squadToken` as a prop and never
 * passed it on.
 *
 * WHY THE CONSENT ACTION IS THE WORSE HALF. On the payment action an attacker who
 * knows a member id can create an order and a PaymentIntent for someone else's
 * squad spot, which mostly means volunteering to pay for their ticket. On
 * recordSquadMemberMarketingConsent the same gap fabricates a CONSENT RECORD
 * attributing a marketing opt-in to an email address that never opted in. That is
 * precisely what the Spam Act compliance work exists to prevent.
 *
 * Exploitability, stated honestly rather than inflated: `squad_members.id` is a
 * UUID and not guessable. It is reachable by another member of the same squad (the
 * squad_members policy admits the leader and members) or from a leaked pay URL. So
 * this is a real authorisation gap with a consent-integrity impact, not a bulk data
 * breach.
 *
 * This tests the pure gate exhaustively, which covers the guest case that cannot be
 * reached through the UI at all, and then asserts both actions actually call it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assertSquadAccess, type SquadAccessRow } from '@/app/actions/squad-checkout'

const ROOT = path.resolve(__dirname, '../../..')
const SRC = readFileSync(path.join(ROOT, 'src/app/actions/squad-checkout.ts'), 'utf8')
/**
 * Source with comments stripped.
 *
 * Needed because the fix documents itself by quoting the dangerous old condition,
 * and a naive source match then fails on the documentation rather than the code.
 * Same lesson as tests/unit/security/pii-egress.test.ts.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ')

const guest = (token: string | null = 'right-token'): SquadAccessRow => ({
  user_id: null,
  squad: { share_token: token },
})
const claimed = (owner: string, token = 'right-token'): SquadAccessRow => ({
  user_id: owner,
  squad: { share_token: token },
})

describe('guest membership: the share token is the credential', () => {
  it('REFUSES an anonymous caller with no token', () => {
    // The exact hole: before the fix this returned true.
    expect(assertSquadAccess(guest(), undefined, undefined)).toBe(false)
  })

  it('REFUSES a wrong token', () => {
    expect(assertSquadAccess(guest(), undefined, 'wrong-token')).toBe(false)
  })

  it('REFUSES an empty token', () => {
    expect(assertSquadAccess(guest(), undefined, '')).toBe(false)
  })

  it('REFUSES when the squad has no share token at all, rather than matching null to null', () => {
    expect(assertSquadAccess(guest(null), undefined, 'anything')).toBe(false)
  })

  it('ALLOWS the correct token', () => {
    expect(assertSquadAccess(guest(), undefined, 'right-token')).toBe(true)
  })

  it('REFUSES a signed-in stranger who does not hold the token', () => {
    expect(assertSquadAccess(guest(), 'some-other-user', undefined)).toBe(false)
  })
})

describe('claimed membership: only its owner, and never the token alone', () => {
  it('ALLOWS the owning user', () => {
    expect(assertSquadAccess(claimed('member-1'), 'member-1', 'right-token')).toBe(true)
  })

  it('REFUSES a different signed-in user even WITH the correct token', () => {
    // A squad share token is handed to everyone invited, so it must never be
    // enough to act on a membership somebody has already claimed.
    expect(assertSquadAccess(claimed('member-1'), 'member-2', 'right-token')).toBe(false)
  })

  it('REFUSES an anonymous caller holding the correct token', () => {
    expect(assertSquadAccess(claimed('member-1'), undefined, 'right-token')).toBe(false)
  })
})

describe('the embedded-row shape PostgREST actually returns is handled', () => {
  it('accepts the array form of an embedded squad', () => {
    // PostgREST returns an embedded to-one relation as an object or, depending on
    // the query, a single-element array. Getting this wrong would fail OPEN by
    // reading share_token as undefined, so it is pinned.
    const arrayShape = { user_id: null, squad: [{ share_token: 'right-token' }] } as SquadAccessRow
    expect(assertSquadAccess(arrayShape, undefined, 'right-token')).toBe(true)
    expect(assertSquadAccess(arrayShape, undefined, 'wrong')).toBe(false)
  })

  it('refuses a null squad rather than throwing', () => {
    expect(assertSquadAccess({ user_id: null, squad: null }, undefined, 'x')).toBe(false)
  })
})

describe('both actions are wired to the gate', () => {
  it('the payment action requires a squadToken argument', () => {
    expect(SRC).toMatch(/createSquadMemberPaymentIntent\([\s\S]*?squadToken: string,/)
  })

  it('the consent action requires a squadToken argument', () => {
    expect(SRC).toMatch(/recordSquadMemberMarketingConsent\([\s\S]*?squadToken: string,/)
  })

  it('both call assertSquadAccess, and the old short-circuit is gone', () => {
    const calls = SRC.match(/assertSquadAccess\(/g) ?? []
    // one definition plus two call sites
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(
      CODE,
      'the old check passed for every caller on a guest row',
    ).not.toMatch(/if \(member\.user_id && member\.user_id !== user\?\.id\)/)
  })

  it('the squad query selects share_token, or the gate has nothing to compare', () => {
    // A silent regression here would make every guest call fail closed, which is
    // safe but broken. Asserted so the fix stays functional as well as safe.
    const selects = SRC.match(/share_token/g) ?? []
    expect(selects.length).toBeGreaterThanOrEqual(2)
  })

  it('the client passes the token through, so the fix is not cosmetic', () => {
    const form = readFileSync(
      path.join(ROOT, 'src/app/squad/[token]/pay/[member_id]/squad-pay-form.tsx'),
      'utf8',
    )
    expect(form).toMatch(/createSquadMemberPaymentIntent\(memberId, squadToken\)/)
    expect(form).toMatch(/recordSquadMemberMarketingConsent\(memberId, organiserConsent, platformConsent, squadToken\)/)
  })
})
