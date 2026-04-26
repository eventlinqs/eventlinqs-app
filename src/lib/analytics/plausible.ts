/**
 * Plausible Analytics - type-safe event tracking.
 *
 * Client-side: calls through to window.plausible installed by the snippet in
 * src/app/layout.tsx. Silently no-ops during SSR or before the script loads
 * (the queue in layout.tsx means calls made between page paint and script
 * ready are replayed once it boots).
 *
 * Server-side: see {@link trackEventServer} - posts to plausible.io/api/event
 * for conversions that finalise outside the browser (Stripe webhook, server
 * actions).
 */

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number>; callback?: () => void },
    ) => void
  }
}

type EventProps = Record<string, string | number>

export function trackEvent(name: string, props?: EventProps): void {
  if (typeof window === 'undefined') return
  if (!window.plausible) return
  window.plausible(name, props ? { props } : undefined)
}

// ── Typed wrappers ──────────────────────────────────────────────────────────

export function trackEventView(data: {
  event_id: string
  event_title: string
  category: string
  venue_city: string
  price_range: string
}): void {
  trackEvent('event_view', data)
}

export function trackTicketCheckoutStart(data: {
  event_id: string
  ticket_type: string
  quantity: number
  total_amount_cents: number
}): void {
  trackEvent('ticket_checkout_start', data)
}

export function trackTicketPurchaseComplete(data: {
  event_id: string
  ticket_type: string
  quantity: number
  total_amount_cents: number
  currency: string
}): void {
  trackEvent('ticket_purchase_complete', data)
}

export function trackOrganiserSignup(data: {
  organisation_id: string
  organisation_type: string
}): void {
  trackEvent('organiser_signup', data)
}

export function trackEventSearch(data: {
  query?: string
  category?: string
  city?: string
  date_preset?: string
}): void {
  const props: EventProps = {}
  if (data.query) props.query = data.query
  if (data.category) props.category = data.category
  if (data.city) props.city = data.city
  if (data.date_preset) props.date_preset = data.date_preset
  trackEvent('event_search', props)
}

export function trackSaveEvent(data: { event_id: string }): void {
  trackEvent('save_event', data)
}

// ── Server-side tracking (Stripe webhook, server actions) ───────────────────

const PLAUSIBLE_DOMAIN = 'eventlinqs.com'
const PLAUSIBLE_ENDPOINT = 'https://plausible.io/api/event'
const PLAUSIBLE_USER_AGENT = 'EventLinqs-Server/1.0 (+https://eventlinqs.com)'

/**
 * Record a custom event from a server context (webhook, server action, cron).
 * Uses Plausible's Events API. Fire-and-forget - callers should never await
 * this in a critical path.
 *
 * @param url  Absolute URL to associate the event with (e.g. the confirmation
 *             page for a purchase). Plausible uses the path for page-level
 *             attribution.
 */
export async function trackEventServer(
  name: string,
  url: string,
  props?: EventProps,
): Promise<void> {
  try {
    await fetch(PLAUSIBLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': PLAUSIBLE_USER_AGENT,
      },
      body: JSON.stringify({
        name,
        url,
        domain: PLAUSIBLE_DOMAIN,
        props: props ?? undefined,
      }),
      // Never let a network hiccup stall a payment webhook.
      signal: AbortSignal.timeout(2500),
    })
  } catch (err) {
    console.warn('[plausible] server event failed:', name, err)
  }
}

export function trackTicketPurchaseCompleteServer(
  url: string,
  data: {
    event_id: string
    ticket_type: string
    quantity: number
    total_amount_cents: number
    currency: string
  },
): Promise<void> {
  return trackEventServer('ticket_purchase_complete', url, data)
}

export function trackOrganiserSignupServer(
  url: string,
  data: {
    organisation_id: string
    organisation_type: string
  },
): Promise<void> {
  return trackEventServer('organiser_signup', url, data)
}

export {}
