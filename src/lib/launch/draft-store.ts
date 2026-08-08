import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
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
 *         Only its SHA-256 is stored, so a database reader cannot mint one.
 *
 * DEGRADES GRACEFULLY. Migration 20260809000001 is applied by the founder, not
 * by this code. Until it lands every function here fails soft: the composer
 * still renders a complete kit from the payload it already holds in the
 * request, and only cross-device persistence is unavailable. Nothing throws at
 * a visitor.
 */

export const KIT_CODE_LENGTH = 12

/** Unambiguous alphabet: no 0/O, no 1/l/I, so a code survives being read aloud. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

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

export function isKitCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && new RegExp(`^[${CODE_ALPHABET}]{${KIT_CODE_LENGTH}}$`).test(value)
}

/**
 * True when the failure is "the table does not exist yet". Postgres 42P01.
 * Any other error is a real fault and is logged rather than swallowed.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .*kit_drafts.* does not exist/i.test(error.message ?? '')
}

function warn(scope: string, error: unknown): void {
  if (isMissingTable(error as { code?: string })) {
    // Expected before the founder applies the migration. Not an error.
    return
  }
  console.error(`[launch.draft-store] ${scope}:`, error)
}

/**
 * Persist a draft. Returns null when the store is unavailable, which the
 * caller treats as "no cross-device persistence", never as a failure.
 */
export async function saveDraft(opts: {
  code: string
  token: string
  payload: KitDraftPayload
  coverPath?: string | null
}): Promise<KitDraft | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('kit_drafts')
      .upsert(
        {
          code: opts.code,
          token_hash: hashToken(opts.token),
          payload: opts.payload as unknown as Record<string, unknown>,
          cover_path: opts.coverPath ?? null,
        },
        { onConflict: 'token_hash' },
      )
      .select('id, code, payload, claimed_by, expires_at')
      .maybeSingle()

    if (error) {
      warn('saveDraft', error)
      return null
    }
    if (!data) return null
    return {
      id: data.id as string,
      code: data.code as string,
      payload: data.payload as unknown as KitDraftPayload,
      claimedBy: (data.claimed_by as string | null) ?? null,
      expiresAt: data.expires_at as string,
    }
  } catch (err) {
    warn('saveDraft', err)
    return null
  }
}

/** Read a draft by its shareable code. Read access only. */
export async function readDraftByCode(code: string): Promise<KitDraft | null> {
  if (!isKitCode(code)) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('kit_drafts')
      .select('id, code, payload, claimed_by, expires_at')
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (error) {
      warn('readDraftByCode', error)
      return null
    }
    if (!data) return null
    return {
      id: data.id as string,
      code: data.code as string,
      payload: data.payload as unknown as KitDraftPayload,
      claimedBy: (data.claimed_by as string | null) ?? null,
      expiresAt: data.expires_at as string,
    }
  } catch (err) {
    warn('readDraftByCode', err)
    return null
  }
}

/** Read the draft this browser OWNS, by cookie token. Required to edit. */
export async function readDraftByToken(token: string): Promise<KitDraft | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('kit_drafts')
      .select('id, code, payload, claimed_by, expires_at')
      .eq('token_hash', hashToken(token))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (error) {
      warn('readDraftByToken', error)
      return null
    }
    if (!data) return null
    return {
      id: data.id as string,
      code: data.code as string,
      payload: data.payload as unknown as KitDraftPayload,
      claimedBy: (data.claimed_by as string | null) ?? null,
      expiresAt: data.expires_at as string,
    }
  } catch (err) {
    warn('readDraftByToken', err)
    return null
  }
}

/**
 * Attach a draft to an account at signup. Idempotent: claiming an
 * already-claimed draft by the same user is a no-op, and claiming one owned by
 * somebody else does nothing rather than stealing it.
 */
export async function claimDraft(token: string, userId: string): Promise<KitDraft | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('kit_drafts')
      .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq('token_hash', hashToken(token))
      .is('claimed_by', null)
      .select('id, code, payload, claimed_by, expires_at')
      .maybeSingle()
    if (error) {
      warn('claimDraft', error)
      return null
    }
    if (!data) return null
    return {
      id: data.id as string,
      code: data.code as string,
      payload: data.payload as unknown as KitDraftPayload,
      claimedBy: (data.claimed_by as string | null) ?? null,
      expiresAt: data.expires_at as string,
    }
  } catch (err) {
    warn('claimDraft', err)
    return null
  }
}

/** True when a draft has been claimed, which is what unlocks downloads. */
export function isClaimed(draft: KitDraft | null): boolean {
  return Boolean(draft?.claimedBy)
}
