import { describe, it, expect } from 'vitest'
import { parseVideoEmbed, isVideoProvider } from '@/lib/media/video-embed'

describe('parseVideoEmbed - allowlisted providers', () => {
  it('parses a youtube watch URL to a nocookie embed', () => {
    const r = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.video.provider).toBe('youtube')
      expect(r.video.id).toBe('dQw4w9WgXcQ')
      expect(r.video.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    }
  })

  it('parses youtu.be short links', () => {
    const r = parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')
    expect(r.ok && r.video.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('parses youtube shorts', () => {
    const r = parseVideoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')
    expect(r.ok && r.video.id).toBe('dQw4w9WgXcQ')
  })

  it('parses a vimeo URL', () => {
    const r = parseVideoEmbed('https://vimeo.com/123456789')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.video.provider).toBe('vimeo')
      expect(r.video.embedUrl).toBe('https://player.vimeo.com/video/123456789')
    }
  })

  it('parses an instagram reel', () => {
    const r = parseVideoEmbed('https://www.instagram.com/reel/CabcDEF123/')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.video.provider).toBe('instagram')
      expect(r.video.embedUrl).toBe('https://www.instagram.com/p/CabcDEF123/embed')
    }
  })

  it('parses a canonical tiktok video URL', () => {
    const r = parseVideoEmbed('https://www.tiktok.com/@someone/video/7212345678901234567')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.video.provider).toBe('tiktok')
      expect(r.video.embedUrl).toBe('https://www.tiktok.com/embed/v2/7212345678901234567')
    }
  })
})

describe('parseVideoEmbed - rejections', () => {
  it('rejects a raw iframe (stored XSS vector)', () => {
    const r = parseVideoEmbed('<iframe src="https://evil.example/x"></iframe>')
    expect(r.ok).toBe(false)
  })

  it('rejects a script / javascript URL', () => {
    expect(parseVideoEmbed('javascript:alert(1)').ok).toBe(false)
    expect(parseVideoEmbed('https://youtube.com/watch?v=x" onload="alert(1)').ok).toBe(false)
  })

  it('rejects a non-allowlisted host', () => {
    expect(parseVideoEmbed('https://dailymotion.com/video/x9abc').ok).toBe(false)
    expect(parseVideoEmbed('https://evil.example/embed/123').ok).toBe(false)
  })

  it('rejects a tiktok short-link that cannot be resolved without a network hop', () => {
    expect(parseVideoEmbed('https://vm.tiktok.com/ZMabcd/').ok).toBe(false)
  })

  it('rejects empty / non-URL input', () => {
    expect(parseVideoEmbed('').ok).toBe(false)
    expect(parseVideoEmbed('not a url').ok).toBe(false)
    expect(parseVideoEmbed(null).ok).toBe(false)
  })
})

describe('isVideoProvider', () => {
  it('accepts the four providers and rejects anything else', () => {
    expect(isVideoProvider('youtube')).toBe(true)
    expect(isVideoProvider('tiktok')).toBe(true)
    expect(isVideoProvider('dailymotion')).toBe(false)
    expect(isVideoProvider(null)).toBe(false)
  })
})
