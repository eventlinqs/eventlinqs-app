import { describe, expect, test } from 'vitest'
import { classifyStreamLink, isAcceptableStreamLink, STREAM_LINK_MAX_LENGTH } from '@/lib/stream/embed'

/**
 * Scope v5 3.11 names four stream sources: YouTube Live, Zoom, StreamYard and
 * custom RTMP. Each renders differently on the watch page, so the classifier
 * must sort them correctly and must refuse anything that could carry markup.
 */
describe('classifyStreamLink', () => {
  test('YouTube watch, short and live links embed through the allowlisted parser', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
    ]) {
      const r = classifyStreamLink(url)
      expect(r.ok).toBe(true)
      if (r.ok && (r.kind === 'youtube' || r.kind === 'vimeo')) {
        expect(r.kind).toBe('youtube')
        expect(r.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
      } else {
        throw new Error(`expected an embed for ${url}`)
      }
    }
  })

  test('Vimeo embeds through the same parser', () => {
    const r = classifyStreamLink('https://vimeo.com/123456789')
    expect(r.ok && r.kind === 'vimeo' && r.embedUrl === 'https://player.vimeo.com/video/123456789').toBe(true)
  })

  test('Zoom and StreamYard are meetings that open in their own app', () => {
    const zoom = classifyStreamLink('https://us02web.zoom.us/j/1234567890?pwd=abc')
    expect(zoom.ok && zoom.kind === 'zoom').toBe(true)
    const sy = classifyStreamLink('https://streamyard.com/watch/abcdef')
    expect(sy.ok && sy.kind === 'streamyard').toBe(true)
  })

  test('rtmp and rtmps addresses are kept as addresses, never opened as pages', () => {
    for (const url of ['rtmp://live.example.com/app/key', 'rtmps://live.example.com:443/app/key']) {
      const r = classifyStreamLink(url)
      expect(r.ok && r.kind === 'rtmp' && r.url === url).toBe(true)
    }
  })

  test('any other https page is a plain link', () => {
    const r = classifyStreamLink('https://stream.example.org/night')
    expect(r.ok && r.kind === 'link').toBe(true)
  })

  test('markup, scripts and non-web schemes are refused', () => {
    for (const bad of [
      '',
      '   ',
      '<iframe src="https://x"></iframe>',
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://files.example.com/x',
      'not a url',
      'https://x.example/?onload=1',
      `https://x.example/${'a'.repeat(STREAM_LINK_MAX_LENGTH)}`,
    ]) {
      expect(classifyStreamLink(bad).ok, bad.slice(0, 40)).toBe(false)
      expect(isAcceptableStreamLink(bad), bad.slice(0, 40)).toBe(false)
    }
  })

  test('surrounding whitespace is trimmed rather than refused', () => {
    const r = classifyStreamLink('  https://youtu.be/dQw4w9WgXcQ  ')
    expect(r.ok && r.kind === 'youtube').toBe(true)
  })
})
