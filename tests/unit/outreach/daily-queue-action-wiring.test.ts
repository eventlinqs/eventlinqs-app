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
    expect(src.indexOf("actionRateLimit('admin-outreach-sent'")).toBeGreaterThan(src.indexOf('can(session'))
    expect(POLICIES['admin-outreach-sent'].keyPrefix).toBe('adm-sent')
  })

  test('records the send through markSent as that admin, and audits it', () => {
    expect(src).toMatch(/markSent\(\s*(?:createAdminClient\(\)|db),\s*\{[^}]*sentBy:\s*session\.userId/)
    expect(src).toMatch(/recordAuditEvent\(\{\s*action:\s*'admin\.outreach\.sent'/)
  })

  test("needs Lawal's tick that he checked their page, records that check as him, and only then marks it sent (the CONTROLLER's 05:32 (3))", () => {
    expect(src).toMatch(/formData\.get\('checked'\)/)
    expect(src).toMatch(/confirmPageChecked\(\s*(?:createAdminClient\(\)|db),\s*\{[^}]*by:\s*session\.userId/)
    expect(src.indexOf('confirmPageChecked(')).toBeLessThan(src.indexOf('markSent('))
    expect(read(resolve('src/app/admin/(authed)/acquisition/daily-queue-item.tsx'))).toMatch(/name="checked"[^>]*required/)
  })

  test('the database refuses a message leaving held while its page is unchecked', () => {
    const sql = read(resolve('supabase/migrations/20261031053501_outreach_page_checked_before_it_leaves_held.sql'))
    expect(sql).toMatch(/before insert or update on public\.outreach_touches/)
    expect(sql).toMatch(/new\.state in \('held', 'void'\)/)
    expect(sql).toMatch(/not c\.no_marketing_statement_checked/)
  })

  test('sends nothing itself', () => {
    expect(src).not.toMatch(/sendEmail|graph|fetch\(/i)
  })

  test('the page shows the queue', () => {
    expect(read(PAGE)).toMatch(/readDailyQueue\(/)
  })
})

describe("the communication gateway in the send path (the CONTROLLER's 08:40)", () => {
  const src = read(FILE)
  const item = read(resolve('src/app/admin/(authed)/acquisition/daily-queue-item.tsx'))
  const drafts = read(resolve('src/lib/outreach/drafts.ts'))
  const queue = read(resolve('src/lib/outreach/daily-queue.ts'))

  test('nothing leaves held by itself: a draft is never written queued', () => {
    expect(drafts).not.toMatch(/'queued' : 'held'/)
    expect(drafts).not.toMatch(/state:\s*'queued'/)
    expect(drafts).toMatch(/const state = 'held' as const/)
  })

  test('the queue judges every held message by the gateway and hands the page the exact content and policy version', () => {
    expect(queue).toMatch(/voiceProblems\(/)
    expect(queue).toMatch(/voiceContentHash\(/)
    expect(item).toMatch(/name="contentHash"/)
    expect(item).toMatch(/name="policyVersion"/)
  })

  test('Sent checks the stored words again, against what Lawal saw, under this policy, by Lawal himself, before anything is recorded', () => {
    expect(src).toMatch(/approvalProblems\(/)
    expect(src).toMatch(/byFounder:\s*session\.admin\.role === 'super_admin'/)
    expect(src).toMatch(/formData\.get\('contentHash'\)/)
    expect(src.indexOf('approvalProblems(')).toBeLessThan(src.indexOf('confirmPageChecked('))
    expect(src.indexOf('approvalProblems(')).toBeLessThan(src.indexOf('markSent('))
    expect(src).toMatch(/metadata:\s*\{[^}]*contentHash/)
  })
})

describe('the queue at 390 (looked at on the TEST drive, 31 October 17:30)', () => {
  test("a message's long link wraps inside its card instead of running off it", () => {
    expect(read(PAGE)).toMatch(/whitespace-pre-wrap[^"]*\[overflow-wrap:anywhere\][^"]*">\{t\.body\}/)
  })
})
