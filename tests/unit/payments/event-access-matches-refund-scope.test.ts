import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENT_MANAGER_ROLES } from '@/lib/organisations/event-access'

/**
 * THE ROUTE AND THE REFUND PATH MUST ADMIT THE SAME PEOPLE.
 *
 * Founder ruling 2026-08-19: "any organiser can refund". Three things decide whether
 * that is true, and until this session they did not agree:
 *
 *   resolveRefundScope        owner OR organisation_members owner/admin/manager
 *   create_refund_request     the same set, re-checked in SQL
 *   the dashboard order route OWNER ONLY  <- the odd one out
 *
 * So a manager passed both authorisation checks and still never saw the button,
 * because the page called notFound() before rendering it. Not a security hole, but
 * the ruling was unreachable for any venue with staff.
 *
 * These tests pin the three together. They are deliberately structural rather than
 * behavioural: the divergence was never a logic bug, it was two lists of roles in
 * two files that nothing compared. A behavioural test of one path would have passed
 * throughout.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('event access and refund scope admit the same roles', () => {
  test('the shared gate admits owner, admin and manager', () => {
    expect([...EVENT_MANAGER_ROLES].sort()).toEqual(['admin', 'manager', 'owner'])
  })

  test('resolveRefundScope names the identical role list', () => {
    const src = read('src/lib/payments/refund-scope.ts')
    const m = /const ORG_MEMBER_ROLES\s*=\s*\[([^\]]*)\]/.exec(src)
    expect(m, 'ORG_MEMBER_ROLES not found in refund-scope.ts').toBeTruthy()
    const roles = (m as RegExpExecArray)[1]
      .split(',')
      .map(r => r.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .sort()
    // The gate and the service must not drift. If a role is added to one, this
    // fails until it is added to the other.
    expect(roles).toEqual([...EVENT_MANAGER_ROLES].sort())
  })

  test('the SQL re-check names the identical role list', () => {
    // create_refund_request enforces the same set inside the database, so a change
    // in application code alone would be refused at the RPC with a confusing
    // "not authorised" that looks like a bug in the UI.
    const sql = read('supabase/migrations/20260531000001_refund_reconcile.sql')
    const m = /m\.role\s+IN\s*\(([^)]*)\)/.exec(sql)
    expect(m, 'the member role check was not found in create_refund_request').toBeTruthy()
    const roles = (m as RegExpExecArray)[1]
      .split(',')
      .map(r => r.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort()
    expect(roles).toEqual([...EVENT_MANAGER_ROLES].sort())
  })

  test('the order routes no longer gate on owner_id alone', () => {
    // The specific shape that caused the divergence. Both routes must resolve access
    // through the shared gate instead of re-deriving it from organisations.owner_id.
    for (const route of [
      'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx',
      'src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx',
    ]) {
      const src = read(route)
      expect(src, `${route} still filters organisations by owner_id`).not.toMatch(
        /\.from\('organisations'\)[\s\S]{0,200}\.eq\('owner_id'/,
      )
      expect(src, `${route} does not call the shared gate`).toMatch(/resolveEventAccess\s*\(/)
    }
  })

  test('the reporting gate resolves through the shared definition', () => {
    const src = read('src/lib/reporting/attendees.ts')
    expect(src).toMatch(/resolveEventAccess\s*\(/)
    // getOrganiserEvent must not re-derive ownership itself.
    expect(src).not.toMatch(/\.from\('organisations'\)[\s\S]{0,200}\.eq\('owner_id'/)
  })

  test('the gate fails closed on every refusal reason', () => {
    // Every non-allowed branch must be a refusal, never a partial allow. Read
    // structurally because constructing a Next.js server session here is not
    // possible in a unit test.
    const src = read('src/lib/organisations/event-access.ts')
    for (const reason of ['unauthenticated', 'event_not_found', 'not_authorised']) {
      expect(src, `missing refusal reason ${reason}`).toContain(`reason: '${reason}'`)
    }
    // The only two ways OUT with access are the owner branch and the member branch.
    // Counted on `return { allowed: true`, not on `allowed: true`: the latter also
    // matches the exported type union, so the first version of this expected 2 and
    // found 3 and was measuring the type declaration rather than the control flow.
    expect((src.match(/return \{ allowed: true/g) ?? []).length).toBe(2)
  })
})
