/**
 * SUPPRESS, SCORE, RANK, TRUNCATE. The whole decision, pure.
 *
 * The impure half (src/lib/matching/run.ts) gathers the facts and writes the
 * rows; everything that DECIDES anything is here, so the order of the stages
 * and the rule that a suppressed person is never scored can be tested without
 * a database.
 *
 * THE ORDER IS THE DESIGN. Suppression runs first and records a reason per
 * person, so a removed person cannot appear in a score row: there is no
 * "filtered afterwards" step to forget. The floor is the one suppression that
 * needs a score to decide, so it is applied immediately after scoring and
 * counted in the same funnel rather than folded into "not returned".
 */
import {
  scoreAudienceMember,
  type AudienceRowForScoring,
  type BreakdownEntry,
  type EventForScoring,
  type MatchConfig,
} from './score'
import {
  emptyFunnel,
  isBelowFloor,
  suppressionReasonFor,
  type SuppressionFacts,
  type SuppressionReason,
} from './suppress'

export interface RankedMember {
  member: AudienceRowForScoring
  score: number
  breakdown: BreakdownEntry[]
  rank: number
}

export interface ComposedRun {
  considered: number
  funnel: Record<SuppressionReason, number>
  ranked: RankedMember[]
  truncated: boolean
}

export function composeRun(
  members: AudienceRowForScoring[],
  event: EventForScoring,
  config: MatchConfig,
  factsFor: (member: AudienceRowForScoring) => SuppressionFacts,
  options: { now: Date; channel: 'email' | 'sms'; cap: number },
): ComposedRun {
  const funnel = emptyFunnel()
  const survivors: Omit<RankedMember, 'rank'>[] = []

  for (const member of members) {
    const reason = suppressionReasonFor(factsFor(member), {
      now: options.now,
      cooldownDays: config.sendCooldownDays,
    })
    if (reason) {
      funnel[reason] += 1
      continue
    }

    const verdict = scoreAudienceMember(member, event, config, {
      now: options.now,
      channel: options.channel,
    })
    if (isBelowFloor(verdict.score, config.minimumScoreFloor)) {
      funnel.below_minimum_score += 1
      continue
    }
    survivors.push({ member, score: verdict.score, breakdown: verdict.breakdown })
  }

  /*
   * THE TIE BREAK IS WRITTEN DOWN, because a ranking nobody can reproduce
   * cannot be argued with. Score first, then the most recent purchase, then the
   * audience row id, which is unique and therefore always settles it.
   */
  survivors.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const bAt = Date.parse(b.member.lastOrderAt ?? '') || 0
    const aAt = Date.parse(a.member.lastOrderAt ?? '') || 0
    if (bAt !== aAt) return bAt - aAt
    return a.member.id.localeCompare(b.member.id)
  })

  const truncated = survivors.length > options.cap
  const ranked = survivors
    .slice(0, options.cap)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  return { considered: members.length, funnel, ranked, truncated }
}
