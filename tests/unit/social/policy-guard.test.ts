import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALREADY_WORDS, LATE_HOLD_WORDS, POLICY_SWITCH, switchOffByCode, switchTrips } from '@/lib/social/policy-guard'

/*
 * THE STANDING POLICY FAILS CLOSED (the PM's 10:47 of 20 November 2026, item 1): the dry run logged first; approvals only
 * of what it read eligible; an approval outside it turns the switch off by code, with an alarm row the board and the
 * 08:00 report read. ONE PIECE NEVER STOPS THE ENGINE (Lawal's hardening order of 22 November 2026, section 2 A): a
 * refused, held or failed piece is held alone, drilled red on main a4c40783's rule, which tripped the switch for them.
 */
// Line endings normalised (the tree carries CRLF).
const route = readFileSync(join(process.cwd(), 'src/app/api/cron/social-publish/route.ts'), 'utf8').replace(/\r\n/g, '\n')
const store = readFileSync(join(process.cwd(), 'src/lib/social/store.ts'), 'utf8').replace(/\r\n/g, '\n')

const hour = (eligible: string[], approved: string[], refused: { id: string; reason: string }[] = []) => ({ eligible: new Set(eligible), approved, refused })

describe('the switch trips', () => {
  it('a clean run trips nothing', () => {
    expect(switchTrips({ policy: hour(['a', 'b'], ['a', 'b']), scheduleHeld: [], publishHeld: [] })).toEqual([])
    expect(switchTrips({ policy: null, scheduleHeld: [], publishHeld: [] })).toEqual([])
  })

  it('an approval outside the dry run trips it', () => {
    expect(switchTrips({ policy: hour(['a'], ['a', 'z']), scheduleHeld: [], publishHeld: [] })).toEqual(["z was approved outside this hour's dry run"])
  })

  it('a piece the dry run read eligible and the approval refused is held alone, never a trip', () => {
    expect(switchTrips({ policy: hour(['a'], [], [{ id: 'a', reason: 'Its night has started.' }]), scheduleHeld: [], publishHeld: [] })).toEqual([])
  })

  it('a hold at scheduling is held alone, never a trip', () => {
    const late = `p1: ${LATE_HOLD_WORDS}, Sat 6 pm, is after Torquay Dance Academy starts (Sat 5 pm), and a piece never posts once its night has started.`
    const already = `p2${ALREADY_WORDS}`
    const gate = 'p3: Not scheduled, held by the publish gate: [night] Showtime: it has started.'
    expect(switchTrips({ policy: null, scheduleHeld: [late, already, gate], publishHeld: [] })).toEqual([])
  })

  it('a provider error at publishing holds that piece alone, never every piece', () => {
    const held = 's9: Not published: Blotato refused POST /posts: media too large'
    expect(switchTrips({ policy: null, scheduleHeld: [], publishHeld: [held] })).toEqual([])
  })

  it("AMCF's final day feed held by the gate at the 08:40 run of 22 November: held alone, the switch stays on", () => {
    const amcf = '70329a33: Not published: [night] African Music and Cultural Festival 2026: it has started (2026-11-20T00:00:00+00:00); a piece never posts once its night has started.'
    expect(switchTrips({ policy: hour(['b'], ['b']), scheduleHeld: [], publishHeld: [amcf] })).toEqual([])
  })
})

describe('the switch goes off by code, with its alarm', () => {
  it('writes the flag off and a failed row in ops_phase_runs', async () => {
    const writes: { table: string; op: string; payload: Record<string, unknown>; where: [string, unknown][] }[] = []
    const db = {
      from: (table: string) => {
        const where: [string, unknown][] = []
        let op = ''
        let payload: Record<string, unknown> = {}
        const q = {
          update: (p: Record<string, unknown>) => ((op = 'update'), (payload = p), q),
          insert: (p: Record<string, unknown>) => ((op = 'insert'), (payload = p), q),
          eq: (k: string, v: unknown) => (where.push([k, v]), q),
          then: (ok: (v: unknown) => unknown) => (writes.push({ table, op, payload, where }), Promise.resolve({ error: null }).then(ok)),
        }
        return q
      },
    }
    const now = new Date('2026-11-20T04:40:00Z')
    const out = await switchOffByCode(db as never, { now, phase: 'schedule', trips: ['held at publishing: s9: Not published: x'] })
    expect(out.off).toBe(true)
    const flag = writes.find((w) => w.table === 'feature_flags')
    expect(flag?.op).toBe('update')
    expect(flag?.payload.enabled).toBe(false)
    expect(flag?.where).toEqual([['flag', POLICY_SWITCH]])
    const alarm = writes.find((w) => w.table === 'ops_phase_runs')
    expect(alarm?.op).toBe('insert')
    expect(alarm?.payload.failed).toBe(true)
    expect(String(alarm?.payload.result)).toMatch(/^SWITCH OFF BY CODE .*1 fault in the publishing run: held at publishing: s9/)
  })
})

describe('the run is wired to fail closed', () => {
  it('logs the dry run before the policy approves, and approves only what it read eligible', () => {
    const block = route.slice(route.indexOf('if (POLICY_HOURS.has(melbourneHour(now)))'), route.indexOf('const scheduled = await scheduleApprovedPieces('))
    const dry = block.indexOf('standingPolicyDryRun(db')
    expect(dry).toBeGreaterThan(-1)
    expect(block.indexOf("action: 'system.social.standing_policy_dry_run'")).toBeGreaterThan(dry)
    expect(block.indexOf('approveUnderStandingPolicy(db')).toBeGreaterThan(block.indexOf("action: 'system.social.standing_policy_dry_run'"))
    expect(block).toContain('only: eligible')
    expect(store).toMatch(/approveWeek\(policyPieces\(campaign\.pieces\)\.filter\(\(p\) => input\.only\.has\(p\.id\)\)/)
  })

  it('after scheduling and publishing, any trip while the switch reads on turns it off', () => {
    const after = route.slice(route.indexOf('const published = await publishDuePieces('))
    expect(after.indexOf('if (published.switchOn) {')).toBeGreaterThan(-1)
    expect(after).toMatch(/switchTrips\(\{ policy: policyHour, scheduleHeld: scheduled\.held, publishHeld: published\.held \}\)/)
    expect(after).toMatch(/if \(trips\.length > 0\) await switchOffByCode\(db, /)
  })

  it('a policy that could not run is said and recorded, never a global stop', () => {
    expect(route).toMatch(/policyFaults\.push\(`the standing policy could not run: /)
    expect(route).toMatch(/const trips = switchTrips\(\{ policy: policyHour, scheduleHeld: scheduled\.held, publishHeld: published\.held \}\)/)
  })
})
