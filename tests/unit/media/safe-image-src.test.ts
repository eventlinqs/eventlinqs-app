import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveImageSrc } from '@/components/media/safe-image-src'

const SUPABASE = 'https://gndnldyfudbytbboxesk.supabase.co'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveImageSrc', () => {
  test('returns null for missing / empty / malformed', () => {
    expect(resolveImageSrc(null)).toBeNull()
    expect(resolveImageSrc(undefined)).toBeNull()
    expect(resolveImageSrc('')).toBeNull()
    expect(resolveImageSrc('   ')).toBeNull()
    expect(resolveImageSrc('not a url')).toBeNull()
  })

  test('passes through local and data URLs', () => {
    expect(resolveImageSrc('/cities/sydney.svg')).toBe('/cities/sydney.svg')
    expect(resolveImageSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })

  test('passes through allowed remote hosts unchanged', () => {
    const sb = `${SUPABASE}/storage/v1/object/public/event-images/a/b.png`
    expect(resolveImageSrc(sb)).toBe(sb)
    expect(resolveImageSrc('https://images.pexels.com/photos/1/x.jpeg')).toBe('https://images.pexels.com/photos/1/x.jpeg')
    expect(resolveImageSrc('https://picsum.photos/200')).toBe('https://picsum.photos/200')
  })

  test('recovers dead branded-domain /cdn/ URLs to the Supabase host', () => {
    expect(resolveImageSrc('https://eventlinqs.com/cdn/event-images/u/e/cover.png')).toBe(
      `${SUPABASE}/storage/v1/object/public/event-images/u/e/cover.png`,
    )
    // images.eventlinqs.com is allow-listed but serves nothing, so /cdn/ there
    // is also recovered to the working Supabase host.
    expect(resolveImageSrc('https://images.eventlinqs.com/cdn/event-images/u/e/cover.png')).toBe(
      `${SUPABASE}/storage/v1/object/public/event-images/u/e/cover.png`,
    )
  })

  test("passes an approved venue photograph's Wikimedia Commons file, and only a Commons file on that host", () => {
    // Every harvested venue photograph is a Commons file (venue_images, 20261030171501). Refused here, an approved
    // one reached the card and the card drew the branded placeholder (window 3, car 16's TEST preview).
    const commons =
      'https://upload.wikimedia.org/wikipedia/commons/2/2c/Melbourne_%28AU%29%2C_Queen_Victoria_Market_--_2019_--_1535.jpg'
    expect(resolveImageSrc(commons)).toBe(commons)
    expect(resolveImageSrc('https://upload.wikimedia.org/wikipedia/en/1/1a/Not_free.jpg')).toBeNull()
  })

  test('next.config.ts lets next/image load the same Commons path the guard passes', () => {
    const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')
    expect(config).toMatch(/hostname: 'upload\.wikimedia\.org',\s*pathname: '\/wikipedia\/commons\/\*\*'/)
  })

  test('returns null for a disallowed host (would otherwise 500 next/image)', () => {
    expect(resolveImageSrc('https://evil.example.com/x.png')).toBeNull()
    expect(resolveImageSrc('https://eventlinqs.com/not-cdn/x.png')).toBeNull()
  })
})
