import { describe, expect, test } from 'vitest'
import { decideStreamAccess, viewerCountryFromHeader, type StreamAccessFacts } from '@/lib/stream/access'

/**
 * THE GATE IN FRONT OF THE STREAM (Scope v5 3.11). Every refusal reason and
 * every admission, as a pure function of facts, so the watch page and the chat
 * API cannot drift from each other or from this.
 */
const admitted: StreamAccessFacts = {
  ticketFound: true,
  secretMatches: true,
  ticketStatus: 'valid',
  eventType: 'hybrid',
  tierAccessMode: 'virtual',
  geoAllow: null,
  viewerCountry: 'AU',
  hasLink: true,
}

describe('decideStreamAccess', () => {
  test('a valid livestream ticket on a hybrid event with no geo rule is admitted', () => {
    expect(decideStreamAccess(admitted)).toEqual({ ok: true })
  })

  test('a scanned ticket still watches (the door and the stream are not exclusive)', () => {
    expect(decideStreamAccess({ ...admitted, ticketStatus: 'scanned' })).toEqual({ ok: true })
  })

  test('every ticket on a virtual-only event is a livestream ticket, whatever its tier says', () => {
    expect(decideStreamAccess({ ...admitted, eventType: 'virtual', tierAccessMode: 'in_person' })).toEqual({ ok: true })
    expect(decideStreamAccess({ ...admitted, eventType: 'virtual', tierAccessMode: null })).toEqual({ ok: true })
  })

  test('identity is judged first: no ticket, then wrong secret', () => {
    expect(decideStreamAccess({ ...admitted, ticketFound: false, secretMatches: false })).toEqual({ ok: false, reason: 'not_found' })
    expect(decideStreamAccess({ ...admitted, secretMatches: false })).toEqual({ ok: false, reason: 'wrong_secret' })
  })

  test('a refunded, void or transferred ticket is refused before anything else is considered', () => {
    for (const status of ['refunded', 'void', 'transferred', 'pending', null]) {
      expect(decideStreamAccess({ ...admitted, ticketStatus: status, hasLink: false })).toEqual({ ok: false, reason: 'not_valid' })
    }
  })

  test('an in-person ticket on a hybrid event does not watch', () => {
    expect(decideStreamAccess({ ...admitted, tierAccessMode: 'in_person' })).toEqual({ ok: false, reason: 'not_livestream_ticket' })
    expect(decideStreamAccess({ ...admitted, eventType: 'in_person', tierAccessMode: 'in_person' })).toEqual({ ok: false, reason: 'not_livestream_ticket' })
  })

  test('geography: allowed, blocked, unknown, and case does not matter', () => {
    const geo = { ...admitted, geoAllow: ['AU', 'NZ'] }
    expect(decideStreamAccess({ ...geo, viewerCountry: 'NZ' })).toEqual({ ok: true })
    expect(decideStreamAccess({ ...geo, viewerCountry: 'nz' })).toEqual({ ok: true })
    expect(decideStreamAccess({ ...geo, viewerCountry: 'US' })).toEqual({ ok: false, reason: 'geo_blocked' })
    expect(decideStreamAccess({ ...geo, viewerCountry: null })).toEqual({ ok: false, reason: 'geo_unknown' })
    expect(decideStreamAccess({ ...geo, viewerCountry: 'XYZ' })).toEqual({ ok: false, reason: 'geo_unknown' })
  })

  test('an empty allow-list means anywhere, including an unknown country', () => {
    expect(decideStreamAccess({ ...admitted, geoAllow: [], viewerCountry: null })).toEqual({ ok: true })
  })

  test('geography is judged before the vault, so a blocked viewer never learns whether a link exists', () => {
    expect(decideStreamAccess({ ...admitted, geoAllow: ['AU'], viewerCountry: 'US', hasLink: false })).toEqual({ ok: false, reason: 'geo_blocked' })
  })

  test('a livestream ticket with no link yet is told so, last', () => {
    expect(decideStreamAccess({ ...admitted, hasLink: false })).toEqual({ ok: false, reason: 'no_stream_link' })
  })
})

describe('viewerCountryFromHeader', () => {
  test('accepts a two-letter code in any case and nothing else', () => {
    expect(viewerCountryFromHeader('AU')).toBe('AU')
    expect(viewerCountryFromHeader(' nz ')).toBe('NZ')
    expect(viewerCountryFromHeader('')).toBeNull()
    expect(viewerCountryFromHeader(null)).toBeNull()
    expect(viewerCountryFromHeader(undefined)).toBeNull()
    expect(viewerCountryFromHeader('AUS')).toBeNull()
    expect(viewerCountryFromHeader('1A')).toBeNull()
  })
})
