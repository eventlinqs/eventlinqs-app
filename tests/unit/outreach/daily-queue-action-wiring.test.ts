/*
 * THE SENT PRESS ON LAWAL's DAILY OUTREACH QUEUE (the PROJECT MANAGER's 05:00, 31 October 2026): staff only, limited by
 * the admin's own id after the role check, records the send through crm.ts markSent as that admin, audited, and nothing
 * in it sends a message. Read from the source, as admin-social-press-wiring.test.ts does.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { POLICIES } from '@/lib/rate-limit/policies'

const FILE = resolve('src/app/admin/(authed)/acquisition/actions.ts')
const PAGE = resolve('src/app/admin/(authed)/acquisition/page.tsx')
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')

describe('the Sent press', () => {
  const src = read(FILE)

  test('is a server action that checks the role, then limits by the admin id', () => {
    expect(src.startsWith("'use server'")).toBe(true)
    expect(src).toMatch(/requireAdminSession\(\)/)
    expect(src).toMatch(/can\(session, 'admin\.network\.manage'\)/)
    expect(src).toMatch(/actionRateLimit\(\s*'admin-outreach-sent',\s*session\.userId\s*\)/)
    expect(src.indexOf('actionRateLimit')).toBeGreaterThan(src.indexOf('can(session'))
    expect(POLICIES['admin-outreach-sent'].keyPrefix).toBe('adm-sent')
  })

  test('records the send through markSent as that admin, and audits it', () => {
    expect(src).toMatch(/markSent\(\s*createAdminClient\(\),\s*\{[^}]*sentBy:\s*session\.userId/)
    expect(src).toMatch(/recordAuditEvent\(\{\s*action:\s*'admin\.outreach\.sent'/)
  })

  test('sends nothing itself', () => {
    expect(src).not.toMatch(/sendEmail|graph|fetch\(/i)
  })

  test('the page shows the queue', () => {
    expect(read(PAGE)).toMatch(/readDailyQueue\(/)
  })
})
