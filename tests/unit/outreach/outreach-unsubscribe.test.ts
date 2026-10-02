import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE OUTREACH UNSUBSCRIBE, /unsubscribe/outreach.
 *
 * Two things are proven here, and the second matters more than the first.
 *
 * ONE. Validation happens on the server and trusts nothing the browser sent:
 * the hidden contact id, the radio value, the comment length and the address
 * are each re-checked, and a malformed id is not an error but a reason to ask
 * for the address instead (ACMA: the facility must still work).
 *
 * TWO. A failed write is never reported as an unsubscribe. The recorder and the
 * action THROW, so the page's error boundary says nothing was saved and to try
 * again. Telling somebody "You're unsubscribed" about a row that does not exist
 * means they keep receiving mail they asked to stop. A failed ALERT, by
 * contrast, must not fail the unsubscribe: the row is the record.
 */

const insertResult = vi.fn()
const insertedRows: unknown[] = []
const sent: { to: string; subject: string; html: string; messageType: string; recipientRole: string }[] = []
let sendFails: Error | null = null
let rateLimitOk = true
const captured: unknown[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertedRows.push({ table, row })
        return { select: () => ({ single: () => insertResult() }) }
      },
    }),
  }),
}))
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (input: (typeof sent)[number]) => {
    if (sendFails) throw sendFails
    sent.push(input)
    return { id: 'email-1' }
  },
}))
vi.mock('@/lib/rate-limit/action', () => ({
  actionRateLimit: async () => ({ ok: rateLimitOk, retryAfterSeconds: 60 }),
}))
vi.mock('@/lib/observability/sentry', () => ({
  captureException: (error: unknown) => {
    captured.push(error)
  },
}))

const lib = await import('@/lib/outreach/unsubscribe')
const { unsubscribeFromOutreachAction } = await import('@/app/actions/outreach-unsubscribe')
const { assertRecipientDeclared } = await import('@/lib/notifications/recipient-matrix')
const { POLICIES } = await import('@/lib/rate-limit/policies')

const {
  parseOutreachUnsubscribe,
  recordOutreachUnsubscribe,
  composeOutreachUnsubscribeAlert,
  isHubspotContactId,
  OutreachUnsubscribeNotRecorded,
  OUTREACH_UNSUBSCRIBE_REASONS,
} = lib

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.set(k, v)
  return data
}

const RECORDED = { id: '6f1c2b8e-1d2a-4c3b-9e4f-0a1b2c3d4e5f', created_at: '2026-10-03T01:30:00.000Z' }

beforeEach(() => {
  insertResult.mockReset()
  insertedRows.length = 0
  sent.length = 0
  sendFails = null
  rateLimitOk = true
  captured.length = 0
})

