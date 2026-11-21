import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * EVERY PENDING NEWSLETTER SIGNUP MADE A SUBSCRIBER, ITS CLICK THE RECORD (law 50 (a); the PM's 10:07 of 21 November
 * 2026). Never over a person's own word, never on a failed read, counts only.
 */

const writes: Array<Record<string, unknown>> = []
let writeOk = true
vi.mock('@/lib/consent/record', () => ({
  recordPlatformDigestConsent: vi.fn(async (_admin: unknown, params: Record<string, unknown>) => {
    writes.push(params)
    return writeOk
  }),
}))

import {
  backfillPendingConfirms,
  cityOfConfirmSubject,
  pendingFromSenderLog,
  readSenderConfirms,
  senderTimeToIso,
} from '@/lib/newsletter/pending-backfill'

type Rows = { data: unknown[] | null; error: { message: string } | null }
function admin(state: { listed?: Record<string, string>; stops?: Set<string>; failFor?: Set<string> }) {
  return {
    from(table: string) {
      const f: Record<string, string> = {}
      const q = {
        select: () => q,
        eq: (col: string, v: string) => {
          f[col] = v
          return q
        },
        or: () => q,
        limit: async (): Promise<Rows> => {
          const email = f.email ?? f.address
          if (state.failFor?.has(email)) return { data: null, error: { message: 'timeout' } }
          if (table === 'marketing_consents') {
            const s = state.listed?.[`${email} ${f.city_slug}`]
            return { data: s ? [{ status: s }] : [], error: null }
          }
          if (table === 'email_delivery_events') return { data: state.stops?.has(email) ? [{ event_type: 'email.complained' }] : [], error: null }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return q
    },
  } as never
}

describe("reading the sender's log", () => {
  it('knows the confirm subject and its city, and nothing else', () => {
    expect(cityOfConfirmSubject('Confirm your weekly Melbourne guide')).toBe('Melbourne')
    expect(cityOfConfirmSubject('Confirm your EventLinqs email')).toBeNull()
    expect(cityOfConfirmSubject('This week in Melbourne: 4 events worth a look')).toBeNull()
    expect(cityOfConfirmSubject(undefined)).toBeNull()
  })

  it("reads Resend's own time format", () => {
    expect(senderTimeToIso('2026-11-20 22:55:01.123+00')).toBe('2026-11-20T22:55:01.123Z')
    expect(senderTimeToIso('2026-11-20T22:55:01.000Z')).toBe('2026-11-20T22:55:01.000Z')
    expect(senderTimeToIso('not a time')).toBeNull()
  })

  it('keeps the first click per address and city, lower cases the address, drops every other email', () => {
    const out = pendingFromSenderLog([
      { to: ['Jo@Example.com'], subject: 'Confirm your weekly Melbourne guide', created_at: '2026-11-20 22:55:01+00' },
      { to: ['jo@example.com'], subject: 'Confirm your weekly Melbourne guide', created_at: '2026-11-19 10:00:00+00' },
      { to: ['jo@example.com'], subject: 'Confirm your weekly Geelong guide', created_at: '2026-11-18 09:00:00+00' },
      { to: ['jo@example.com'], subject: 'Confirm your EventLinqs email', created_at: '2026-11-18 09:00:00+00' },
    ])
    expect(out).toEqual([
      { email: 'jo@example.com', cityName: 'Geelong', sentAt: '2026-11-18T09:00:00.000Z' },
      { email: 'jo@example.com', cityName: 'Melbourne', sentAt: '2026-11-19T10:00:00.000Z' },
    ])
  })

  it('pages through the log until it says there is no more', async () => {
    const pages = [
      { data: [{ id: 'a', to: ['x@example.com'], subject: 'Confirm your weekly Geelong guide', created_at: '2026-11-15 01:00:00+00' }], has_more: true },
      { data: [{ id: 'b', to: ['y@example.com'], subject: 'Welcome', created_at: '2026-11-15 01:00:00+00' }], has_more: false },
    ]
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 })
    }) as unknown as typeof fetch
    const read = await readSenderConfirms(fetchImpl, 're_test', { pauseMs: 0 })
    expect(read).toMatchObject({ pages: 2, complete: true })
    expect(read.confirms).toHaveLength(1)
    expect(urls[1]).toContain('after=a')
  })

  it('a refused read stops, never a partial answer taken as the whole', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    await expect(readSenderConfirms(fetchImpl, 're_test', { pauseMs: 0 })).rejects.toThrow('401')
  })
})

