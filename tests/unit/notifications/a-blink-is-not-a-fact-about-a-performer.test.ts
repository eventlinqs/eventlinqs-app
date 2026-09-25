import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE MARKETPLACE NOTIFICATION ROUTER, WHEN A READ DOES NOT ANSWER.
 *
 * Lane B raised this file as a BORDER on 21 September 2026 and stopped at it,
 * because the notification router belongs to lane C: five reads discarded their
 * error, and each one turned a database blink into a sentence about a person.
 *
 *   the dedupe read      null means "never sent", so it sends again. The
 *                        module's own promise is "one per (user, type,
 *                        subject), ever" and its header opens on the Spam Act.
 *   the prefs read       null means "no row", so DEFAULT_PREFS, so an alert to
 *                        somebody who may have switched them off.
 *   the devices read     null means "no devices", and with email off that came
 *                        back as `opted_out`: a claim about a person's choices
 *                        written from a failed query. It was also unbounded.
 *   the address read     null means `no_email`, about an account that has one.
 *   the performers read  `?? []` means "nobody in that city matched the gig".
 *
 * Every test below drives `dispatchMarketplaceAlert` against a stubbed
 * PostgREST that fails exactly one read, and asserts BOTH halves: the result
 * the caller is given, and whether anything was actually sent. A result that
 * says the right word while a duplicate goes out is not a fix.
 */

const sendEmail = vi.fn(async () => undefined)
const sendWebPush = vi.fn(async () => ({ ok: true, gone: false }))
const isPushConfigured = vi.fn(() => true)

vi.mock('@/lib/email/send', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...(args as [])) }))
vi.mock('@/lib/notifications/web-push', () => ({
  isPushConfigured: () => isPushConfigured(),
  sendWebPush: (...args: unknown[]) => sendWebPush(...(args as [])),
}))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://eventlinqs.test' }))
vi.mock('@/lib/email/sender', () => ({ contactAddress: () => 'hello@eventlinqs.test' }))

const { dispatchMarketplaceAlert, notifyMatchingPerformers } = await import('@/lib/marketplace/notify')

type Result = { data: unknown; error: unknown }
type Plan = Record<string, Result | ((call: number) => Result)>

/** `permission denied` is deliberately NOT a transient pool error, so the
 *  retry in withBuildRetry returns immediately and no test waits on a backoff. */
const READ_FAILED = { message: 'permission denied for table', code: '42501' }

/**
 * A PostgREST stub that is chainable and thenable, keyed `table.operation`.
 * Every builder method returns `this`, which is what the real client does, so
 * the module under test is not written differently to be testable.
 */
function stubAdmin(plan: Plan) {
  const calls: Record<string, number> = {}
  const resolveFor = (key: string): Result => {
    calls[key] = (calls[key] ?? 0) + 1
    const entry = plan[key]
    if (entry === undefined) return { data: null, error: null }
    return typeof entry === 'function' ? entry(calls[key]) : entry
  }
  class Query {
    constructor(private readonly key: string) {}
    select() { return this }
    eq() { return this }
    in() { return this }
    not() { return this }
    contains() { return this }
    order() { return this }
    range() { return this }
    limit() { return this }
    maybeSingle() { return this }
    single() { return this }
    then(onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) {
      return Promise.resolve(resolveFor(this.key)).then(onOk, onErr)
    }
  }
  const admin = {
    from: (table: string) => ({
      select: () => new Query(`${table}.select`),
      insert: () => new Query(`${table}.insert`),
      delete: () => new Query(`${table}.delete`),
      update: () => new Query(`${table}.update`),
    }),
    calls,
  }
  return admin as unknown as Parameters<typeof dispatchMarketplaceAlert>[0]['admin'] & { calls: Record<string, number> }
}

const ALERT = {
  userId: 'user-1',
  type: 'gig_posted' as const,
  subjectId: 'gig-1',
  title: 'New gig in your city',
  body: 'A gig is open for applications.',
  url: '/gigs/gig-1',
  ctaLabel: 'View the gig',
}

/** One device, then an empty page, which is what readEveryRow pages towards. */
const ONE_DEVICE = (call: number): Result =>
  call === 1
    ? { data: [{ endpoint: 'https://push.test/abc', p256dh: 'k', auth: 'a' }], error: null }
    : { data: [], error: null }

const NO_DEVICES = (): Result => ({ data: [], error: null })

