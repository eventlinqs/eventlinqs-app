// Door-scan admit-exactly-once proof.
//
// Drives the REAL scan server action (src/app/scan/actions.ts) against a
// STATEFUL in-memory model of `tickets` whose rpc('scan_ticket') faithfully
// mirrors the authoritative SQL function in
// supabase/migrations/20260625000001_door_checkin_scan.sql: a single atomic
// compare-and-set flips a 'valid' ticket (matching code + secret + event) to
// 'scanned', and every other outcome is diagnosed as a distinct reject reason.
//
// Concurrency note: the SQL admit-once invariant rests on Postgres locking the
// matched row, so two scanners hitting the same code serialise and exactly one
// sees ROW_COUNT = 1. JavaScript is single-threaded, so the model's synchronous
// compare-and-set serialises identically; the live multi-transaction proof runs
// on the TEST database once the migration is applied (staging concurrency rig).

import { beforeEach, describe, expect, test, vi } from 'vitest'

type Ticket = {
  id: string
  ticket_code: string
  secret: string
  event_id: string
  status: 'valid' | 'scanned' | 'refunded' | 'void' | 'transferred'
  holder_name: string | null
  scan_count: number
  first_scanned_at: string | null
}
type ScanRow = { ticket_id: string | null; event_id: string; result: string }

const h = vi.hoisted(() => ({
  world: null as null | { tickets: Ticket[]; scans: ScanRow[]; authorised: boolean; user: { id: string } | null },
}))

function reset() {
  h.world = { tickets: [], scans: [], authorised: true, user: { id: 'staff-1' } }
}

// Faithful JS mirror of public.scan_ticket(). Returns the supabase-shaped
// { data, error } the action consumes.
function scanTicketModel(p_ticket_code: string, p_secret: string, p_event_id: string) {
  const w = h.world!
  if (!w.authorised) return { data: null, error: { message: 'not_authorised' } }

  // Atomic compare-and-set: only a valid, matching ticket flips to scanned.
  const match = w.tickets.find(
    (t) => t.ticket_code === p_ticket_code && t.secret === p_secret && t.event_id === p_event_id && t.status === 'valid',
  )
  if (match) {
    match.status = 'scanned'
    match.scan_count += 1
    match.first_scanned_at = match.first_scanned_at ?? new Date().toISOString()
    w.scans.push({ ticket_id: match.id, event_id: p_event_id, result: 'admitted' })
    return { data: [{ result: 'admitted', holder_name: match.holder_name, first_scanned_at: match.first_scanned_at }], error: null }
  }

  // No admit: diagnose by code (globally unique).
  const byCode = w.tickets.find((t) => t.ticket_code === p_ticket_code)
  if (!byCode || byCode.secret !== p_secret) {
    w.scans.push({ ticket_id: null, event_id: p_event_id, result: 'not_found' })
    return { data: [{ result: 'not_found', holder_name: null, first_scanned_at: null }], error: null }
  }
  let result: string
  if (byCode.event_id !== p_event_id) result = 'wrong_event'
  else if (byCode.status === 'scanned') result = 'already_scanned'
  else if (byCode.status === 'refunded') result = 'refunded'
  else if (byCode.status === 'void') result = 'void'
  else if (byCode.status === 'transferred') result = 'transferred'
  else result = 'invalid'
  w.scans.push({ ticket_id: byCode.id, event_id: p_event_id, result })
  return { data: [{ result, holder_name: byCode.holder_name, first_scanned_at: byCode.first_scanned_at }], error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.world!.user }, error: null }) },
    rpc: vi.fn(async (name: string, args: { p_ticket_code: string; p_secret: string; p_event_id: string }) => {
      if (name !== 'scan_ticket') return { data: null, error: null }
      return scanTicketModel(args.p_ticket_code, args.p_secret, args.p_event_id)
    }),
  }),
}))

import { scanTicket } from '@/app/scan/actions'

