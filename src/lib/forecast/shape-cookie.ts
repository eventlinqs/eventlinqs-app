import type { EventShapeParams } from '@/lib/growth/loops'

/**
 * THE EVENT SHAPE, CARRIED ACROSS A SIGNUP.
 *
 * Close-out FT1 point 6 wants the shape to reach the create-event form "so the
 * organiser does not type it twice". Between the forecast and that form sits a
 * signup, an emailed confirmation link and a dashboard, and a query parameter
 * survives none of them: this platform's signup route builds its own
 * confirmation URL and sends the person to `/dashboard`.
 *
 * SO IT IS A COOKIE, and that is the better answer rather than the available
 * one. The alternative was threading a caller-supplied `next` through the
 * signup form, the signup API and the emailed confirm link, which opens a
 * redirect surface on an auth path for the sake of prefilling four fields. A
 * cookie opens nothing, survives the email hop that a parameter cannot, and is
 * the pattern already in this tree: AN1 carries the arrival record exactly this
 * way (`el_arrival`).
 *
 * IT HOLDS NOTHING PERSONAL. A category id, a city slug, a room size and a
 * price. No name, no address, nothing about who the person is, which is why it
 * needs no consent and is not in the consent banner's scope.
 *
 * SEVEN DAYS. Long enough to survive somebody running the tool, going away,
 * reading the confirmation email the next morning and coming back; short enough
 * that a shape typed a fortnight ago does not surprise them by appearing in a
 * form they opened for something else.
 */

export const SHAPE_COOKIE = 'el_shape'
export const SHAPE_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/** Bounds, so a crafted cookie cannot write a kilobyte into a form. */
const MAX_ID = 64
const MAX_CAPACITY = 1_000_000
const MAX_PRICE_CENTS = 100_000_000

function trim(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean.length > 0 ? clean : null
}

function bounded(value: unknown, max: number): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(Math.trunc(n), max)
}

export function encodeShape(shape: EventShapeParams): string {
  const payload: Record<string, string | number> = {}
  const categoryId = trim(shape.categoryId, MAX_ID)
  const city = trim(shape.city, MAX_ID)
  const capacity = bounded(shape.capacity, MAX_CAPACITY)
  const priceCents = bounded(shape.priceCents, MAX_PRICE_CENTS)
  if (categoryId) payload.c = categoryId
  if (city) payload.y = city
  if (capacity) payload.n = capacity
  if (priceCents) payload.p = priceCents
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * Reads the cookie back, and answers "nothing" to anything it cannot parse.
 *
 * A cookie is user writable and arrives from a public browser, so every failure
 * path returns an empty shape rather than throwing: the worst a tampered value
 * may do is leave a form blank, which is where it started.
 */
export function decodeShape(value: string | null | undefined): EventShapeParams {
  const empty: EventShapeParams = { categoryId: null, city: null, capacity: null, priceCents: null }
  if (!value) return empty
  try {
    const raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return empty
    return {
      categoryId: trim(raw.c, MAX_ID),
      city: trim(raw.y, MAX_ID),
      capacity: bounded(raw.n, MAX_CAPACITY),
      priceCents: bounded(raw.p, MAX_PRICE_CENTS),
    }
  } catch {
    return empty
  }
}

/** True when there is nothing worth carrying, so no cookie is set at all. */
export function shapeIsEmpty(shape: EventShapeParams): boolean {
  return !shape.categoryId && !shape.city && !shape.capacity && !shape.priceCents
}
