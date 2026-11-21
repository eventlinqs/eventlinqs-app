import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { dayStart, SOCIAL_ZONE } from './cadence'
import { dayIn } from './lifecycle'
import { parseMomentKey, planLifecyclePieces } from './lifecycle-plan'
import { pieceDependencies, readLifecycleNights, rejectPiece, standingPolicyDryRun } from './store'
import { nothingCanPostReason, PREFLIGHT_ACTION, preflightLine } from './preflight-line'

export { nothingCanPostReason, PREFLIGHT_ACTION, preflightLine }

type Db = SupabaseClient<Database>

/**
 * THE PRE FLIGHT (the PM's 16:30 of 21 November 2026, item 2, and 16:40, AV (c) and (g)). Every morning before the 06:40
 * run, every piece due today is put through the checks it will meet: a drafted piece through the standing policy's dry
 * run, a scheduled one through the publish gate's own checks (pieceDependencies). A refused piece is rejected with why
 * and its schedules held, so the 06:40 planner draws that moment again with the choice that heals (lifecycle.ts
 * chooseToday) before anything is approved. The one line 'today: N pieces ready, M redrawn, K nights with no permitted
 * photo' is recorded for the 08:00 report; only when the whole day has nothing that can post does the report say so,
 * with the reason, once (the morning report is the owner's daily message; no new channel).
 * It runs in the hourly social run at 04:40 Melbourne (PREFLIGHT_HOUR): the run before 05:00, so no cron is added. Dry
 * unless asked to apply: a dry run writes nothing.
 */
export const PREFLIGHT_HOUR = 4

export interface Preflight {
  readonly day: string
  readonly ready: readonly string[]
  readonly redrawn: readonly string[]
  readonly photoless: readonly string[]
  /** What the 06:40 planner would draw now, after the redraws. */
  readonly wouldDraw: number
  /** Set only when the whole day has nothing that can post: the reason, said once in the 08:00 report. */
  readonly nothingCanPost: string | null
  readonly line: string
  readonly applied: boolean
}

export async function runPreflight(
  db: Db,
  input: { readonly now: Date; readonly siteOrigin: string; readonly apply: boolean; readonly by: string | null },
): Promise<Preflight> {
  const day = dayIn(input.now, SOCIAL_ZONE)
  const opens = dayStart(new Date(`${day}T02:00:00Z`), SOCIAL_ZONE)
  const closes = dayStart(new Date(opens.getTime() + 36 * 3_600_000), SOCIAL_ZONE)
  const apply = input.apply && input.by !== null
  const ready: string[] = []
  const redrawn: string[] = []
  const redrawnIds = new Set<string>()

  const redraw = async (pieceId: string, label: string, why: string) => {
    redrawn.push(`${label}: ${why}`)
    redrawnIds.add(pieceId)
    if (!apply || input.by === null) return
    await rejectPiece(db, { pieceId, reason: `Pre-flight ${day}: ${why}. The planner draws the next best moment.`.slice(0, 900), by: input.by, now: input.now })
    await db.from('social_piece_schedules').update({ state: 'held', held_reason: `Not published: the pre-flight of ${day} refused it (${why}) and the planner drew the next best moment.`.slice(0, 500) }).eq('piece_id', pieceId).eq('state', 'scheduled')
  }

  // 1. Drafted pieces of today, through the standing policy's dry run.
  const dry = (await standingPolicyDryRun(db, { now: input.now, siteOrigin: input.siteOrigin })) ?? []
  const ids = dry.map((r) => r.id)
  const { data: keys, error: kerr } = ids.length > 0 ? await db.from('social_pieces').select('id, moment_key').in('id', ids) : { data: [], error: null }
  if (kerr) throw new Error(`the drafted pieces could not be read: ${kerr.message}`)
  const todayOf = new Map(((keys ?? []) as { id: string; moment_key: string | null }[]).map((k) => [k.id, parseMomentKey(k.moment_key)?.day === day]))
  for (const r of dry) {
    if (!todayOf.get(r.id)) continue
    if (r.eligible) ready.push(r.label)
    else await redraw(r.id, r.label, r.reasons.join(' '))
  }

  // 2. Pieces scheduled for today, through the publish gate's own checks.
  const { data: due, error: serr } = await db.from('social_piece_schedules').select('piece_id').eq('state', 'scheduled').gte('go_at', opens.toISOString()).lt('go_at', closes.toISOString()).limit(50)
  if (serr) throw new Error(`today's schedules could not be read: ${serr.message}`)
  for (const pieceId of [...new Set(((due ?? []) as { piece_id: string }[]).map((d) => d.piece_id))]) {
    const issues = await pieceDependencies(db, pieceId, input.now, { siteOrigin: input.siteOrigin })
    if (issues.length === 0) ready.push(pieceId)
    else await redraw(pieceId, pieceId, issues.join(' '))
  }

  // 3. What the 06:40 planner would draw now, read only, the redrawn pieces read as not yet drawn.
  const plan = await planLifecyclePieces(db, { now: input.now, nights: await readLifecycleNights(db, input.now), origin: input.siteOrigin, redrawing: redrawnIds })
  const nothingCanPost = nothingCanPostReason({ ready: ready.length, wouldDraw: plan.pieces.length, due: plan.due, photoless: plan.photoless, notes: plan.notes })
  const line = preflightLine({ ready: ready.length, redrawn: redrawn.length, photoless: plan.photoless.length })
  const out: Preflight = { day, ready, redrawn, photoless: plan.photoless, wouldDraw: plan.pieces.length, nothingCanPost, line, applied: apply }

  if (apply) {
    const { error } = await db.from('audit_log').insert({
      actor_id: null,
      actor_email_snapshot: 'cron/social-publish',
      actor_role_snapshot: null,
      action: PREFLIGHT_ACTION,
      target_type: null,
      target_id: null,
      metadata: { day, line, ready, redrawn, photoless: [...plan.photoless], wouldDraw: plan.pieces.length, nothingCanPost },
    })
    if (error) console.error(`[social/preflight] the pre-flight's record could not be written: ${error.message}`)
  }
  return out
}