beforeEach(() => {
  sendEmail.mockClear()
  sendWebPush.mockClear()
  sendWebPush.mockResolvedValue({ ok: true, gone: false })
  isPushConfigured.mockReturnValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a blink is not a fact about a performer', () => {
  it('sends, and records the send, when every read answers', async () => {
    const admin = stubAdmin({ 'push_subscriptions.select': ONE_DEVICE })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'sent', channel: 'push' })
    expect(sendWebPush).toHaveBeenCalledTimes(1)
    expect(admin.calls['notifications.insert']).toBe(1)
  })

  it('refuses rather than sending a second copy when the dedupe read fails', async () => {
    const admin = stubAdmin({
      'notifications.select': { data: null, error: READ_FAILED },
      'push_subscriptions.select': ONE_DEVICE,
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'read_failed' })
    // The half that matters: nothing went out, and nothing was written down.
    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(admin.calls['notifications.insert']).toBeUndefined()
  })

  it('still calls a real duplicate a duplicate', async () => {
    const admin = stubAdmin({ 'notifications.select': { data: { id: 'n-1' }, error: null } })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'duplicate' })
    expect(sendWebPush).not.toHaveBeenCalled()
  })

  it('does not treat a failed preferences read as consent', async () => {
    const admin = stubAdmin({
      'notification_prefs.select': { data: null, error: READ_FAILED },
      'push_subscriptions.select': ONE_DEVICE,
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'read_failed' })
    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('keeps DEFAULT_PREFS for a person who simply has no preferences row', async () => {
    const admin = stubAdmin({
      'notification_prefs.select': { data: null, error: null },
      'push_subscriptions.select': ONE_DEVICE,
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'sent', channel: 'push' })
  })

  /**
   * The devices read is the one failure this module degrades through rather
   * than refusing, and the reason is in the code: a gig is posted once and this
   * dispatcher runs once, so refusing is permanent silence with nothing gained,
   * while email is the declared backbone behind push.
   */
  it('degrades to email when the devices read fails and email is on', async () => {
    const admin = stubAdmin({
      'push_subscriptions.select': { data: null, error: READ_FAILED },
      'profiles.select': { data: { email: 'performer@eventlinqs.test' }, error: null },
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'sent', channel: 'email' })
    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does not call a failed devices read an opt-out when email is off', async () => {
    const admin = stubAdmin({
      'notification_prefs.select': {
        data: { push_enabled: true, email_enabled: false, quiet_hours_start: null, quiet_hours_end: null, timezone: 'Australia/Melbourne' },
        error: null,
      },
      'push_subscriptions.select': { data: null, error: READ_FAILED },
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'read_failed' })
  })

  it('still calls a real opt-out an opt-out', async () => {
    const admin = stubAdmin({
      'notification_prefs.select': {
        data: { push_enabled: false, email_enabled: false, quiet_hours_start: null, quiet_hours_end: null, timezone: 'Australia/Melbourne' },
        error: null,
      },
      'push_subscriptions.select': NO_DEVICES,
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'opted_out' })
  })

  it('does not say a person has no address when the address read failed', async () => {
    const admin = stubAdmin({
      'push_subscriptions.select': NO_DEVICES,
      'profiles.select': { data: null, error: READ_FAILED },
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'read_failed' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('still says no_email about a person who genuinely has none', async () => {
    const admin = stubAdmin({
      'push_subscriptions.select': NO_DEVICES,
      'profiles.select': { data: { email: null }, error: null },
    })
    const result = await dispatchMarketplaceAlert({ admin, ...ALERT })

    expect(result).toEqual({ status: 'skipped', reason: 'no_email' })
  })

  it('pages the devices read rather than taking one PostgREST window', async () => {
    const admin = stubAdmin({ 'push_subscriptions.select': ONE_DEVICE })
    await dispatchMarketplaceAlert({ admin, ...ALERT })

    // Two windows: the one that returned a device and the empty one that ends
    // the paging. An unbounded single read would have asked exactly once.
    expect(admin.calls['push_subscriptions.select']).toBe(2)
  })
})

describe('notifyMatchingPerformers', () => {
  it('does not report that nobody matched when the read failed', async () => {
    const admin = stubAdmin({ 'artists.select': { data: null, error: READ_FAILED } })
    const gig = { id: 'gig-1', title: 'Friday night', city_slug: 'geelong', performance_type: 'dj' }

    await expect(
      notifyMatchingPerformers(admin, gig as Parameters<typeof notifyMatchingPerformers>[1]),
    ).rejects.toThrow()
  })

  it('reports zero when nobody genuinely matched', async () => {
    const admin = stubAdmin({ 'artists.select': { data: [], error: null } })
    const gig = { id: 'gig-1', title: 'Friday night', city_slug: 'geelong', performance_type: 'dj' }

    await expect(
      notifyMatchingPerformers(admin, gig as Parameters<typeof notifyMatchingPerformers>[1]),
    ).resolves.toBe(0)
  })
})
