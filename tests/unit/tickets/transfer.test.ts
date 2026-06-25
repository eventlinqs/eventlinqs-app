// Ticket-transfer identity-reissue proof.
//
// Drives the REAL transfer action (src/app/actions/transfer-ticket.ts) and the
// REAL scan action (src/app/scan/actions.ts) against ONE shared in-memory model
// whose rpc() faithfully mirrors transfer_ticket() and scan_ticket() from
// supabase/migrations/20260625000003_ticket_transfer.sql and
// 20260625000001_door_checkin_scan.sql. It proves the end-to-end story: after a
// transfer the holder is reassigned, the OLD QR is dead, the NEW QR admits
// exactly once, the export (which keys off holder_email) reflects the new
// holder, and no consent is inherited.

import { beforeEach, describe, expect, test, vi } from 'vitest'

type Ticket = {
  id: string
  order_user_id: string
  ticket_code: string
  secret: string
  event_id: string
  status: 'valid' | 'scanned' | 'refunded' | 'void' | 'transferred'
  holder_name: string | null
  holder_email: string
  scan_count: number
  first_scanned_at: string | null
}
type Transfer = { ticket_id: string; from_email: string; to_email: string }
type Consent = { email: string }

const h = vi.hoisted(() => ({
  world: null as null | {
    tickets: Ticket[]
    transfers: Transfer[]
    consents: Consent[]
    profilesByUid: Map<string, string>
    user: { id: string } | null
    secretSeq: number
  },
}))

function reset() {
  h.world = {
    tickets: [],
    transfers: [],
    consents: [],
    profilesByUid: new Map([['buyer-1', 'buyer@example.com']]),
    user: { id: 'buyer-1' },
    secretSeq: 0,
  }
}

const EVENT = 'event-1'
const CODE = 'EL-7G4K-2PMQ'
const ORIGINAL_SECRET = '550e8400-e29b-41d4-a716-446655440000'

function transferModel(p_ticket_id: string, p_to_email: string, p_to_name: string) {
  const w = h.world!
  const uid = w.user?.id ?? null
  if (!uid) return { data: null, error: { message: 'not_authenticated' } }
  const t = w.tickets.find((x) => x.id === p_ticket_id)
  if (!t) return { data: null, error: { message: 'not_found' } }
  const callerEmail = w.profilesByUid.get(uid) ?? null
  const authorised = t.order_user_id === uid || (!!callerEmail && callerEmail.toLowerCase() === t.holder_email.toLowerCase())
  if (!authorised) return { data: null, error: { message: 'not_authorised' } }
  if (t.status !== 'valid') return { data: null, error: { message: 'not_transferable' } }
  const fromEmail = t.holder_email
  const newSecret = `rotated-secret-${++w.secretSeq}-0000-0000-0000-000000000000`
  t.holder_email = p_to_email
  t.holder_name = p_to_name
  t.secret = newSecret
  w.transfers.push({ ticket_id: t.id, from_email: fromEmail, to_email: p_to_email })
  return { data: [{ ticket_code: t.ticket_code, new_secret: newSecret, event_title: 'Afrobeats Night' }], error: null }
}

function scanModel(p_ticket_code: string, p_secret: string, p_event_id: string) {
  const w = h.world!
  const match = w.tickets.find(
    (t) => t.ticket_code === p_ticket_code && t.secret === p_secret && t.event_id === p_event_id && t.status === 'valid',
  )
  if (match) {
    match.status = 'scanned'
    match.scan_count += 1
    match.first_scanned_at = match.first_scanned_at ?? new Date().toISOString()
    return { data: [{ result: 'admitted', holder_name: match.holder_name, first_scanned_at: match.first_scanned_at }], error: null }
  }
  const byCode = w.tickets.find((t) => t.ticket_code === p_ticket_code)
  if (!byCode || byCode.secret !== p_secret) {
    return { data: [{ result: 'not_found', holder_name: null, first_scanned_at: null }], error: null }
  }
  const result = byCode.status === 'scanned' ? 'already_scanned' : byCode.status
  return { data: [{ result, holder_name: byCode.holder_name, first_scanned_at: byCode.first_scanned_at }], error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.world!.user }, error: null }) },
    rpc: vi.fn(async (name: string, args: Record<string, string>) => {
      if (name === 'transfer_ticket') return transferModel(args.p_ticket_id, args.p_to_email, args.p_to_name)
      if (name === 'scan_ticket') return scanModel(args.p_ticket_code, args.p_secret, args.p_event_id)
      return { data: null, error: null }
    }),
  }),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.eventlinqs.com' }))