describe('the backfill', () => {
  beforeEach(() => {
    writes.length = 0
    writeOk = true
  })
  const confirms = [
    { email: 'new@example.com', cityName: 'Melbourne', sentAt: '2026-11-20T22:55:01.000Z' },
    { email: 'listed@example.com', cityName: 'Melbourne', sentAt: '2026-11-19T01:00:00.000Z' },
    { email: 'left@example.com', cityName: 'Geelong', sentAt: '2026-11-19T01:00:00.000Z' },
    { email: 'spam@example.com', cityName: 'Geelong', sentAt: '2026-11-19T01:00:00.000Z' },
    { email: 'blink@example.com', cityName: 'Geelong', sentAt: '2026-11-19T01:00:00.000Z' },
    { email: 'far@example.com', cityName: 'Atlantis', sentAt: '2026-11-19T01:00:00.000Z' },
  ]
  const state = {
    listed: { 'listed@example.com melbourne': 'granted', 'left@example.com geelong': 'withdrawn' },
    stops: new Set(['spam@example.com']),
    failFor: new Set(['blink@example.com']),
  }

  it('a dry run counts and writes nothing', async () => {
    const out = await backfillPendingConfirms(admin(state), confirms, { apply: false })
    expect(out).toMatchObject({ mode: 'dry_run', confirmsFound: 6, pending: 1, alreadyListed: 2, stopped: 1, readFailed: 1, unknownCity: 1, recorded: 0, byCity: { melbourne: 1 } })
    expect(writes).toEqual([])
  })

  it("apply records only the pending one, at its click, with the panel's own words and version", async () => {
    const out = await backfillPendingConfirms(admin(state), confirms, { apply: true })
    expect(out).toMatchObject({ mode: 'apply', pending: 1, recorded: 1, writeFailed: 0 })
    expect(writes).toEqual([
      expect.objectContaining({
        email: 'new@example.com',
        citySlug: 'melbourne',
        at: '2026-11-20T22:55:01.000Z',
        consentText: "Get Melbourne's best events weekly. One email a week, the events worth your time.",
        consentVersion: 'v1',
      }),
    ])
    expect(String(writes[0].source)).toContain('law 50 (a)')
  })

  it('a refused write is counted as refused, never as recorded', async () => {
    writeOk = false
    const out = await backfillPendingConfirms(admin(state), confirms, { apply: true })
    expect(out).toMatchObject({ recorded: 0, writeFailed: 1 })
  })

  it('the answer holds no address', async () => {
    const out = await backfillPendingConfirms(admin(state), confirms, { apply: false })
    expect(JSON.stringify(out)).not.toContain('@')
  })
})

describe('the route and its workflow', () => {
  const route = readFileSync('src/app/api/cron/newsletter-pending-backfill/route.ts', 'utf8')
  const workflow = readFileSync('.github/workflows/newsletter-pending-backfill.yml', 'utf8')

  it('answers only the cron secret, and is a dry run unless apply=1', () => {
    expect(route.indexOf('requireCronAuth(request)')).toBeLessThan(route.indexOf('readSenderConfirms('))
    expect(route).toContain("get('apply') === '1'")
  })

  it('is started by hand only, dry run by default, and prints counts only', () => {
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).not.toMatch(/^\s*schedule:/m)
    expect(workflow).toContain('default: dry-run')
    expect(workflow).not.toMatch(/print\(.*answer/)
  })
})
