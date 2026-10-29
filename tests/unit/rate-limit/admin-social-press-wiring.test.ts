/*
 * THE /admin/social PRESSES ARE RATE LIMITED BY THE ADMIN, AND THE LIMIT ACTUALLY REFUSES (the release checklist F4),
 * AND AN AUTOMATIC PUBLISH IS AUDITED LIKE A PRESS (F5). Window 6, 29 October 2026.
 *
 * F4 was found by the audit of car 3 (C:\dev\EVIDENCE\SECURITY-29OCT\F1-F6-audit-car3.txt): no policy covered any admin
 * social press. As event-create-wiring.test.ts does, this drives the real checkRateLimit with the real numbers against a
 * real counting store and requires the refusal, and checks the bucket: the admin's own id, never the forwarded IP.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map<string, number>()
vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () => ({
    incr: async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n },
    expire: async () => 1,
  }),
}))

import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'

const ACTIONS = readFileSync(resolve(process.cwd(), 'src/app/admin/(authed)/social/actions.ts'), 'utf8')
const PUBLISH = readFileSync(resolve(process.cwd(), 'src/app/api/cron/social-publish/route.ts'), 'utf8')

/** A function's body: from its declaration to the next top-level declaration. */
function bodyOf(text: string, head: string): string {
  const start = text.indexOf(head)
  expect(start, `${head} must exist`).toBeGreaterThan(-1)
  const next = text.slice(start + 1).search(/\n(export |async function |function |const )/)
  return text.slice(start, next === -1 ? text.length : start + 1 + next)
}

beforeEach(() => store.clear())

describe('the two policies', () => {
  test('a press: 120 in ten minutes, fail-open', () => {
    const p = POLICIES['admin-social-press']
    expect(p).toMatchObject({ limit: 120, windowSec: 600 })
    expect(p.failClosed ?? false).toBe(false)
  })

  test('the Plan press: 6 in ten minutes, fail-open', () => {
    const p = POLICIES['admin-social-plan']
    expect(p).toMatchObject({ limit: 6, windowSec: 600 })
    expect(p.failClosed ?? false).toBe(false)
  })

  test.each(['admin-social-press', 'admin-social-plan'] as const)('%s refuses the call after its limit, and only that one', async (name) => {
    const p = POLICIES[name]
    const call = () => checkRateLimit({ key: `${p.keyPrefix}:admin-1`, limit: p.limit, windowSec: p.windowSec, failClosed: p.failClosed })
    for (let i = 0; i < p.limit; i++) expect((await call()).ok, `call ${i + 1} is within the limit`).toBe(true)
    expect((await call()).ok, `call ${p.limit + 1} is refused`).toBe(false)
    /* The control: another admin's bucket is untouched. */
    expect((await checkRateLimit({ key: `${p.keyPrefix}:admin-2`, limit: p.limit, windowSec: p.windowSec })).ok).toBe(true)
  })
})

describe('the wiring', () => {
  test('every press goes through staff(), which limits by the admin id after the role check', () => {
    const staff = bodyOf(ACTIONS, 'async function staff(')
    expect(staff).toMatch(/actionRateLimit\(\s*'admin-social-press',\s*session\.userId\s*\)/)
    expect(staff.indexOf('actionRateLimit')).toBeGreaterThan(staff.indexOf('can(session'))
    const exported = [...ACTIONS.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]!)
    expect(exported.length).toBeGreaterThan(10)
    for (const name of exported) expect(bodyOf(ACTIONS, `export async function ${name}(`), name).toMatch(/await staff\(\)/)
  })

  test('the Plan press also takes the plan bucket, by the admin id', () => {
    expect(bodyOf(ACTIONS, 'export async function planWeekAction(')).toMatch(/actionRateLimit\(\s*'admin-social-plan',\s*session\.userId\s*\)/)
  })

  test('an automatic publish run that published or held anything writes an audit row (F5)', () => {
    expect(PUBLISH).toMatch(/recordAnonAuditEvent\(/)
    expect(PUBLISH).toMatch(/action:\s*'system\.social\.publish'/)
  })
})
