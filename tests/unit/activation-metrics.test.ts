import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  trackKitStarted,
  trackKitRendered,
  trackEventPublishedServer,
  trackEmailCapturedAfterRenderServer,
} from '@/lib/analytics/plausible'
import { KIT_DRAFT_COOKIE, isKitDraftToken } from '@/lib/growth/kit-draft'

/**
 * C2: the four creation-funnel activation metrics. These tests prove each
 * instrument emits the exact event name and payload Plausible receives, and
 * that the after-render email capture can only fire on a well-formed kit
 * draft cookie, never on junk.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('client activation events (kit_started, kit_rendered)', () => {
  it('kit_started fires with the mode', () => {
    const plausible = vi.fn()
    vi.stubGlobal('window', { plausible })
    trackKitStarted({ mode: 'wizard' })
    expect(plausible).toHaveBeenCalledExactlyOnceWith('kit_started', {
      props: { mode: 'wizard' },
    })
  })

  it('kit_started carries the magic_start mode', () => {
    const plausible = vi.fn()
    vi.stubGlobal('window', { plausible })
    trackKitStarted({ mode: 'magic_start' })
    expect(plausible).toHaveBeenCalledExactlyOnceWith('kit_started', {
      props: { mode: 'magic_start' },
    })
  })

  it('kit_rendered fires with the event id and the delivery flag', () => {
    const plausible = vi.fn()
    vi.stubGlobal('window', { plausible })
    trackKitRendered({ event_id: 'evt-1', just_published: 1 })
    expect(plausible).toHaveBeenCalledExactlyOnceWith('kit_rendered', {
      props: { event_id: 'evt-1', just_published: 1 },
    })
  })

  it('client events no-op cleanly with no window (SSR)', () => {
    expect(() => trackKitStarted({ mode: 'wizard' })).not.toThrow()
  })
})

describe('server activation events (event_published, email_captured_after_render)', () => {
  it('event_published posts the exact Plausible payload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    await trackEventPublishedServer('https://eventlinqs.com/events/test-slug', {
      event_id: 'evt-9',
      is_free: 1,
      first_publish: 1,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://plausible.io/api/event')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.name).toBe('event_published')
    expect(body.domain).toBe('eventlinqs.com')
    expect(body.url).toBe('https://eventlinqs.com/events/test-slug')
    expect(body.props).toEqual({ event_id: 'evt-9', is_free: 1, first_publish: 1 })
  })

  it('email_captured_after_render posts the exact Plausible payload', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    await trackEmailCapturedAfterRenderServer('https://eventlinqs.com/launch', {
      source: 'launch_composer',
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.name).toBe('email_captured_after_render')
    expect(body.props).toEqual({ source: 'launch_composer' })
  })

  it('a network failure never throws into the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      trackEventPublishedServer('https://eventlinqs.com/events/x', {
        event_id: 'e',
        is_free: 0,
        first_publish: 0,
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})

describe('the kit-draft cookie guard (qualifies email_captured_after_render)', () => {
  it('names the cookie the /launch composer will set', () => {
    expect(KIT_DRAFT_COOKIE).toBe('el_kit_draft')
  })

  it('accepts a well-formed opaque token', () => {
    expect(isKitDraftToken('AbC123_-xyz789QRSTuv')).toBe(true)
    expect(isKitDraftToken('a'.repeat(16))).toBe(true)
    expect(isKitDraftToken('a'.repeat(128))).toBe(true)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(129)],
    ['spaces', 'abcd efgh ijkl mnop'],
    ['html injection', '<script>alert(1)</script>'],
    ['quotes', '"aaaaaaaaaaaaaaaaaa"'],
    ['semicolon smuggling', 'aaaaaaaaaaaaaaaa;Path=/'],
  ])('rejects %s', (_label, value) => {
    expect(isKitDraftToken(value as string | null | undefined)).toBe(false)
  })
})
