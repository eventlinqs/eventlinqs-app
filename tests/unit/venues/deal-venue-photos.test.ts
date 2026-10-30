import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { dealVenuePhotos } from '@/lib/venues/venue-images'

/*
 * VENUE PHOTOS ARE DEALT, NEVER SHARED (the photo system's P3): new nights arrive every day, so the deal runs with the
 * job that makes them, after it, and a deal that fails never takes the nights' own result down with it.
 */

describe('the deal', () => {
  it('asks the database to deal and says how many it gave out', async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }))
    expect(await dealVenuePhotos({ rpc })).toBe(3)
    expect(rpc).toHaveBeenCalledWith('deal_venue_photos', {})
  })

  it('a fault is thrown, never read as nothing dealt', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }))
    await expect(dealVenuePhotos({ rpc })).rejects.toThrow('function does not exist')
  })
})

describe('the job that makes the nights deals after it', () => {
  const SOURCE = readFileSync(join(process.cwd(), 'src/app/api/cron/listing-occurrences/route.ts'), 'utf8')
  it('runs the deal once the nights are made, in its own try', () => {
    const made = SOURCE.indexOf('runOccurrences(')
    const dealt = SOURCE.indexOf('dealVenuePhotos(')
    expect(made).toBeGreaterThan(-1)
    expect(dealt).toBeGreaterThan(made)
    expect(SOURCE.slice(made, dealt)).toMatch(/try \{/)
  })
})
