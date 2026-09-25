/**
 * THE FIVE FUNNEL STEPS AND THE TWO CONVERSIONS, named once.
 *
 * Close-out AN1. The growth plan's gate two says the platform must be able to
 * say where an organiser came from before a dollar is spent on advertising.
 * That needs two different things, and they are different on purpose:
 *
 *   THE FUNNEL   landed, signup started, signup completed, event published,
 *                first sale. Five steps, sent to the product analytics, so the
 *                owner can see WHERE people fall out rather than only how many
 *                arrived.
 *   THE TWO      signup completed and event published. Sent to the advertising
 *   CONVERSIONS  tools, and only those two, because a conversion tag exists to
 *                let an ad platform optimise, and giving it every step teaches
 *                it to chase a page view.
 *
 * WHY "first sale" IS A FUNNEL STEP AND NOT A CONVERSION. It is the step that
 * matters most and it happens on a server, minutes later, on a Stripe webhook
 * with no browser to fire a tag from. Sending it as a browser conversion would
 * mean firing it from the page the BUYER is on, which would attribute the
 * organiser's activation to whoever clicked buy. It is counted in the funnel,
 * where it belongs, and the advertising tools are told the two things a browser
 * can honestly witness.
 *
 * EVERY EVENT GOES THROUGH `trackFunnel`, WHICH ASKS NOTHING ABOUT CONSENT. It
 * calls whatever the page has loaded, and nothing is loaded without consent, so
 * a refused visitor's calls land on functions that do not exist and return. The
 * gate is the loader, in one place, rather than a check repeated at every call
 * site where one copy would eventually be forgotten.
 */
export const FUNNEL_STEPS = [
  'landed',
  'signup_started',
  'signup_completed',
  'event_published',
  'first_sale',
] as const

export type FunnelStep = (typeof FUNNEL_STEPS)[number]

/** The two a browser can honestly witness, sent to the advertising tools. */
export const AD_CONVERSIONS: FunnelStep[] = ['signup_completed', 'event_published']

export function isAdConversion(step: FunnelStep): boolean {
  return AD_CONVERSIONS.includes(step)
}

type FunnelProps = Record<string, string | number>

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: FunnelProps) => void }
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

/**
 * Records one funnel step wherever the page is allowed to record it.
 *
 * NEVER THROWS AND NEVER BLOCKS. A measurement call sits inside a signup, a
 * publish and a purchase, and an exception from a tracker must not be able to
 * stop any of them. Every provider is called inside its own try so one broken
 * script cannot take the other two with it.
 */
export function trackFunnel(step: FunnelStep, props?: FunnelProps): void {
  if (typeof window === 'undefined') return

  try {
    window.posthog?.capture(step, props)
  } catch {
    // A tracker that throws is a tracker's problem, never the signup's.
  }

  if (!isAdConversion(step)) return

  try {
    window.gtag?.('event', step, props ?? {})
  } catch {
    // Same reasoning as above; the next provider still gets its call.
  }
  try {
    // Meta's standard events do not include ours, so they are sent as custom
    // events rather than mislabelled as a Lead or a Purchase, which would put
    // an organiser signup into a report about ticket sales.
    window.fbq?.('trackCustom', step, props ?? {})
  } catch {
    // Same reasoning.
  }
}
