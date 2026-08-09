import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getRedisClient } from '@/lib/redis/client'
import type { EventVisibility } from '@/types/database'

/**
 * The public composer's draft store.
 *
 * Founder ruling 9 August 2026 (0.2c): a bookmarkable link, 30 days, no
 * account. Two identifiers, and the distinction matters:
 *
 *   CODE  is meant to be SHARED. It appears in /launch/k/[code], it is what a
 *         person bookmarks or sends to a co-organiser, and holding it grants
 *         READ access to the kit.
 *   TOKEN is meant to prove OWNERSHIP. It lives in the httpOnly el_kit_draft
 *         cookie, never appears in a URL, and is required to EDIT or CLAIM.
 *         Only its SHA-256 is stored, so a store reader cannot mint one.
 *
 * ---------------------------------------------------------------------------
 * WHY REDIS AND NOT A TABLE.
 *
 * The first cut of this file wrote to a `kit_drafts` table behind migration
 * 20260809000001. That migration was never applied, so every persistence
 * function returned null and the bookmarkable link the ruling asks for did not
 * exist. The build brief also forbids writing a migration at all, so the table
 * route cannot close the ruling by itself.
 *
 * Redis closes it with no schema change, and it is the better fit on the
 * merits rather than merely the permitted one:
 *
 *   - A draft is inherently ephemeral. The 30-day life IS a TTL, so `setex`
 *     expresses the requirement directly and there is no nightly sweep to
 *     write, schedule, monitor, or get wrong. Phase 0 specified that sweep;
 *     this removes the need for it.
 *   - The store is already a production dependency (rate limits, the fee
 *     cache, feature flags) and is declared in the env manifest.
 *   - Keys are namespaced by Supabase project ref in `redis/client.ts`, so a
 *     TEST draft can never be read by production.
 *
 * DEGRADES GRACEFULLY, unchanged. When Redis is not configured every function
 * here returns null, the composer still renders a complete kit from the
 * payload it holds in the request, and only cross-device persistence is
 * unavailable. Nothing throws at a visitor.
 */

/**
 * Re-exported from the isomorphic kit-code module so every existing server-side
 * import of these keeps working unchanged. They live there rather than here
 * because bill-ref.ts needs them in the CLIENT bundle, and importing them from
 * this server-only module failed the build.
 */
export { CODE_ALPHABET, KIT_CODE_LENGTH, isKitCode } from './kit-code'
import { CODE_ALPHABET, KIT_CODE_LENGTH, isKitCode } from './kit-code'

/** The founder ruling, in seconds. */
export const KIT_DRAFT_TTL_SECONDS = 30 * 24 * 60 * 60

export type KitDraftPayload = {
  title: string
  summary: string
  description: string
  /** Local "YYYY-MM-DDTHH:mm", no timezone, matching the extractor's contract. */
  startDate: string
  endDate: string
  venueName: string
  venueSuburb: string
  venueCity: string
  categoryName: string
  isFree: boolean
  price: number | null
  capacity: number | null
  /** Names the organiser typed for the bill. Never inferred: see the composer. */
  billNames: string[]
  visibility: EventVisibility
  visibilityReason: string
  /** True when the venue reads as a private residence and the street is held back. */
  addressHeldBack: boolean
  coverUrl: string | null
  /** What the organiser originally typed, kept so the kit can be rebuilt. */
  sourceText: string
  /** Flagged gaps the composer asks about, one plain question each. */
  unresolved: string[]
}

export type KitDraft = {
  id: string
  code: string
  payload: KitDraftPayload
  claimedBy: string | null
  expiresAt: string
}

/** What actually sits in Redis under the code key. */
type StoredDraft = {
  id: string
  code: string
  tokenHash: string
  payload: KitDraftPayload
  claimedBy: string | null
  coverPath: string | null
}

/** A shareable code. Unguessable at 31^12, and readable. */
export function mintKitCode(): string {
  const bytes = randomBytes(KIT_CODE_LENGTH)
  let out = ''
  for (let i = 0; i < KIT_CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return out
}

/** An ownership token for the cookie. Matches isKitDraftToken's contract. */
export function mintKitToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}


/* ------------------------------------------------------------------ */
/* Keys. Exported so tests assert the exact shape rather than guess it. */
/* ------------------------------------------------------------------ */

