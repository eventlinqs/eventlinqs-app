import { afterEach, describe, expect, it } from 'vitest'
import { getStorageUrl, rewriteStorageUrl, getActiveStorageDomain } from '@/lib/storage/url'

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ORIGINAL_STORAGE_DOMAIN = process.env.NEXT_PUBLIC_STORAGE_DOMAIN

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL
  process.env.NEXT_PUBLIC_STORAGE_DOMAIN = ORIGINAL_STORAGE_DOMAIN
})

describe('getStorageUrl', () => {
  it('returns the branded URL when NEXT_PUBLIC_STORAGE_DOMAIN is set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    process.env.NEXT_PUBLIC_STORAGE_DOMAIN = 'images.eventlinqs.com'
    expect(getStorageUrl('event-images', 'sydney/cover.jpg'))
      .toBe('https://images.eventlinqs.com/event-images/sydney/cover.jpg')
  })

  it('returns the Supabase fallback URL when the branded domain is not set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    delete process.env.NEXT_PUBLIC_STORAGE_DOMAIN
    expect(getStorageUrl('event-images', 'sydney/cover.jpg'))
      .toBe('https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/sydney/cover.jpg')
  })

  it('strips a leading slash on the path so callers can pass either form', () => {
    process.env.NEXT_PUBLIC_STORAGE_DOMAIN = 'images.eventlinqs.com'
    expect(getStorageUrl('bucket', '/with-leading-slash.jpg'))
      .toBe('https://images.eventlinqs.com/bucket/with-leading-slash.jpg')
  })

  it('throws when the bucket is empty', () => {
    expect(() => getStorageUrl('', 'foo.jpg')).toThrow('bucket is required')
  })

  it('throws when the path is empty', () => {
    expect(() => getStorageUrl('bucket', '')).toThrow('path is required')
  })

  it('throws when neither branded domain nor Supabase URL is set', () => {
    delete process.env.NEXT_PUBLIC_STORAGE_DOMAIN
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => getStorageUrl('bucket', 'path.jpg'))
      .toThrow('NEXT_PUBLIC_SUPABASE_URL is required')
  })
})

describe('rewriteStorageUrl', () => {
  it('rewrites Supabase storage URLs to the branded domain', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    process.env.NEXT_PUBLIC_STORAGE_DOMAIN = 'images.eventlinqs.com'
    const supabaseUrl = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/sydney/cover.jpg'
    expect(rewriteStorageUrl(supabaseUrl))
      .toBe('https://images.eventlinqs.com/event-images/sydney/cover.jpg')
  })

  it('is identity when no branded domain is configured', () => {
    delete process.env.NEXT_PUBLIC_STORAGE_DOMAIN
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    const supabaseUrl = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/sydney/cover.jpg'
    expect(rewriteStorageUrl(supabaseUrl)).toBe(supabaseUrl)
  })

  it('is identity for non-Supabase URLs (Pexels, picsum, already-branded)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    process.env.NEXT_PUBLIC_STORAGE_DOMAIN = 'images.eventlinqs.com'
    expect(rewriteStorageUrl('https://images.pexels.com/photos/1/cover.jpg'))
      .toBe('https://images.pexels.com/photos/1/cover.jpg')
    expect(rewriteStorageUrl('https://picsum.photos/seed/foo/1200'))
      .toBe('https://picsum.photos/seed/foo/1200')
    expect(rewriteStorageUrl('https://images.eventlinqs.com/already-branded.jpg'))
      .toBe('https://images.eventlinqs.com/already-branded.jpg')
  })

  it('handles empty / non-string inputs safely', () => {
    expect(rewriteStorageUrl('')).toBe('')
  })
})

describe('getActiveStorageDomain', () => {
  it('returns the branded domain when set', () => {
    process.env.NEXT_PUBLIC_STORAGE_DOMAIN = 'images.eventlinqs.com'
    expect(getActiveStorageDomain()).toBe('images.eventlinqs.com')
  })

  it('returns the Supabase hostname when the branded domain is not set', () => {
    delete process.env.NEXT_PUBLIC_STORAGE_DOMAIN
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
    expect(getActiveStorageDomain()).toBe('gndnldyfudbytbboxesk.supabase.co')
  })
})
