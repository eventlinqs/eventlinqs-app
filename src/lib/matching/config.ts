import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  assertWeightsAreUsable,
  MatchConfigError,
  type MatchConfig,
  type MatchWeight,
  type PostcodeBand,
} from './score'

type Admin = SupabaseClient<Database>

/**
 * READING THE MATCHER'S CONFIGURATION, AND REFUSING IT WHEN IT IS UNUSABLE.
 *
 * Every number the matcher uses is a row: the weights, the recency half life,
 * the price band tolerance, the postcode bands, the cooldown, the floor and the
 * cap. None of them is a literal in code, so the owner can move any of them
 * without a deploy, which is what GA2 acceptance 4 proves by moving one.
 *
 * IT REFUSES AT READ TIME rather than scoring with a broken set. A weight set
 * that sums to 0.8 does not make slightly smaller scores, it makes a score
 * whose ceiling is 80, and every floor anybody set against it quietly means
 * something else. The error names the offending row.
 */
export async function readMatchConfig(admin: Admin): Promise<MatchConfig> {
  const [configResult, weightResult, bandResult] = await Promise.all([
    admin
      .from('marketing_match_config')
      .select(
        'method_name, method_version, recency_half_life_days, price_band_tolerance, send_cooldown_days, minimum_score_floor, max_recipients_per_run, weight_sum_tolerance',
      )
      .eq('id', true)
      .maybeSingle(),
    // Both are small authored configuration tables. The bound is stated so a
    // silently dropped weight can never change what the matcher scores.
    admin
      .from('marketing_match_weights')
      .select('component, weight, sentence')
      .order('weight', { ascending: false })
      .limit(200),
    admin.from('marketing_match_postcode_bands').select('band, shared_prefix, fit, label').order('band').limit(200),
  ])

  if (configResult.error || !configResult.data) {
    throw new MatchConfigError(
      `marketing_match_config could not be read (${configResult.error?.message ?? 'no row'}), so there is no method to run.`,
    )
  }

  /*
   * THE OTHER TWO READS ARE JUDGED THE SAME WAY AS THE ONE ABOVE, and until
   * 21 September 2026 they were not.
   *
   * `configResult.error` is checked six lines up and the rule was then not
   * repeated on the two reads below it, which is the shape a rule kept by habit
   * always fails in. Both were written `result.data ?? []`, so a failed read
   * arrived as an EMPTY weight set, and the refusal `assertWeightsAreUsable`
   * then raises says the weights do not sum to one. They do sum to one. The
   * read failed, and the sentence sent the reader to the configuration table
   * to fix a row that was never wrong.
   */
  if (weightResult.error) {
    throw new MatchConfigError(
      `marketing_match_weights could not be read (${weightResult.error.message}), so there is no method to run.`,
    )
  }
  if (bandResult.error) {
    throw new MatchConfigError(
      `marketing_match_postcode_bands could not be read (${bandResult.error.message}), so there is no method to run.`,
    )
  }

  const weights: MatchWeight[] = (weightResult.data ?? []).map(row => ({
    component: row.component,
    weight: Number(row.weight),
    sentence: row.sentence,
  }))

  const postcodeBands: PostcodeBand[] = (bandResult.data ?? []).map(row => ({
    band: row.band,
    sharedPrefix: row.shared_prefix,
    fit: Number(row.fit),
    label: row.label,
  }))

  const config: MatchConfig = {
    methodName: configResult.data.method_name,
    methodVersion: configResult.data.method_version,
    recencyHalfLifeDays: configResult.data.recency_half_life_days,
    priceBandTolerance: configResult.data.price_band_tolerance,
    sendCooldownDays: configResult.data.send_cooldown_days,
    minimumScoreFloor: Number(configResult.data.minimum_score_floor),
    maxRecipientsPerRun: configResult.data.max_recipients_per_run,
    weightSumTolerance: Number(configResult.data.weight_sum_tolerance),
    weights,
    postcodeBands,
  }

  assertWeightsAreUsable(config)
  return config
}

/** The whole configuration as it stood, stored on the run so it can be read back. */
export function configSnapshot(config: MatchConfig): Record<string, unknown> {
  return {
    method_name: config.methodName,
    method_version: config.methodVersion,
    recency_half_life_days: config.recencyHalfLifeDays,
    price_band_tolerance: config.priceBandTolerance,
    send_cooldown_days: config.sendCooldownDays,
    minimum_score_floor: config.minimumScoreFloor,
    max_recipients_per_run: config.maxRecipientsPerRun,
    weight_sum_tolerance: config.weightSumTolerance,
    weights: config.weights,
    postcode_bands: config.postcodeBands,
  }
}
