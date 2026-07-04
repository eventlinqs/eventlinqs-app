import webpush from 'web-push'
import type { AlertPayload } from './policy'

/**
 * Web Push transport (Web Push Protocol + VAPID). Configured lazily from env so
 * a build or a fresh clone without keys still compiles and runs; push simply
 * reports itself unconfigured and the dispatcher falls back to email.
 *
 * Required env (founder sets these on the preview/production deployment):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  - the VAPID public key (also used client-side)
 *   VAPID_PRIVATE_KEY             - the VAPID private key (server only, secret)
 *   VAPID_SUBJECT                 - a mailto: or https: contact, e.g. mailto:hello@eventlinqs.com
 * Generate a keypair once with: npx web-push generate-vapid-keys
 */

let configured: boolean | null = null

export function isPushConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@eventlinqs.com'
  if (!pub || !priv) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export type StoredSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export type WebPushResult = {
  ok: boolean
  statusCode: number | null
  /** True when the endpoint is gone (404/410) and the row should be pruned. */
  gone: boolean
}

export async function sendWebPush(
  sub: StoredSubscription,
  payload: AlertPayload,
): Promise<WebPushResult> {
  if (!isPushConfigured()) return { ok: false, statusCode: null, gone: false }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    )
    return { ok: true, statusCode: 201, gone: false }
  } catch (err) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? ((err as { statusCode?: number }).statusCode ?? null)
        : null
    const gone = statusCode === 404 || statusCode === 410
    return { ok: false, statusCode, gone }
  }
}