/** The draft itself, addressed by the code a person can share. */
export function draftKey(code: string): string {
  return `kit:d:${code}`
}

/**
 * The ownership index: token hash to code. A separate key rather than a scan,
 * because a scan over a shared store is both slow and a way to read other
 * people's drafts by accident.
 */
export function ownerKey(tokenHash: string): string {
  return `kit:t:${tokenHash}`
}

function warn(scope: string, error: unknown): void {
  console.error(`[launch.draft-store] ${scope}:`, error)
}

function toKitDraft(stored: StoredDraft, ttlSeconds: number): KitDraft {
  return {
    id: stored.id,
    code: stored.code,
    payload: stored.payload,
    claimedBy: stored.claimedBy,
    expiresAt: new Date(Date.now() + Math.max(ttlSeconds, 0) * 1000).toISOString(),
  }
}

/**
 * Persist a draft for 30 days. Returns null when the store is unavailable,
 * which the caller treats as "no cross-device persistence", never as a
 * failure.
 *
 * Re-saving with the SAME token overwrites the same draft rather than minting
 * a second one, so a person editing their kit keeps one link. That is the
 * upsert-on-token_hash behaviour the table version had.
 */
export async function saveDraft(opts: {
  code: string
  token: string
  payload: KitDraftPayload
  coverPath?: string | null
}): Promise<KitDraft | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const tokenHash = hashToken(opts.token)

    // Editing an existing draft keeps its original code and identity.
    const existingCode = await redis.get<string>(ownerKey(tokenHash))
    const code = typeof existingCode === 'string' && isKitCode(existingCode) ? existingCode : opts.code
    const existing = await redis.get<StoredDraft>(draftKey(code))

    const stored: StoredDraft = {
      id: existing?.id ?? randomBytes(16).toString('hex'),
      code,
      tokenHash,
      payload: opts.payload,
      claimedBy: existing?.claimedBy ?? null,
      coverPath: opts.coverPath ?? existing?.coverPath ?? null,
    }

    // Both keys carry the same life, so the index can never outlive the draft
    // it points at and leave a token resolving to nothing.
    await redis.setex(draftKey(code), KIT_DRAFT_TTL_SECONDS, stored)
    await redis.setex(ownerKey(tokenHash), KIT_DRAFT_TTL_SECONDS, code)

    return toKitDraft(stored, KIT_DRAFT_TTL_SECONDS)
  } catch (err) {
    warn('saveDraft', err)
    return null
  }
}

/** Read a draft by its shareable code. Read access only. */
export async function readDraftByCode(code: string): Promise<KitDraft | null> {
  if (!isKitCode(code)) return null
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const stored = await redis.get<StoredDraft>(draftKey(code))
    if (!stored) return null
    const ttl = await redis.ttl(draftKey(code))
    return toKitDraft(stored, typeof ttl === 'number' && ttl > 0 ? ttl : KIT_DRAFT_TTL_SECONDS)
  } catch (err) {
    warn('readDraftByCode', err)
    return null
  }
}

/** Read the draft this browser OWNS, by cookie token. Required to edit. */
export async function readDraftByToken(token: string): Promise<KitDraft | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const code = await redis.get<string>(ownerKey(hashToken(token)))
    if (typeof code !== 'string' || !isKitCode(code)) return null
    return await readDraftByCode(code)
  } catch (err) {
    warn('readDraftByToken', err)
    return null
  }
}

/**
 * Attach a draft to an account at signup. Idempotent: claiming an
 * already-claimed draft by the same user is a no-op, and claiming one owned by
 * somebody else does nothing rather than stealing it.
 *
 * The remaining TTL is preserved rather than reset, so claiming a draft on day
 * 29 does not quietly extend it to day 59.
 */
export async function claimDraft(token: string, userId: string): Promise<KitDraft | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const code = await redis.get<string>(ownerKey(hashToken(token)))
    if (typeof code !== 'string' || !isKitCode(code)) return null

    const stored = await redis.get<StoredDraft>(draftKey(code))
    if (!stored) return null

    // Already claimed by somebody else: do nothing rather than steal it.
    if (stored.claimedBy && stored.claimedBy !== userId) return null

    const ttlRaw = await redis.ttl(draftKey(code))
    const ttl = typeof ttlRaw === 'number' && ttlRaw > 0 ? ttlRaw : KIT_DRAFT_TTL_SECONDS

    const claimed: StoredDraft = { ...stored, claimedBy: userId }
    await redis.setex(draftKey(code), ttl, claimed)
    await redis.setex(ownerKey(stored.tokenHash), ttl, code)

    return toKitDraft(claimed, ttl)
  } catch (err) {
    warn('claimDraft', err)
    return null
  }
}

