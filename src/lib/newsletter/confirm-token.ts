import crypto from 'node:crypto'

/**
 * THE CITY GUIDE'S CONFIRMATION LINK (Release 2, item 8 of the Growth OS order: "the weekly email editions for Geelong
 * and Melbourne, double opt in, every send recorded"). The newsletter panel's form is the person's consent (ACMA, "Avoid
 * sending spam", acma.gov.au/avoid-sending-spam, last updated 29 November 2024: express consent is given by "filling in a
 * form"); the editions wait until the owner of the address presses Confirm on the page this link opens.
 *
 * The link carries the request itself, so nothing is stored before the confirmation and no migration is needed: the
 * address, the city, the wording version the panel showed, where it was asked and when, sealed with AES-256-GCM. Sealed,
 * not merely signed, because the address must never be readable in a URL or a log; GCM's tag also refuses any altered
 * link. The key is derived from ORDER_ACCESS_SECRET under its own label (an HMAC of the secret with a fixed purpose
 * string), so a confirmation link and a guest order link can never stand for one another and no new production variable
 * is needed. A link is good for seven days.
 */

export const CONFIRM_LINK_DAYS = 7
const VERSION = 1
const KEY_LABEL = 'eventlinqs:newsletter-confirmation:aes-256-gcm:v1'
const AAD = Buffer.from('newsletter-confirm:v1', 'utf8')
const DEV_FALLBACK_SECRET = 'eventlinqs-dev-only-newsletter-confirm-secret'

export interface ConfirmRequest {
  /** Normalised (trimmed, lower case). */
  readonly email: string
  readonly citySlug: string
  /** The city's name as the panel showed it, so the wording recorded is the wording read. */
  readonly cityName: string
  readonly consentVersion: string
  /** Where the form was, as the consent's capture surface records it. */
  readonly source: string
  readonly requestedAt: number
}

function keyFrom(secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(KEY_LABEL, 'utf8').digest()
}

export function resolveConfirmSecret(env: Record<string, string | undefined> = process.env): string | null {
  const fromEnv = env.ORDER_ACCESS_SECRET
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv
  if (env.NODE_ENV === 'production') return null
  return DEV_FALLBACK_SECRET
}

export function sealConfirmRequest(request: ConfirmRequest, secret: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  cipher.setAAD(AAD)
  const body = JSON.stringify({
    v: VERSION,
    e: request.email,
    c: request.citySlug,
    n: request.cityName,
    w: request.consentVersion,
    s: request.source,
    t: request.requestedAt,
  })
  const sealed = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url')
}

export type OpenedConfirm =
  | { readonly ok: true; readonly request: ConfirmRequest }
  | { readonly ok: false; readonly why: 'invalid' | 'expired' }

const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0

export function openConfirmRequest(token: string, secret: string, now: number): OpenedConfirm {
  if (typeof token !== 'string' || token.length < 40 || token.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, why: 'invalid' }
  }
  let parsed: unknown
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 2) return { ok: false, why: 'invalid' }
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), raw.subarray(0, 12))
    decipher.setAAD(AAD)
    decipher.setAuthTag(raw.subarray(12, 28))
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    parsed = JSON.parse(body)
  } catch {
    // An altered, truncated or foreign link: GCM refuses it, and that refusal is the answer, not a fault to report.
    return { ok: false, why: 'invalid' }
  }
  const p = parsed as Record<string, unknown>
  if (p.v !== VERSION || !isText(p.e) || !isText(p.c) || !isText(p.n) || !isText(p.w) || !isText(p.s) || typeof p.t !== 'number') {
    return { ok: false, why: 'invalid' }
  }
  if (p.t > now + 5 * 60_000) return { ok: false, why: 'invalid' }
  if (now - p.t > CONFIRM_LINK_DAYS * 86_400_000) return { ok: false, why: 'expired' }
  return { ok: true, request: { email: p.e, citySlug: p.c, cityName: p.n, consentVersion: p.w, source: p.s, requestedAt: p.t } }
}
