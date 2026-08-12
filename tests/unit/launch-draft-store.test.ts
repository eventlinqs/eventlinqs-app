import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The draft store round trip, against a fake Redis that honours TTL.
 *
 * This exists because the first cut of the store wrote to a table behind an
 * unapplied migration, so every one of these functions returned null in every
 * environment and NOTHING tested the round trip. The bookmarkable link the
 * founder ruled on did not work and no test said so.
 *
 * So the assertions here are behavioural, not structural: save then read by
 * code, save then read by token, claim, and the three refusals that protect
 * somebody else's draft.
 */

type Entry = { value: unknown; expiresAt: number }

class FakeRedis {
  store = new Map<string, Entry>()
  now = 1_000_000

  private live(key: string): Entry | null {
    const e = this.store.get(key)
    if (!e) return null
    if (e.expiresAt <= this.now) {
      this.store.delete(key)
      return null
    }
    return e
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.live(key)?.value as T) ?? null
  }

  async setex(key: string, seconds: number, value: unknown): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: this.now + seconds })
    return 'OK'
  }

  async ttl(key: string): Promise<number> {
    const e = this.live(key)
    return e ? Math.ceil(e.expiresAt - this.now) : -2
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.live(key)?.value ?? 0) + 1
    // A bare incr has no expiry until one is set, which is the real semantic.
    this.store.set(key, { value: next, expiresAt: this.live(key)?.expiresAt ?? Infinity })
    return next
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key)
    if (!e) return 0
    e.expiresAt = this.now + seconds
    return 1
  }

  /** Advance the clock, so expiry is tested rather than assumed. */
  advanceDays(days: number): void {
    this.now += days * 24 * 60 * 60
  }
}

let redis: FakeRedis | null = new FakeRedis()

vi.mock('@/lib/redis/client', () => ({
  getRedisClient: vi.fn(() => redis),
}))

const {
  saveDraft,
  readDraftByCode,
  readDraftByToken,
  claimDraft,
  isClaimed,
  mintKitCode,
  mintKitToken,
  isKitCode,
  KIT_DRAFT_TTL_SECONDS,
  countSessionCompose,
  KIT_SESSION_DAILY_CAP,
  attachDraftCover,
} = await import('@/lib/launch/draft-store')

const payload = {
  title: "Ruby's 16th",
  summary: 'A sixteenth at home.',
  description: 'A sixteenth at home.',
  startDate: '2026-09-20T18:00',
  endDate: '2026-09-20T23:00',
  venueName: 'our place',
  venueSuburb: 'Belmont',
  venueCity: 'Geelong',
  categoryName: 'Community',
  isFree: true,
  price: null,
  capacity: 40,
  billNames: [],
  visibility: 'unlisted' as const,
  visibilityReason: 'This one stays off the public listings.',
  addressHeldBack: true,
  coverUrl: null,
  sourceText: "Ruby's 16th, Saturday 20th, 6pm at our place in Belmont, about 40 kids, no charge",
  unresolved: [],
}

beforeEach(() => {
  redis = new FakeRedis()
})

describe('the 30-day bookmarkable link', () => {
  it('saves and reads back by the shareable code', async () => {
    const code = mintKitCode()
    const token = mintKitToken()
    const saved = await saveDraft({ code, token, payload })

    expect(saved).not.toBeNull()
    expect(saved!.code).toBe(code)

    const read = await readDraftByCode(code)
    expect(read?.payload.title).toBe("Ruby's 16th")
    expect(read?.payload.visibility).toBe('unlisted')
  })

  it('lives for 30 days and not a day more', async () => {
    const code = mintKitCode()
    await saveDraft({ code, token: mintKitToken(), payload })

    expect(KIT_DRAFT_TTL_SECONDS).toBe(30 * 24 * 60 * 60)

    redis!.advanceDays(29)
    expect(await readDraftByCode(code)).not.toBeNull()

    redis!.advanceDays(2)
    expect(await readDraftByCode(code)).toBeNull()
  })

  it('mints codes that pass the code validator', () => {
    for (let i = 0; i < 50; i += 1) expect(isKitCode(mintKitCode())).toBe(true)
  })

  it('refuses a malformed code without touching the store', async () => {
    expect(await readDraftByCode('../../etc/passwd')).toBeNull()
    expect(await readDraftByCode('SHOUTING1234')).toBeNull()
  })
})

