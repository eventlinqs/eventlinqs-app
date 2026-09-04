import { describe, expect, test } from 'vitest'
import { sha256Hex, setState, expiryFor, validateOffline } from '@/lib/scanner/offline-validate'
import { DOOR_SET_VALID_FOR_MS, type DoorSetMeta, type DoorTicketRecord } from '@/lib/scanner/door-types'

/**
 * The device's own judgement when the signal is gone (Scope v5 3.12, 3.13).
 * Every branch mirrors scan_ticket's diagnosis order, and one rule is the
 * device's alone: a set older than 24 hours admits nobody.
 */

const DOWNLOADED = '2026-09-05T08:00:00.000Z'
const NOW = Date.parse('2026-09-05T09:00:00.000Z')
const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

function meta(downloadedAt = DOWNLOADED): DoorSetMeta {
  return { eventId: 'event-1', eventTitle: 'Open Field Party', downloadedAt, expiresAt: expiryFor(downloadedAt), ticketCount: 1, deviceId: 'device-1', version: 1 }
}

function record(over: Partial<DoorTicketRecord> = {}): DoorTicketRecord {
  return {
    ticketId: '44444444-4444-4444-8444-444444444444',
    ticketCode: 'EL-2345-6789',
    secretHash: HASH,
    status: 'valid',
    holderName: 'Robin Ashe',
    tierName: 'General admission',
    seatLabel: null,
    firstScannedAt: null,
    admittedLocallyAt: null,
    ...over,
  }
}

describe('sha256Hex', () => {
  test('matches the database: sha256 of "abc" as lowercase hex', async () => {
    // The same value extensions.digest('abc', 'sha256') returned on TEST (C:\dev\EVIDENCE\B1\pgcrypto-probe.txt).
    expect(await sha256Hex('abc')).toBe(HASH)
  })

  test('a uuid secret hashes to 64 hex characters', async () => {
    const hash = await sha256Hex('7f0d0c4e-3c9a-4d5b-9b3e-2f1e0a9c8b7d')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('setState and expiryFor', () => {
  test('no meta is none', () => {
    expect(setState(null, NOW)).toEqual({ state: 'none', msRemaining: 0 })
  })

  test('a set inside its 24 hours is ready, with the time left', () => {
    const s = setState(meta(), NOW)
    expect(s.state).toBe('ready')
    expect(s.msRemaining).toBe(DOOR_SET_VALID_FOR_MS - 60 * 60 * 1000)
  })

  test('a set exactly 24 hours old is expired', () => {
    const old = new Date(NOW - DOOR_SET_VALID_FOR_MS).toISOString()
    expect(setState(meta(old), NOW).state).toBe('expired')
  })

  test('an unreadable expiry is treated as expired, never as ready', () => {
    expect(setState({ ...meta(), expiresAt: 'not a date' }, NOW).state).toBe('expired')
  })

  test('expiryFor adds exactly the 24 hour window', () => {
    expect(Date.parse(expiryFor(DOWNLOADED)) - Date.parse(DOWNLOADED)).toBe(DOOR_SET_VALID_FOR_MS)
  })
})

describe('validateOffline', () => {
  test('with no set at all, the device refuses to admit (stale_set)', () => {
    expect(validateOffline({ record: record(), secretHash: HASH, meta: null, now: NOW }).result).toBe('stale_set')
  })

  test('with a set older than a day, the device refuses to admit even a valid ticket', () => {
    const old = meta(new Date(NOW - DOOR_SET_VALID_FOR_MS - 1).toISOString())
    expect(validateOffline({ record: record(), secretHash: HASH, meta: old, now: NOW }).result).toBe('stale_set')
  })

  test('a code the set does not know is not_found', () => {
    expect(validateOffline({ record: null, secretHash: HASH, meta: meta(), now: NOW }).result).toBe('not_found')
  })

  test('a hash that does not match is not_found, never a secret oracle', () => {
    const out = validateOffline({ record: record(), secretHash: 'f'.repeat(64), meta: meta(), now: NOW })
    expect(out.result).toBe('not_found')
    expect(out.holderName).toBeNull()
  })

  test('the hash comparison ignores case', () => {
    expect(validateOffline({ record: record(), secretHash: HASH.toUpperCase(), meta: meta(), now: NOW }).result).toBe('admitted')
  })

  test('a valid ticket is admitted, judged by the device, carrying the name and the ticket type', () => {
    const out = validateOffline({ record: record(), secretHash: HASH, meta: meta(), now: NOW })
    expect(out).toEqual({
      result: 'admitted',
      holderName: 'Robin Ashe',
      tierName: 'General admission',
      seatLabel: null,
      firstScannedAt: null,
      judgedBy: 'device',
    })
  })

  test('a ticket this device already admitted is already_scanned, with the local time', () => {
    const out = validateOffline({ record: record({ admittedLocallyAt: '2026-09-05T08:30:00.000Z' }), secretHash: HASH, meta: meta(), now: NOW })
    expect(out.result).toBe('already_scanned')
    expect(out.firstScannedAt).toBe('2026-09-05T08:30:00.000Z')
  })

  test('a ticket the server had already scanned is already_scanned, with the server time', () => {
    const out = validateOffline({ record: record({ status: 'scanned', firstScannedAt: '2026-09-05T07:15:00.000Z' }), secretHash: HASH, meta: meta(), now: NOW })
    expect(out.result).toBe('already_scanned')
    expect(out.firstScannedAt).toBe('2026-09-05T07:15:00.000Z')
  })

  test('the server time wins over the local mark when both exist', () => {
    const out = validateOffline(
      { record: record({ status: 'scanned', firstScannedAt: '2026-09-05T07:15:00.000Z', admittedLocallyAt: '2026-09-05T08:30:00.000Z' }), secretHash: HASH, meta: meta(), now: NOW },
    )
    expect(out.firstScannedAt).toBe('2026-09-05T07:15:00.000Z')
  })

  test.each(['refunded', 'void', 'transferred'] as const)('%s is its own word', (status) => {
    expect(validateOffline({ record: record({ status }), secretHash: HASH, meta: meta(), now: NOW }).result).toBe(status)
  })

  test('an unknown status is a safe reject (invalid), never an admit', () => {
    const odd = record({ status: 'something_new' as DoorTicketRecord['status'] })
    expect(validateOffline({ record: odd, secretHash: HASH, meta: meta(), now: NOW }).result).toBe('invalid')
  })

  test('every outcome says the device judged it', () => {
    for (const r of [null, record(), record({ status: 'scanned' }), record({ status: 'refunded' })]) {
      expect(validateOffline({ record: r, secretHash: HASH, meta: meta(), now: NOW }).judgedBy).toBe('device')
    }
  })
})
