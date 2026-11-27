import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntakeInput, Network, RestsOn, StatedFact } from '@/lib/creative/intake'

/**
 * THE STUDIO BRIDGE'S MOVE (the PM's 14:12 and 14:20 of 27 November 2026, car N step 2b (c); migration 20261127140001).
 * The social studio, a scheduled cloud Claude session, writes its rendered slides into studio_uploads and its pieces into
 * studio_pieces through SQL, the only road it has. This moves each piece whose every slide has arrived: each PNG stored
 * once under event-images/studio/<brief>/<piece>/<slide>-<format>.png, then the piece handed to the creative intake with
 * its slides in order, captions, nights, facts, link and slot, where every existing check runs as now (facts, rights, the
 * founder's approval). A refusal is written on the piece, never a silent drop; nothing is published here.
 */

type Db = SupabaseClient

export type StudioMoveDeps = {
  readonly store: (path: string, bytes: Uint8Array) => Promise<string>
  readonly receive: (input: IntakeInput) => Promise<{ readonly state: string; readonly id?: string; readonly reason?: string; readonly faults?: readonly string[] }>
}

type PieceRow = {
  id: string
  brief_id: string
  piece_key: string
  format: 'feed' | 'story'
  slides: number
  captions: Record<string, string>
  destinations: string[]
  event_ids: string[]
  facts: StatedFact[]
  link: string
  objective: IntakeInput['objective']
  preferred_at: string
  latest_at: string
  expires_at: string
}

type UploadRow = { id: string; slide_no: number; png: string; rests_on: RestsOn }

/** A bytea as PostgREST returns it ('\x' and hex) as bytes. Pure. */
export function byteaBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

/** Where a slide is stored. Pure. */
export function studioPath(briefId: string, pieceKey: string, slideNo: number, format: string): string {
  return `studio/${briefId}/${pieceKey}/${slideNo}-${format}.png`
}

/** The intake record of a piece and its stored slides, in order. Pure. */
export function studioIntake(piece: PieceRow, images: readonly { url: string; restsOn: RestsOn }[]): IntakeInput {
  return {
    briefId: piece.id,
    eventIds: piece.event_ids,
    format: piece.format,
    images,
    captions: { instagram: piece.captions.instagram ?? '', facebook: piece.captions.facebook ?? piece.captions.instagram ?? '' } as Record<Network, string>,
    destinations: piece.destinations as Network[],
    facts: piece.facts,
    link: piece.link,
    objective: piece.objective,
    preferredAt: piece.preferred_at,
    latestAt: piece.latest_at,
    expiresAt: piece.expires_at,
  }
}

/** Moves every piece whose slides have all arrived; one line a piece. A read that fails throws. */
export async function moveStudioPieces(db: Db, deps: StudioMoveDeps, now: Date): Promise<string[]> {
  const p = await db
    .from('studio_pieces')
    .select('id, brief_id, piece_key, format, slides, captions, destinations, event_ids, facts, link, objective, preferred_at, latest_at, expires_at')
    .is('moved_at', null)
    .is('error', null)
    .order('created_at')
    .limit(10)
  if (p.error) throw new Error(`the studio's pieces could not be read: ${p.error.message}`)
  const lines: string[] = []
  for (const piece of (p.data ?? []) as PieceRow[]) {
    const fail = async (why: string) => {
      await db.from('studio_pieces').update({ error: why.slice(0, 1000) }).eq('id', piece.id)
      lines.push(`${piece.piece_key}: NOT MOVED, ${why}`)
    }
    try {
      const u = await db.from('studio_uploads').select('id, slide_no, png, rests_on').eq('piece_key', piece.piece_key).eq('format', piece.format).order('slide_no')
      if (u.error) throw new Error(`its slides could not be read: ${u.error.message}`)
      const uploads = (u.data ?? []) as UploadRow[]
      if (uploads.length < piece.slides) {
        lines.push(`${piece.piece_key}: waiting, ${uploads.length} of ${piece.slides} slides arrived`)
        continue
      }
      const images: { url: string; restsOn: RestsOn }[] = []
      for (const up of uploads.slice(0, piece.slides)) {
        const path = studioPath(piece.brief_id, piece.piece_key, up.slide_no, piece.format)
        const url = await deps.store(path, byteaBytes(up.png))
        await db.from('studio_uploads').update({ moved_at: now.toISOString(), moved_to: url }).eq('id', up.id)
        images.push({ url, restsOn: up.rests_on })
      }
      const r = await deps.receive(studioIntake(piece, images))
      if (r.state === 'refused') {
        await fail(`the creative intake refused it: ${r.reason ?? 'no reason given'}`)
        continue
      }
      await db.from('studio_pieces').update({ moved_at: now.toISOString(), intake_id: r.id ?? null }).eq('id', piece.id)
      lines.push(`${piece.piece_key}: moved, ${images.length} slides, intake ${r.state}${r.faults?.length ? ` (${r.faults.join('; ')})` : ''}`)
    } catch (err) {
      await fail(err instanceof Error ? err.message : String(err))
    }
  }
  return lines
}
