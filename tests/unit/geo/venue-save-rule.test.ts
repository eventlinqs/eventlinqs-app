import { describe, expect, test } from 'vitest'
import { deploymentEnvironment, judgeVenueSave } from '@/lib/geo/venue-save-rule'

/**
 * NEVER A NULL PAIR SAVED SILENTLY (close-out C9, 7 September 2026). The rule
 * that both event actions run after resolving coordinates, judged case by case.
 */
const none = (reason: string | null) => ({ venue_latitude: null, venue_longitude: null, reason })
const typed = { eventType: 'in_person' as const, venueAddress: '57 Swan Street' }

describe('deploymentEnvironment', () => {
  test('reads Vercel production and preview, and everything else is development', () => {
    expect(deploymentEnvironment({ VERCEL_ENV: 'production' })).toBe('production')
    expect(deploymentEnvironment({ VERCEL_ENV: 'preview' })).toBe('preview')
    expect(deploymentEnvironment({ VERCEL_ENV: 'development' })).toBe('development')
    expect(deploymentEnvironment({})).toBe('development')
    expect(deploymentEnvironment({ NODE_ENV: 'production' })).toBe('development')
  })
})

describe('judgeVenueSave', () => {
  test('the key absent on production refuses, names the configuration and the path that works', () => {
    const v = judgeVenueSave({ ...typed, coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is not set'), environment: 'production' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.kind).toBe('configuration')
    expect(v.error).toContain('GOOGLE_MAPS_API_KEY')
    expect(v.error).toMatch(/pick the venue from the suggestions/i)
  })

  test('the browser key standing in for the server key is the same configuration fault', () => {
    const v = judgeVenueSave({
      ...typed,
      coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is the public browser key, which is referer restricted and cannot serve the Geocoding API'),
      environment: 'preview',
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.kind).toBe('configuration')
  })

  test('Google refusing or finding nothing on production is a geocoding fault that names the status', () => {
    const denied = judgeVenueSave({ ...typed, coordinates: none('the Geocoding API answered REQUEST_DENIED: referer restrictions'), environment: 'production' })
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.kind).toBe('geocoding')
      expect(denied.error).toContain('REQUEST_DENIED')
      expect(denied.error).not.toContain('GOOGLE_MAPS_API_KEY')
    }
    const zero = judgeVenueSave({ ...typed, coordinates: none('the Geocoding API answered ZERO_RESULTS: no results'), environment: 'production' })
    expect(zero.ok).toBe(false)
    if (!zero.ok) expect(zero.error).toContain('ZERO_RESULTS')
  })

  test('on development the same cases are allowed and the reason travels as the warning', () => {
    const v = judgeVenueSave({ ...typed, coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is not set'), environment: 'development' })
    expect(v).toEqual({ ok: true, warning: 'server geocoding is off: GOOGLE_MAPS_API_KEY is not set' })
  })

  test('coordinates present, a virtual event, or no address at all are allowed', () => {
    expect(judgeVenueSave({ ...typed, coordinates: { venue_latitude: -37.82, venue_longitude: 144.99, reason: null }, environment: 'production' })).toEqual({ ok: true, warning: null })
    expect(judgeVenueSave({ eventType: 'virtual', venueAddress: null, coordinates: none(null), environment: 'production' })).toEqual({ ok: true, warning: null })
    const noAddress = judgeVenueSave({ eventType: 'in_person', venueAddress: '  ', coordinates: none('no address to geocode'), environment: 'production' })
    expect(noAddress).toEqual({ ok: true, warning: 'no address to geocode' })
  })

  test('a hybrid event with a typed address is judged like an in-person one', () => {
    const v = judgeVenueSave({ eventType: 'hybrid', venueAddress: '1 Flinders Street', coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is not set'), environment: 'production' })
    expect(v.ok).toBe(false)
  })
})
