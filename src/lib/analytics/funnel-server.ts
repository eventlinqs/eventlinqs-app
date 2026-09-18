import 'server-only'
import { captureException } from '@/lib/observability/sentry'
import type { FunnelStep } from './funnel'

/**
 * THE ONE FUNNEL STEP A BROWSER CANNOT HONESTLY WITNESS.
 *
 * Close-out AN1. Four of the five steps happen in front of the person whose
 * funnel it is: they landed, they started, they finished, they published. The
 * fifth, their first sale, happens minutes later on a Stripe webhook, on a
 * machine with no browser. Firing it from a page would mean firing it from the
 * page the BUYER is on, which would file the organiser's activation under
 * whoever happened to click buy.
 *
 * WHAT IT SENDS, AND WHAT IT DELIBERATELY DOES NOT. The distinct id is the
 * ORGANISATION id, which is a business, not a person, and the properties are
 * ids of records. No email, no name, no address, no device identifier, and
 * nothing that could be joined to a browser session. That is what makes this
 * defensible without a consent banner: a banner governs what is stored on a
 * person's device and who may follow them afterwards, and this stores nothing
 * on any device and follows nobody.
 *
 * IT IS OFF UNLESS CONFIGURED, like every other provider: no key, no request.
 *
 * FIRE AND FORGET, and never in the caller's way. It is awaited only so a
 * failure can be reported; every failure path returns rather than throwing,
 * because a measurement call sits downstream of money moving and must not be
 * able to affect it.
 */
export async function captureFunnelServer(
  step: FunnelStep,
  input: {
    /** The business the funnel belongs to. Never a person. */
    organisationId: string
    /** Ids of records only. Never an email, a name or an address. */
    properties?: Record<string, string | number>
  },
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return { sent: false, reason: 'no PostHog key configured' }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

  try {
    const response = await fetch(`${host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: step,
        distinct_id: input.organisationId,
        properties: { ...(input.properties ?? {}), $lib: 'eventlinqs-server' },
        timestamp: new Date().toISOString(),
      }),
    })
    if (!response.ok) {
      const reason = `PostHog answered ${response.status}`
      console.warn(`[funnel-server] ${step} not recorded: ${reason}`)
      return { sent: false, reason }
    }
    return { sent: true }
  } catch (error) {
    captureException(error, { where: 'lib/analytics/funnel-server' })
    return { sent: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
