import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'

/**
 * THE ATTRIBUTION CONFIGURATION, read rather than typed.
 *
 * Every number this item uses lives in `marketing_attribution_config`, one row,
 * and is read through here. The model NAME and VERSION are read the same way
 * and copied onto every attribution record, so a decision read back in six
 * months can say what produced it. GA3's reversal condition re-chooses the
 * model rather than patching it, and a model name that is a literal in code is
 * a model nobody can re-choose without a deploy.
 *
 * THE FALLBACK IS THE SEEDED ROW, and it exists for one reason: a resolver that
 * throws when the configuration table is briefly unreadable would leave orders
 * with NO attribution record, and GA3's whole invariant is that every order has
 * exactly one. A record produced under the fallback is not silently identical
 * to one produced normally: `configDegraded` is carried onto the decision and
 * printed on the admin reader, so a row made during an outage says so.
 */

export interface AttributionConfig {
  modelName: string
  modelVersion: string
  attributionWindowDays: number
  clickCookieDays: number
  rungFourConfidence: number
  linkCodeLength: number
  /** True when the row could not be read and the seeded values were used. */
  degraded: boolean
}

/**
 * The values the migration seeds. Used ONLY when the row cannot be read, in the
 * same last-resort posture as the public fee constant. This is not a second
 * source of the configuration: it is what the first source was seeded with, and
 * `tests/unit/growth/attribution-spine.test.ts` asserts the two agree.
 */
export const SEEDED_ATTRIBUTION_CONFIG: Omit<AttributionConfig, 'degraded'> = {
  modelName: 'last-click-with-identity-ladder',
  modelVersion: 'v1',
  attributionWindowDays: 30,
  clickCookieDays: 30,
  rungFourConfidence: 0.5,
  linkCodeLength: 12,
}

export async function readAttributionConfig(): Promise<AttributionConfig> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketing_attribution_config')
      .select('model_name, model_version, attribution_window_days, click_cookie_days, rung_four_confidence, link_code_length')
      .eq('id', true)
      .maybeSingle()
    if (error || !data) {
      captureException(new Error(`marketing_attribution_config unreadable: ${error?.message ?? 'no row'}`), {
        where: 'lib/attribution/config',
      })
      return { ...SEEDED_ATTRIBUTION_CONFIG, degraded: true }
    }
    return {
      modelName: data.model_name,
      modelVersion: data.model_version,
      attributionWindowDays: Number(data.attribution_window_days),
      clickCookieDays: Number(data.click_cookie_days),
      rungFourConfidence: Number(data.rung_four_confidence),
      linkCodeLength: Number(data.link_code_length),
      degraded: false,
    }
  } catch (error) {
    // Degrading is the right behaviour and the failure is still REPORTED: a
    // configuration table that cannot be read is an incident, and a resolver
    // quietly running on seeded values is precisely what nobody would notice.
    captureException(error, { where: 'lib/attribution/config' })
    return { ...SEEDED_ATTRIBUTION_CONFIG, degraded: true }
  }
}