const EVENT = 'event-1'
const SECRET = '550e8400-e29b-41d4-a716-446655440000'
const CODE = 'EL-7G4K-2PMQ'

function seedValid() {
  h.world!.tickets.push({
    id: 'tkt-1', ticket_code: CODE, secret: SECRET, event_id: EVENT,
    status: 'valid', holder_name: 'Ada Lovelace', scan_count: 0, first_scanned_at: null,
  })
}

beforeEach(() => {
  reset()
  vi.clearAllMocks()
})

describe('door scan: admit exactly once', () => {
  test('first scan of a valid ticket admits and flips it to scanned', async () => {
    seedValid()
    const r = await scanTicket(EVENT, CODE, SECRET)
    expect(r.result).toBe('admitted')
    expect(r.holderName).toBe('Ada Lovelace')
    expect(h.world!.tickets[0].status).toBe('scanned')
    expect(h.world!.tickets[0].scan_count).toBe(1)
    expect(h.world!.scans.filter((s) => s.result === 'admitted')).toHaveLength(1)
  })

  test('second scan of the same code is rejected as already used', async () => {
    seedValid()
    await scanTicket(EVENT, CODE, SECRET)
    const second = await scanTicket(EVENT, CODE, SECRET)
    expect(second.result).toBe('already_scanned')
    expect(h.world!.tickets[0].scan_count).toBe(1) // not re-incremented
  })

  test('two concurrent scans of the same code admit exactly once', async () => {
    seedValid()
    const [a, b] = await Promise.all([scanTicket(EVENT, CODE, SECRET), scanTicket(EVENT, CODE, SECRET)])
    const results = [a.result, b.result].sort()
    expect(results).toEqual(['admitted', 'already_scanned'].sort())
    expect(h.world!.scans.filter((s) => s.result === 'admitted')).toHaveLength(1)
  })
})

describe('door scan: reject paths (fail closed)', () => {
  test('an unknown code is rejected as not_found and audited', async () => {
    const r = await scanTicket(EVENT, 'EL-ZZZZ-ZZZZ', SECRET)
    expect(r.result).toBe('not_found')
    expect(h.world!.scans.at(-1)).toMatchObject({ ticket_id: null, result: 'not_found' })
  })

  test('a correct code with the wrong secret is not_found (no secret oracle)', async () => {
    seedValid()
    const r = await scanTicket(EVENT, CODE, '00000000-0000-0000-0000-000000000000')
    expect(r.result).toBe('not_found')
    expect(h.world!.tickets[0].status).toBe('valid') // untouched
  })

  test('a valid ticket scanned at the wrong event is rejected', async () => {
    seedValid()
    const r = await scanTicket('event-OTHER', CODE, SECRET)
    expect(r.result).toBe('wrong_event')
    expect(h.world!.tickets[0].status).toBe('valid')
  })

  test('a refunded ticket is rejected', async () => {
    seedValid()
    h.world!.tickets[0].status = 'refunded'
    const r = await scanTicket(EVENT, CODE, SECRET)
    expect(r.result).toBe('refunded')
  })

  test('a transferred-away (old, rotated) code is rejected', async () => {
    seedValid()
    h.world!.tickets[0].status = 'transferred'
    const r = await scanTicket(EVENT, CODE, SECRET)
    expect(r.result).toBe('transferred')
  })
})

describe('door scan: authorisation', () => {
  test('an unauthenticated caller never reaches the RPC', async () => {
    seedValid()
    h.world!.user = null
    const r = await scanTicket(EVENT, CODE, SECRET)
    expect(r.result).toBe('error')
    expect(r.error).toMatch(/sign in/i)
    expect(h.world!.tickets[0].status).toBe('valid')
  })

  test('an unauthorised staff member gets an error, never an admit', async () => {
    seedValid()
    h.world!.authorised = false
    const r = await scanTicket(EVENT, CODE, SECRET)
    expect(r.result).toBe('error')
    expect(r.error).toMatch(/not authorised/i)
    expect(h.world!.tickets[0].status).toBe('valid')
  })
})