/**
 * Attach uploaded artwork to the draft this browser OWNS.
 *
 * Ownership, not auth: the caller must hold the httpOnly cookie token, exactly
 * as editing does. A CODE alone must never be enough to write to somebody's
 * draft, because the code is designed to be SHARED and a co-organiser holding a
 * bookmark is not the owner.
 *
 * Returns null when the token owns nothing, when it owns a DIFFERENT draft from
 * the code in the URL, or when the store is unavailable. The mismatch case is
 * the one that matters: without it, anybody who had ever composed a kit could
 * write artwork onto any code they could see.
 *
 * The remaining TTL is preserved rather than reset, so uploading on day 29 does
 * not quietly extend the draft to day 59, and the object sweep can rely on the
 * draft's own life.
 */
export async function attachDraftCover(opts: {
  token: string
  code: string
  coverUrl: string
  coverPath: string
}): Promise<KitDraft | null> {
  if (!isKitCode(opts.code)) return null
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const ownedCode = await redis.get<string>(ownerKey(hashToken(opts.token)))
    if (typeof ownedCode !== 'string' || ownedCode !== opts.code) return null

    const stored = await redis.get<StoredDraft>(draftKey(opts.code))
    if (!stored) return null

    const ttlRaw = await redis.ttl(draftKey(opts.code))
    const ttl = typeof ttlRaw === 'number' && ttlRaw > 0 ? ttlRaw : KIT_DRAFT_TTL_SECONDS

    const next: StoredDraft = {
      ...stored,
      coverPath: opts.coverPath,
      payload: { ...stored.payload, coverUrl: opts.coverUrl },
    }

    await redis.setex(draftKey(opts.code), ttl, next)
    await redis.setex(ownerKey(stored.tokenHash), ttl, opts.code)

    return toKitDraft(next, ttl)
  } catch (err) {
    warn('attachDraftCover', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/* The per-session cap                                                  */
/* ------------------------------------------------------------------ */

/**
 * Composes allowed per BROWSER per day, on top of the per-IP limits.
 *
 * The brief asks for "IP plus a per-session cap", and the pair does something
 * neither half does alone. Phase 0's finding was that per-IP limits fail in
 * both directions at once: too tight for real organisers, because Australian
 * carriers put thousands of genuine phones behind one address, and too loose
 * for an abuser, who rotates addresses by the gigabyte.
 *
 * A per-session cap is the opposite shape. It does not care how many people
 * share an address, so it lets the IP limits be generous enough not to break a
 * promoter on mobile data, while still bounding one browser hammering the
 * endpoint.
 *
 * Its known evasion, stated rather than hidden: clearing the cookie resets it.
 * That costs an abuser nothing and costs a real organiser their kit, which is
 * exactly why it is a companion to the IP limits and never a replacement.
 */
export const KIT_SESSION_DAILY_CAP = 40

/**
 * Count one compose against this browser's cap. Returns whether it is allowed.
 *
 * Fails OPEN, matching every other control on this surface except the email
 * send: the compose path spends no model tokens, so there is nothing here
 * worth protecting at the price of refusing a real organiser during a Redis
 * blip.
 */
export async function countSessionCompose(token: string): Promise<{ ok: boolean; used: number }> {
  const redis = getRedisClient()
  if (!redis) return { ok: true, used: 0 }

  try {
    const key = `kit:cap:${hashToken(token)}`
    const used = await redis.incr(key)
    // Set the window on first use only, so a busy session cannot keep pushing
    // its own expiry out and evade the cap by staying active.
    if (used === 1) await redis.expire(key, 24 * 60 * 60)
    return { ok: used <= KIT_SESSION_DAILY_CAP, used }
  } catch (err) {
    warn('countSessionCompose', err)
    return { ok: true, used: 0 }
  }
}

/** True when a draft has been claimed, which is what unlocks downloads. */
export function isClaimed(draft: KitDraft | null): boolean {
  return Boolean(draft?.claimedBy)
}