describe('ownership by token', () => {
  it('reads the draft this browser owns', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })

    const mine = await readDraftByToken(token)
    expect(mine?.payload.title).toBe("Ruby's 16th")
  })

  it('another browser token opens nothing', async () => {
    await saveDraft({ code: mintKitCode(), token: mintKitToken(), payload })
    expect(await readDraftByToken(mintKitToken())).toBeNull()
  })

  it('re-saving with the same token keeps ONE link rather than minting a second', async () => {
    const token = mintKitToken()
    const first = await saveDraft({ code: mintKitCode(), token, payload })
    const second = await saveDraft({
      code: mintKitCode(),
      token,
      payload: { ...payload, title: 'Edited' },
    })

    expect(second!.code).toBe(first!.code)
    expect((await readDraftByCode(first!.code))?.payload.title).toBe('Edited')
  })

  it('stores only the hash of the token, never the token', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })
    const dumped = JSON.stringify([...redis!.store.entries()])
    expect(dumped).not.toContain(token)
  })
})

describe('claiming a draft at signup', () => {
  it('attaches the draft to the account', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })

    const claimed = await claimDraft(token, 'user-1')
    expect(isClaimed(claimed)).toBe(true)
    expect(claimed!.claimedBy).toBe('user-1')
  })

  it('is idempotent for the same user', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })
    await claimDraft(token, 'user-1')
    expect((await claimDraft(token, 'user-1'))?.claimedBy).toBe('user-1')
  })

  it('never steals a draft already claimed by somebody else', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })
    await claimDraft(token, 'user-1')

    expect(await claimDraft(token, 'user-2')).toBeNull()
    expect((await readDraftByToken(token))?.claimedBy).toBe('user-1')
  })

  it('preserves the remaining life rather than resetting it', async () => {
    const token = mintKitToken()
    const code = mintKitCode()
    await saveDraft({ code, token, payload })

    redis!.advanceDays(25)
    await claimDraft(token, 'user-1')

    // Claiming on day 25 must not buy another 30 days.
    redis!.advanceDays(6)
    expect(await readDraftByCode(code)).toBeNull()
  })
})

describe('the per-session cap', () => {
  it('allows a real organiser a generous number of rebuilds', async () => {
    const token = mintKitToken()
    for (let i = 1; i <= KIT_SESSION_DAILY_CAP; i += 1) {
      const r = await countSessionCompose(token)
      expect(r.ok).toBe(true)
    }
  })

  it('bites on the very next compose past the cap', async () => {
    const token = mintKitToken()
    for (let i = 0; i < KIT_SESSION_DAILY_CAP; i += 1) await countSessionCompose(token)
    expect((await countSessionCompose(token)).ok).toBe(false)
  })

  it('counts each browser separately, so one session cannot block another', async () => {
    const a = mintKitToken()
    const b = mintKitToken()
    for (let i = 0; i <= KIT_SESSION_DAILY_CAP; i += 1) await countSessionCompose(a)

    expect((await countSessionCompose(a)).ok).toBe(false)
    expect((await countSessionCompose(b)).ok).toBe(true)
  })

  it('resets after a day rather than locking a browser out forever', async () => {
    const token = mintKitToken()
    for (let i = 0; i <= KIT_SESSION_DAILY_CAP; i += 1) await countSessionCompose(token)
    expect((await countSessionCompose(token)).ok).toBe(false)

    redis!.advanceDays(1)
    expect((await countSessionCompose(token)).ok).toBe(true)
  })

  it('does not let a busy session push its own window out and evade the cap', async () => {
    const token = mintKitToken()
    // Use it steadily across the day; the window must still close on schedule.
    for (let i = 0; i < 10; i += 1) await countSessionCompose(token)
    const key = [...redis!.store.keys()].find(k => k.includes('kit:cap:'))!
    const firstExpiry = redis!.store.get(key)!.expiresAt
    for (let i = 0; i < 10; i += 1) await countSessionCompose(token)
    expect(redis!.store.get(key)!.expiresAt).toBe(firstExpiry)
  })

  it('fails OPEN with no Redis, because a blip must not stop a real organiser', async () => {
    redis = null
    expect((await countSessionCompose(mintKitToken())).ok).toBe(true)
  })
})

