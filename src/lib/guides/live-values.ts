import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getPricingRule } from '@/lib/payments/pricing-rules'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import type { GuideLiveValues } from './types'

/**
 * Resolves the live platform values a guide renders, through the SAME single
 * resolver the checkout and the payout path use, so a published guide can
 * never state a fee or a payout window that differs from the one in force.
 *
 * Both reads go through the PUBLIC (anon) client, because pricing_rules is
 * publicly readable and /guides is a public marketing surface that must not
 * depend on the service-role key. Both fall back to the same defaults the
 * payment code falls back to, so an unreachable database degrades the sentence
 * rather than the page.
 */

/** Mirrors the launch fallback in src/lib/payments/event-transfer.ts. */
const FALLBACK_PAYOUT_DAYS = 3

/**
 * Exported on 29 August so the PAYOUTS SCREEN can state the same number the
 * guides and the payout path use. It is never hardcoded anywhere: an organiser
 * reading "3 days" on one screen and a different figure on another would not
 * know which one their money follows.
 */
export async function payoutScheduleDays(): Promise<number> {
  try {
    const rule = await getPricingRule(
      { ruleType: 'payout_schedule_days', countryCode: 'AU', currency: 'AUD' },
      { client: createPublicClient() },
    )
    const days = Math.trunc(rule.value)
    return Number.isFinite(days) && days >= 0 ? days : FALLBACK_PAYOUT_DAYS
  } catch {
    return FALLBACK_PAYOUT_DAYS
  }
}

export async function getGuideLiveValues(): Promise<GuideLiveValues> {
  const [fee, payoutDays] = await Promise.all([
    getLivePublicFee().catch(() => null),
    payoutScheduleDays(),
  ])
  return {
    fee: fee?.label ?? 'the published platform fee',
    payoutDays,
  }
}