describe('the contact id', () => {
  test('a numeric HubSpot id is accepted', () => {
    expect(isHubspotContactId('123456')).toBe(true)
    expect(isHubspotContactId('332015577569')).toBe(true)
    expect(isHubspotContactId('1'.repeat(20))).toBe(true)
  })

  test('anything else is not an id, including a repeated query value', () => {
    for (const bad of ['', 'abc', '12a', '-1', '1.5', ' 123', '1'.repeat(21), '<script>', '123\n']) {
      expect(isHubspotContactId(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(isHubspotContactId(['123', '456'])).toBe(false)
    expect(isHubspotContactId(undefined)).toBe(false)
  })

  test('the shape answers the same way every time (no g flag carrying lastIndex)', () => {
    for (let i = 0; i < 5; i += 1) expect(isHubspotContactId('123456')).toBe(true)
  })
})

describe('parseOutreachUnsubscribe', () => {
  test('a valid id needs nothing else: no address, no reason, no comment', () => {
    expect(parseOutreachUnsubscribe({ id: '123456' })).toEqual({
      ok: true,
      value: { hubspotContactId: '123456', email: null, reason: null, comment: null },
    })
  })

  test('a malformed id falls back to asking for the address', () => {
    const refused = parseOutreachUnsubscribe({ id: 'abc' })
    expect(refused).toMatchObject({ ok: false, field: 'email' })

    const accepted = parseOutreachUnsubscribe({ id: 'abc', email: 'promoter@example.com' })
    expect(accepted).toEqual({
      ok: true,
      value: { hubspotContactId: null, email: 'promoter@example.com', reason: null, comment: null },
    })
  })

  test('no id and no address is refused on the address field', () => {
    expect(parseOutreachUnsubscribe({})).toMatchObject({ ok: false, field: 'email' })
    expect(parseOutreachUnsubscribe({ email: 'not an address' })).toMatchObject({ ok: false, field: 'email' })
  })

  test('the address is normalised to one spelling: trimmed and lower case', () => {
    const parsed = parseOutreachUnsubscribe({ email: '  Promoter@Example.COM \n' })
    expect(parsed).toMatchObject({ ok: true, value: { email: 'promoter@example.com' } })
  })

  test('with a valid id the address is not asked for and not stored', () => {
    const parsed = parseOutreachUnsubscribe({ id: '42', email: 'someone@example.com' })
    expect(parsed).toMatchObject({ ok: true, value: { hubspotContactId: '42', email: null } })
  })

  test('every listed reason is accepted, and none is required', () => {
    for (const reason of OUTREACH_UNSUBSCRIBE_REASONS) {
      expect(parseOutreachUnsubscribe({ id: '1', reason: reason.value })).toMatchObject({
        ok: true,
        value: { reason: reason.value },
      })
    }
    expect(parseOutreachUnsubscribe({ id: '1', reason: '' })).toMatchObject({ ok: true, value: { reason: null } })
  })

  test('a reason that is not on the list is refused', () => {
    expect(parseOutreachUnsubscribe({ id: '1', reason: 'hacked' })).toMatchObject({ ok: false, field: 'reason' })
    expect(parseOutreachUnsubscribe({ id: '1', reason: 'Too many emails' })).toMatchObject({
      ok: false,
      field: 'reason',
    })
  })

  test('a comment of 1000 characters is accepted and one of 1001 is refused', () => {
    expect(parseOutreachUnsubscribe({ id: '1', comment: 'a'.repeat(1000) })).toMatchObject({ ok: true })
    expect(parseOutreachUnsubscribe({ id: '1', comment: 'a'.repeat(1001) })).toMatchObject({
      ok: false,
      field: 'comment',
    })
  })

  test('line breaks submitted as CRLF are counted once, as the textarea counted them', () => {
    const lines = Array.from({ length: 100 }, () => 'a'.repeat(9)).join('\r\n') // 999 with LF, 1098 with CRLF
    const parsed = parseOutreachUnsubscribe({ id: '1', comment: lines })
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) expect(parsed.value.comment).not.toContain('\r')
  })

  test('a blank comment is stored as no comment', () => {
    expect(parseOutreachUnsubscribe({ id: '1', comment: '   \n ' })).toMatchObject({
      ok: true,
      value: { comment: null },
    })
  })
})

describe('recordOutreachUnsubscribe: a failed write is never a success', () => {
  const value = { hubspotContactId: '123', email: null, reason: null, comment: null }

  test('an error from the database throws', async () => {
    await expect(
      recordOutreachUnsubscribe(async () => ({ data: null, error: { code: '42501', message: 'denied' } }), value),
    ).rejects.toBeInstanceOf(OutreachUnsubscribeNotRecorded)
  })

  test('a transport that throws throws', async () => {
    await expect(
      recordOutreachUnsubscribe(async () => {
        throw new Error('fetch failed')
      }, value),
    ).rejects.toBeInstanceOf(OutreachUnsubscribeNotRecorded)
  })

  test('no error but no row is still not a recorded unsubscribe', async () => {
    await expect(recordOutreachUnsubscribe(async () => ({ data: null, error: null }), value)).rejects.toBeInstanceOf(
      OutreachUnsubscribeNotRecorded,
    )
  })

  test('a written row is returned, with the columns spelt as the database spells them', async () => {
    const insert = vi.fn(async () => ({ data: RECORDED, error: null }))
    await expect(recordOutreachUnsubscribe(insert, value)).resolves.toEqual(RECORDED)
    expect(insert).toHaveBeenCalledWith({ hubspot_contact_id: '123', email: null, reason: null, comment: null })
  })
})

describe('the alert to the platform owner', () => {
  test('names the contact in the subject and escapes everything a stranger typed', () => {
    const alert = composeOutreachUnsubscribeAlert(
      { hubspotContactId: '123456', email: null, reason: 'other', comment: '<img src=x onerror=alert(1)>\nsecond line' },
      RECORDED,
    )
    expect(alert.subject).toBe('Outreach unsubscribe: HubSpot contact 123456')
    expect(alert.html).not.toContain('<img')
    expect(alert.html).toContain('&lt;img src=x onerror=alert(1)&gt;<br/>second line')
    expect(alert.text).toContain('Reason: Other')
    expect(alert.text).toContain('2026-10-03T01:30:00.000Z')
  })

  test('names the address when there was no id', () => {
    const alert = composeOutreachUnsubscribeAlert(
      { hubspotContactId: null, email: 'a@example.com', reason: null, comment: null },
      RECORDED,
    )
    expect(alert.subject).toBe('Outreach unsubscribe: a@example.com')
    expect(alert.text).toContain('Reason: No reason given')
    expect(alert.text).toContain('Comment: No comment')
  })

  test('its message type is declared for the platform owner and nobody else', () => {
    expect(() => assertRecipientDeclared('outreach_unsubscribe_alert', 'platform_owner')).not.toThrow()
    expect(() => assertRecipientDeclared('outreach_unsubscribe_alert', 'prospect')).toThrow()
  })
})

describe('unsubscribeFromOutreachAction', () => {
  const IDLE = { status: 'idle' } as const

  test('records the row, alerts the owner once, and only then reports done', async () => {
    insertResult.mockResolvedValue({ data: RECORDED, error: null })
    const state = await unsubscribeFromOutreachAction(
      IDLE,
      form({ id: '123456', reason: 'too_many_emails', comment: 'Thanks' }),
    )
    expect(state).toEqual({ status: 'done' })
    expect(insertedRows).toEqual([
      {
        table: 'outreach_unsubscribes',
        row: { hubspot_contact_id: '123456', email: null, reason: 'too_many_emails', comment: 'Thanks' },
      },
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      messageType: 'outreach_unsubscribe_alert',
      recipientRole: 'platform_owner',
      subject: 'Outreach unsubscribe: HubSpot contact 123456',
    })
  })

  test('a failed insert THROWS, so the person is never told they are unsubscribed', async () => {
    insertResult.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } })
    await expect(unsubscribeFromOutreachAction(IDLE, form({ id: '123456' }))).rejects.toBeInstanceOf(
      OutreachUnsubscribeNotRecorded,
    )
    expect(sent).toHaveLength(0)
  })

  test('a failed alert does NOT fail the unsubscribe, and is captured', async () => {
    insertResult.mockResolvedValue({ data: RECORDED, error: null })
    sendFails = new Error('Resend refused')
    const state = await unsubscribeFromOutreachAction(IDLE, form({ id: '123456' }))
    expect(state).toEqual({ status: 'done' })
    expect(captured).toHaveLength(1)
  })

  test('an invalid submission writes nothing and says which field', async () => {
    const state = await unsubscribeFromOutreachAction(IDLE, form({ id: 'abc' }))
    expect(state).toMatchObject({ status: 'invalid', field: 'email' })
    expect(insertedRows).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  test('a refused rate limit writes nothing and says so', async () => {
    rateLimitOk = false
    const state = await unsubscribeFromOutreachAction(IDLE, form({ id: '123456' }))
    expect(state).toMatchObject({ status: 'limited' })
    expect(insertedRows).toHaveLength(0)
  })

  test('the policy it is limited by exists and is fail-open, keyed by address', () => {
    const policy = POLICIES['outreach-unsubscribe']
    expect(policy).toBeDefined()
    expect(policy.failClosed).toBeFalsy()
  })
})