/**
 * The artwork upload writes to somebody's draft from an UNAUTHENTICATED
 * endpoint, so the ownership rule is the whole security model and needs
 * behavioural tests rather than a comment claiming it holds.
 */
describe('attachDraftCover: ownership, not the code in the URL', () => {
  beforeEach(() => {
    redis = new FakeRedis()
  })

  const cover = {
    coverUrl: 'https://example.supabase.co/storage/v1/object/public/kit-draft-covers/x/cover.webp',
    coverPath: 'x/cover.webp',
  }

  it('attaches artwork to the draft the token owns', async () => {
    const token = mintKitToken()
    const saved = (await saveDraft({ code: mintKitCode(), token, payload }))!
    const updated = await attachDraftCover({ token, code: saved.code, ...cover })
    expect(updated).not.toBeNull()
    expect(updated!.payload.coverUrl).toBe(cover.coverUrl)

    // And it is genuinely persisted, not just returned.
    const reread = await readDraftByCode(saved.code)
    expect(reread!.payload.coverUrl).toBe(cover.coverUrl)
  })

  it('REFUSES a token that owns a different draft, which is the whole point', async () => {
    // Mallory has composed her own kit, so she holds a valid cookie token. She
    // also has Ruby's code, because the code is designed to be shared. That
    // must not be enough to write artwork onto Ruby's poster.
    const ruby = mintKitToken()
    const rubysDraft = (await saveDraft({ code: mintKitCode(), token: ruby, payload }))!
    const mallory = mintKitToken()
    await saveDraft({ code: mintKitCode(), token: mallory, payload })

    const attempt = await attachDraftCover({ token: mallory, code: rubysDraft.code, ...cover })
    expect(attempt).toBeNull()

    const untouched = await readDraftByCode(rubysDraft.code)
    expect(untouched!.payload.coverUrl).toBeNull()
  })

  it('refuses a token that owns nothing at all', async () => {
    const draft = (await saveDraft({ code: mintKitCode(), token: mintKitToken(), payload }))!
    expect(await attachDraftCover({ token: mintKitToken(), code: draft.code, ...cover })).toBeNull()
  })

  it('refuses a code that is not a kit code', async () => {
    const token = mintKitToken()
    await saveDraft({ code: mintKitCode(), token, payload })
    expect(await attachDraftCover({ token, code: '../../etc/passwd', ...cover })).toBeNull()
  })

  it('PRESERVES the remaining life rather than resetting it', async () => {
    // Uploading on day 29 must not quietly extend the draft to day 59, because
    // the object sweep is sized against the draft's own life.
    const token = mintKitToken()
    const draft = (await saveDraft({ code: mintKitCode(), token, payload }))!
    redis!.advanceDays(29)

    const updated = await attachDraftCover({ token, code: draft.code, ...cover })
    expect(updated).not.toBeNull()

    const ttl = await redis!.ttl(`kit:d:${draft.code}`)
    expect(ttl).toBeLessThanOrEqual(KIT_DRAFT_TTL_SECONDS - 29 * 24 * 60 * 60)
    expect(ttl).toBeGreaterThan(0)
  })
})

describe('when Redis is not configured', () => {
  beforeEach(() => {
    redis = null
  })

  it('degrades to no persistence instead of throwing at a visitor', async () => {
    await expect(saveDraft({ code: mintKitCode(), token: mintKitToken(), payload })).resolves.toBeNull()
    await expect(readDraftByCode(mintKitCode())).resolves.toBeNull()
    await expect(readDraftByToken(mintKitToken())).resolves.toBeNull()
    await expect(claimDraft(mintKitToken(), 'user-1')).resolves.toBeNull()
  })
})
