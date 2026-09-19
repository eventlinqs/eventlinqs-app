import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'

/**
 * AN AUDIT ENTRY NOBODY CAN FIND IS INDISTINGUISHABLE FROM AN ACTION NOBODY
 * TOOK.
 *
 * ---------------------------------------------------------------------------
 * TWO DEFECTS, and the first is the one that made the second invisible.
 *
 * ONE. THE TRY/CATCH COULD NOT SEE THE FAILURE IT WAS WRITTEN FOR. The insert
 * was `await createAdminClient().from('audit_log').insert({...})` with no
 * destructure. A PostgREST client REPORTS a refused write in `error` and does
 * not throw, so a refusal, an RLS denial or a constraint came back as a
 * resolved promise and fell straight through the `try`. The catch only ever
 * guarded `headers()`.
 *
 * TWO. IN PRODUCTION IT SAID NOTHING AT ALL: the catch logged only when
 * `NODE_ENV !== 'production'`, so the one environment where the audit trail is
 * evidence is the one where its absence left no trace.
 *
 * The platform suspends organisers, moves fee-free windows and holds payouts
 * through these writers. Each test below is one way the record could quietly
 * not exist.
 */

const insert = vi.fn()
const captured: { message: string; context: unknown }[] = []
let headersThrow: Error | null = null

vi.mock('next/headers', () => ({
  headers: async () => {
    if (headersThrow) throw headersThrow
    return new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'a browser' })
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert }) }),
}))
vi.mock('@/lib/observability/sentry', () => ({
  captureException: (err: unknown, context: unknown) => {
    captured.push({ message: err instanceof Error ? err.message : String(err), context })
  },
}))

const { recordAuditEvent, recordAnonAuditEvent } = await import('@/lib/admin/audit')

const SESSION = {
  userId: 'admin-1',
  email: 'founder@eventlinqs.test',
  admin: { role: 'super_admin' },
} as unknown as Parameters<typeof recordAuditEvent>[0]['session']

const NODE_ENV = process.env.NODE_ENV

beforeEach(() => {
  insert.mockReset()
  captured.length = 0
  headersThrow = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (NODE_ENV !== undefined) vi.stubEnv('NODE_ENV', NODE_ENV)
})

describe('recordAuditEvent', () => {
  test('a written entry says so, and carries the actor, the action and the address', async () => {
    insert.mockResolvedValue({ error: null })
    const result = await recordAuditEvent({
      action: 'admin.organiser.suspended',
      targetType: 'organisation',
      targetId: 'org-1',
      session: SESSION,
    })
    expect(result).toEqual({ recorded: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-1',
        actor_email_snapshot: 'founder@eventlinqs.test',
        action: 'admin.organiser.suspended',
        target_id: 'org-1',
        ip: '203.0.113.7',
      }),
    )
    expect(captured).toHaveLength(0)
  })

  test('THE DEFECT: a REFUSED write is reported, not swallowed, and does not throw', async () => {
    insert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })

    const result = await recordAuditEvent({ action: 'admin.founding.waiver.grant', session: SESSION })

    expect(result).toEqual({ recorded: false })
    expect(captured).toHaveLength(1)
    expect(captured[0].message).toMatch(/row-level security/)
    expect(captured[0].context).toMatchObject({ scope: 'admin-audit', action: 'admin.founding.waiver.grant' })
  })

  test('IN PRODUCTION TOO, which is the environment the old code was silent in', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    insert.mockResolvedValue({ error: { message: 'connection reset' } })

    await recordAuditEvent({ action: 'admin.payout.hold', session: SESSION })

    expect(captured).toHaveLength(1)
    expect(captured[0].message).toMatch(/connection reset/)
  })

  test('a throw on the way to the table is reported too, and still does not escape', async () => {
    headersThrow = new Error('headers() outside a request scope')
    insert.mockResolvedValue({ error: null })

    const result = await recordAuditEvent({ action: 'admin.network.view', session: SESSION })

    expect(result).toEqual({ recorded: false })
    expect(captured[0].message).toMatch(/outside a request scope/)
  })

  test('the promise NEVER rejects, because an audit failure must not fail the action already taken', async () => {
    insert.mockRejectedValue(new Error('the socket went away'))
    await expect(recordAuditEvent({ action: 'admin.organiser.approved', session: SESSION })).resolves.toEqual({
      recorded: false,
    })
  })
})

describe('recordAnonAuditEvent', () => {
  test('a written entry says so', async () => {
    insert.mockResolvedValue({ error: null })
    const result = await recordAnonAuditEvent({ action: 'founding.invite.accepted', actorEmail: 'a@b.test' })
    expect(result).toEqual({ recorded: true })
    expect(captured).toHaveLength(0)
  })

  test('a refused write is reported rather than swallowed', async () => {
    insert.mockResolvedValue({ error: { message: 'null value in column "action"' } })
    const result = await recordAnonAuditEvent({ action: 'founding.invite.accepted' })
    expect(result).toEqual({ recorded: false })
    expect(captured[0].message).toMatch(/null value in column/)
  })

  test('it never rejects either', async () => {
    insert.mockRejectedValue(new Error('gone'))
    await expect(recordAnonAuditEvent({ action: 'founding.invite.accepted' })).resolves.toEqual({ recorded: false })
  })
})
