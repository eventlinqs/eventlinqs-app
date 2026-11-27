import type { SupabaseClient } from '@supabase/supabase-js'
import { checkLine, checklistRows, checkProblems, type SlideCheck } from './studio-check'

/**
 * WHAT THE PHONE SHOWS, AT /admin/social (Lawal, 16:52 on 27 November 2026; the PM's 17:00, car Q, item 3). For each
 * studio piece of the last three weeks: its checklist's result and its phone views as stored by the move
 * (./studio-move.ts), keyed by the social piece the creative intake made of it, so Lawal sees beside the slides what the
 * phone shows; and the pieces the phone check holds now, each with its reason. Two round trips, the second two reads at
 * once, beside the page's other reads (law 41).
 */

export type StudioProof = {
  readonly pieceKey: string
  readonly slides: number
  /** Each slide's stored phone view, in slide order; null where none is stored. */
  readonly phoneViews: readonly (string | null)[]
  readonly passed: boolean
  readonly line: string
  readonly rows: readonly SlideCheck[]
}

export type StudioHold = { readonly pieceKey: string; readonly reason: string; readonly heldAt: string | null }

export type StudioProofs = { readonly byPiece: ReadonlyMap<string, StudioProof>; readonly held: readonly StudioHold[] }

type StudioRow = { id: string; piece_key: string; slides: number; qa_checklist: unknown; intake_id: string | null; moved_at: string | null; held_reason: string | null; held_at: string | null; expires_at: string }

/** One piece's proof from its row and its stored phone views. Pure. */
export function studioProof(row: Pick<StudioRow, 'piece_key' | 'slides' | 'qa_checklist'>, phone: ReadonlyMap<number, string>): StudioProof {
  const problems = checkProblems(row.qa_checklist ?? null, row.slides, new Set(phone.keys()))
  return {
    pieceKey: row.piece_key,
    slides: row.slides,
    phoneViews: Array.from({ length: row.slides }, (_, i) => phone.get(i + 1) ?? null),
    passed: problems.length === 0,
    line: checkLine(problems, row.slides),
    rows: checklistRows(row.qa_checklist ?? null, row.slides),
  }
}

/** The studio's pieces of the last 21 days, their proofs by social piece and the ones held now. A read that fails throws. */
export async function readStudioProofs(db: SupabaseClient, now: Date): Promise<StudioProofs> {
  const s = await db
    .from('studio_pieces')
    .select('id, piece_key, slides, qa_checklist, intake_id, moved_at, held_reason, held_at, expires_at')
    .gte('created_at', new Date(now.getTime() - 21 * 86_400_000).toISOString())
    .is('error', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (s.error) throw new Error(`the studio's pieces could not be read: ${s.error.message}`)
  const rows = (s.data ?? []) as StudioRow[]
  const held = rows
    .filter((r) => r.moved_at === null && r.held_reason !== null && r.expires_at > now.toISOString())
    .map((r) => ({ pieceKey: r.piece_key, reason: r.held_reason as string, heldAt: r.held_at }))
  const moved = rows.filter((r) => r.intake_id !== null)
  if (moved.length === 0) return { byPiece: new Map(), held }
  const [intakes, views] = await Promise.all([
    db.from('creative_intake').select('id, piece_id').in('id', moved.map((r) => r.intake_id as string)),
    db.from('studio_uploads').select('piece_key, slide_no, moved_to').eq('view', 'phone').in('piece_key', moved.map((r) => r.piece_key)).not('moved_to', 'is', null),
  ])
  if (intakes.error) throw new Error(`the studio pieces' intake records could not be read: ${intakes.error.message}`)
  if (views.error) throw new Error(`the studio pieces' phone views could not be read: ${views.error.message}`)
  const pieceOf = new Map(((intakes.data ?? []) as { id: string; piece_id: string | null }[]).map((r) => [r.id, r.piece_id]))
  const phoneOf = new Map<string, Map<number, string>>()
  for (const v of (views.data ?? []) as { piece_key: string; slide_no: number; moved_to: string }[]) {
    const m = phoneOf.get(v.piece_key) ?? new Map<number, string>()
    m.set(v.slide_no, v.moved_to)
    phoneOf.set(v.piece_key, m)
  }
  const byPiece = new Map<string, StudioProof>()
  for (const r of moved) {
    const pieceId = pieceOf.get(r.intake_id as string)
    if (pieceId) byPiece.set(pieceId, studioProof(r, phoneOf.get(r.piece_key) ?? new Map()))
  }
  return { byPiece, held }
}