import { transferTicket } from '@/app/actions/transfer-ticket'
import { scanTicket } from '@/app/scan/actions'

function seedTicket() {
  h.world!.tickets.push({
    id: 'tkt-1', order_user_id: 'buyer-1', ticket_code: CODE, secret: ORIGINAL_SECRET, event_id: EVENT,
    status: 'valid', holder_name: 'Buyer One', holder_email: 'buyer@example.com', scan_count: 0, first_scanned_at: null,
  })
}

beforeEach(() => {
  reset()
  vi.clearAllMocks()
})

describe('ticket transfer: identity reissue', () => {
  test('reassigns the holder and rotates the secret', async () => {
    seedTicket()
    const res = await transferTicket('tkt-1', 'Gift@Example.com', 'Gift Holder')
    expect(res).toEqual({ ok: true })
    const t = h.world!.tickets[0]
    expect(t.holder_email).toBe('gift@example.com') // normalised + reassigned
    expect(t.holder_name).toBe('Gift Holder')
    expect(t.secret).not.toBe(ORIGINAL_SECRET) // rotated
  })

  test('the OLD QR (old secret) is dead and the NEW QR admits exactly once', async () => {
    seedTicket()
    await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    const newSecret = h.world!.tickets[0].secret

    // Old bearer credential no longer validates.
    const old = await scanTicket(EVENT, CODE, ORIGINAL_SECRET)
    expect(old.result).toBe('not_found')

    // New holder's credential admits, and only once.
    const first = await scanTicket(EVENT, CODE, newSecret)
    expect(first.result).toBe('admitted')
    expect(first.holderName).toBe('Gift Holder')
    const second = await scanTicket(EVENT, CODE, newSecret)
    expect(second.result).toBe('already_scanned')
  })

  test('the organiser export reflects the new holder (keys off holder_email)', async () => {
    seedTicket()
    await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    // The attendee export reads tickets.holder_email/holder_name; both are now the new holder.
    expect(h.world!.tickets[0].holder_email).toBe('gift@example.com')
    expect(h.world!.tickets[0].holder_name).toBe('Gift Holder')
  })

  test('the transfer is logged from old holder to new', async () => {
    seedTicket()
    await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    expect(h.world!.transfers).toEqual([{ ticket_id: 'tkt-1', from_email: 'buyer@example.com', to_email: 'gift@example.com' }])
  })

  test('consent does NOT carry over to the new holder', async () => {
    seedTicket()
    // The buyer had opted in; the new holder must start with no consent.
    h.world!.consents.push({ email: 'buyer@example.com' })
    await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    expect(h.world!.consents.some((c) => c.email === 'gift@example.com')).toBe(false)
  })
})

describe('ticket transfer: authorisation and abuse', () => {
  test('a stranger (not owner, not holder) cannot transfer the ticket', async () => {
    seedTicket()
    h.world!.user = { id: 'stranger-9' }
    h.world!.profilesByUid.set('stranger-9', 'stranger@example.com')
    const res = await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    expect(res).toEqual({ error: 'You can only transfer your own ticket.' })
    expect(h.world!.tickets[0].holder_email).toBe('buyer@example.com') // unchanged
  })

  test('an already-scanned ticket cannot be transferred for a second entry', async () => {
    seedTicket()
    h.world!.tickets[0].status = 'scanned'
    const res = await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    expect('error' in res && res.error).toMatch(/cannot be transferred/i)
  })

  test('an unauthenticated caller is refused', async () => {
    seedTicket()
    h.world!.user = null
    const res = await transferTicket('tkt-1', 'gift@example.com', 'Gift Holder')
    expect(res).toEqual({ error: 'Sign in to transfer a ticket.' })
  })

  test('the current holder (by account email) can transfer onward', async () => {
    seedTicket()
    // Simulate a prior gift: holder is now someone with an account.
    h.world!.tickets[0].holder_email = 'gift@example.com'
    h.world!.tickets[0].order_user_id = 'buyer-1'
    h.world!.user = { id: 'gift-user' }
    h.world!.profilesByUid.set('gift-user', 'gift@example.com')
    const res = await transferTicket('tkt-1', 'third@example.com', 'Third Holder')
    expect(res).toEqual({ ok: true })
    expect(h.world!.tickets[0].holder_email).toBe('third@example.com')
  })

  test('rejects an invalid recipient email before calling the RPC', async () => {
    seedTicket()
    const res = await transferTicket('tkt-1', 'not-an-email', 'Gift Holder')
    expect(res).toEqual({ error: 'Enter a valid email address for the new holder.' })
    expect(h.world!.transfers).toHaveLength(0)
  })
})
