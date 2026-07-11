import { describe, expect, test } from 'vitest'
import { parseShowcaseEmbeds, MAX_SHOWCASE_EMBEDS } from '@/lib/marketplace/showcase'

/**
 * Showcase embed validation rides the Event Media Standard allowlist
 * (parseVideoEmbed): only provider URLs become embeds, markup and
 * non-allowlisted hosts are rejected, and the six-link cap holds.
 */
describe('parseShowcaseEmbeds', () => {
  test('accepts allowlisted providers and canonicalises the embed URL', () => {
    const res = parseShowcaseEmbeds([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.instagram.com/reel/Cxyz12345Ab/',
      'https://www.tiktok.com/@comic/video/7284918273645081234',
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.embeds).toHaveLength(3)
    expect(res.embeds[0].provider).toBe('youtube')
    expect(res.embeds[0].embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(res.embeds[1].provider).toBe('instagram')
    expect(res.embeds[2].provider).toBe('tiktok')
  })

  test('rejects a non-allowlisted host, naming the offending URL', () => {
    const res = parseShowcaseEmbeds(['https://example.com/video/123'])
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('example.com')
  })

  test('rejects pasted markup and script vectors', () => {
    for (const bad of [
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ]) {
      const res = parseShowcaseEmbeds([bad])
      expect(res.ok).toBe(false)
    }
  })

  test('caps at six links', () => {
    const urls = Array.from(
      { length: MAX_SHOWCASE_EMBEDS + 1 },
      (_, i) => `https://www.youtube.com/watch?v=AAAAAAAAAA${i}`,
    )
    const res = parseShowcaseEmbeds(urls)
    expect(res.ok).toBe(false)
  })

  test('empty and whitespace-only lines are ignored, empty set is valid', () => {
    const res = parseShowcaseEmbeds(['', '   '])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.embeds).toHaveLength(0)
  })
})
