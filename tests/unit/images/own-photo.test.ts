import { describe, expect, it } from 'vitest'
import { isOwnPhoto } from '@/lib/images/event-media'

/*
 * THE HOME HERO LEADS ONLY WITH A NIGHT'S OWN PHOTOGRAPH (the project manager's 18:38 and 19:14 of 29 October 2026).
 * Production's hero led 'Bavarian Sunset Market' with an art-gallery library photograph and no 'It is not this venue'
 * line. True under both of Lawal's rulings on covers, so it rides while the cover question waits for him.
 */
describe('a night’s own photograph', () => {
  it('is an organiser’s upload or an authorised one, never a library shot, our typographic cover or a placeholder', () => {
    expect(isOwnPhoto('https://x.supabase.co/storage/v1/object/public/event-images/org/e1/cover.avif')).toBe(true)
    expect(isOwnPhoto('https://x.supabase.co/storage/v1/object/public/event-images/stock/categories/arts/gallery-day-1440.avif')).toBe(false)
    expect(isOwnPhoto('https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/e1.png')).toBe(false)
    expect(isOwnPhoto('https://picsum.photos/400')).toBe(false)
    expect(isOwnPhoto(null)).toBe(false)
  })
})
