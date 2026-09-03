import crypto from 'crypto'

/**
 * THE GUEST'S KEY TO THEIR OWN ORDER.
 *
 * A buyer who checks out as a guest has no account, so every surface that asks
 * "are you the person who bought this" answered no. They could see the
 * confirmation page at its URL and nothing else: no ticket list, no transfer,
 * and a "Request a refund" button that opened a form, took a reason, and then
 * told them to sign in as the purchaser. Guest checkout creates no account, so
 * that instruction was impossible. Journeys 4 and 5, 28 August 2026.
 *
 * FOUNDER RULING, 29 August 2026: a magic link. Not forced account creation,
 * which costs conversion at the worst possible moment, and not hiding the
 * controls, which strands a buyer holding a ticket they cannot manage.
 *
 * WHAT THE MARKET ACTUALLY DOES, checked rather than assumed (Law 7):
 *
 *   HUMANITIX does exactly this. No account is required and the confirmation
 *   email IS the key: "You can always access your digital tickets through your
 *   confirmation email", with a view-tickets button, plus a self-serve "I can't
 *   find my tickets" form that RE-SENDS to the purchase address.
 *   https://help.humanitix.com/en/articles/8924058-how-do-i-access-my-digital-ticket
 *   https://help.humanitix.com/en/articles/10068288-resend-an-order-confirmation-email-and-tickets
 *
 *   EVENTBRITE does the opposite of the ruling: "When you order tickets on
 *   Eventbrite, an account is created using the email address you enter during
 *   checkout", with a Find my tickets lookup for people without the email.
 *   https://www.eventbrite.com/help/en-us/articles/319355/where-are-my-tickets/
 *
 *   NEITHER publishes a link lifetime or what the link exposes. Both remain
 *   UNSOURCED, so the choices below are ours and are argued rather than copied.
 *
 * THE CHOICES, and why.
 *
 *   SCOPE: one order. The token names the order it was minted for and is
 *   verified against that order, so a token for order A cannot open order B.
 *   It grants exactly what the founder listed: view the tickets, transfer, and
 *   request a refund. Nothing else, and never anything organiser-side.
 *
 *   LIFETIME: none. This is deliberate and it is the same trust level the email
 *   already carries, because that email also contains the ticket QR codes, which
 *   ARE bearer credentials that must work at the door weeks later. An expiring
 *   manage-link on a non-expiring ticket email would lock a buyer out of the
 *   refund path precisely when they need it, while leaving the actually valuable
 *   thing, the ticket, still usable. Humanitix reaches the same conclusion by
 *   making the email itself the permanent key.
 *
 *   STATELESS: derived by HMAC from the order id, so there is no column to add,
 *   no migration for the founder to apply, and nothing to leak from a table. It
 *   is revocable in the only way that matters at this scale, by rotating the
 *   secret, which invalidates every outstanding link at once.
 *
 * FAIL CLOSED, following src/lib/queue/tokens.ts. Without a secret in
 * production this refuses to mint AND refuses to honour, so a deployment that
 * forgot the variable cannot fall back to a public constant that would let
 * anyone open any order by guessing an id.
 */

/**
 * Dev-only signing secret. It lives in the repository, so it must never be
 * reachable in production: with it, anyone could mint a token for any order id
 * and read that buyer's tickets.
 */
const DEV_FALLBACK_SECRET = 'dev-order-access-secret-change-in-prod'

/** Bound into the MAC so a secret shared with another feature cannot cross over. */
const PURPOSE = 'order-access-v1'

function resolveSecret(): string | null {
  const fromEnv = process.env.ORDER_ACCESS_SECRET
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv
  if (process.env.NODE_ENV === 'production') return null
  return DEV_FALLBACK_SECRET
}

/** Whether this deployment can issue and honour guest order links at all. */
export function orderAccessConfigured(): boolean {
  return resolveSecret() !== null
}

/**
 * The token for one order. Returns null when the deployment has no secret, so
 * callers omit the link rather than emailing one that will never verify.
 */
export function mintOrderAccessToken(orderId: string): string | null {
  const secret = resolveSecret()
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}:${orderId}`).digest('hex').slice(0, 40)
}

/**
 * Constant-time check that this token was minted for this order.
 *
 * Compared with timingSafeEqual on equal-length buffers: a plain === leaks the
 * length of the matching prefix, which is enough to recover a token one byte at
 * a time given enough attempts.
 */
export function verifyOrderAccessToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false
  const expected = mintOrderAccessToken(orderId)
  if (!expected) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** The link a buyer follows from their confirmation email. */
export function orderAccessUrl(siteUrl: string, orderId: string): string | null {
  const token = mintOrderAccessToken(orderId)
  if (!token) return null
  return `${siteUrl.replace(/\/$/, '')}/orders/${orderId}/confirmation?t=${token}`
}
