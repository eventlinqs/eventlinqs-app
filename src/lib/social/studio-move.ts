import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntakeInput, Network, RestsOn, StatedFact } from '@/lib/creative/intake'

/**
 * THE STUDIO BRIDGE'S MOVE (the PM's 14:12 and 14:20 of 27 November 2026, car N step 2b (c); migration 20261127140001).
 * The social studio, a scheduled cloud Claude session, writes its rendered slides into studio_uploads and its pieces into
 * studio_pieces through SQL, the only road it has. This moves each piece whose every slide has arrived: each PNG stored
 * once as JPEG under event-images/creative/<piece id>/<slide>-<format>.jpg (car R1: the one place the creative intake
 * takes a finished design, and the format Instagram's publishing takes), then the piece handed to the creative intake with
 * its slides in order, captions, nights, facts, link and slot, where every existing check runs as now (facts, rights, the
 * founder's approval). A refusal is written on the piece, never a silent drop; nothing is published here.
 */

type Db = SupabaseClient

export type StudioMoveDeps = {
  readonly store: (path: string, bytes: Uint8Array) => Promise<string>
  readonly receive: (input: IntakeInput) => Promise<{ readonly state: string; readonly id?: string; readonly reason?: string; readonly faults?: readonly string[] }>
  /** Each night as the engine reads it now, by its id (store.ts readCampaignNights); a night not public now is absent. */
  readonly facts: (eventIds: readonly string[]) => Promise<ReadonlyMap<string, StatedFact>>
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
  /** The studio's own statement of each night, in whatever shape it wrote; read by statedFacts, never handed on. */
  facts: unknown[]
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

/** Where a slide is stored, as JPEG: the creative intake's own place (campaign.ts isCreativeFileUrl). Pure. */
export function studioPath(pieceId: string, slideNo: number, format: string): string {
  return `creative/${pieceId}/${slideNo}-${format}.jpg`
}

/**
 * EACH NIGHT'S FACTS AS THE ENGINE READS THEM NOW (car S, the PM's 19:40 of 27 November 2026): the intake compares a
 * piece's facts with the listing, title, start, end, venue and the organiser as the engine names it (shown-organiser.ts
 * nightMaker), so the bridge states them from the engine's own read, never from the studio's text. The studio's own word
 * still counts where it can be wrong: a night it states no facts for, or whose start it states otherwise than the listing,
 * is refused with its reason, and a night not public now cannot be stated. Pure.
 */
export function statedFacts(eventIds: readonly string[], studio: readonly unknown[], read: ReadonlyMap<string, StatedFact>): { readonly facts: StatedFact[] } | { readonly refused: string } {
  const out: StatedFact[] = []
  for (const id of eventIds) {
    const n = read.get(id)
    if (!n) return { refused: `its night ${id} is not public now, so its facts cannot be stated` }
    const s = studio.find((f): f is Record<string, unknown> => f !== null && typeof f === 'object' && ((f as Record<string, unknown>).eventId ?? (f as Record<string, unknown>).event_id) === id)
    if (!s) return { refused: `the studio states no facts for ${n.title}` }
    const start = s.startDate ?? s.start
    if (typeof start !== 'string' || Date.parse(start) !== Date.parse(n.startDate)) return { refused: `the studio states ${n.title} starts ${String(start)}; the listing reads ${n.startDate}` }
    out.push(n)
  }
  return { facts: out }
}

/** The intake record of a piece and its stored slides, in order. Pure. */
export function studioIntake(piece: PieceRow, images: readonly { url: string; restsOn: RestsOn }[], facts: readonly StatedFact[]): IntakeInput {
  return {
    briefId: piece.id,
    eventIds: piece.event_ids,
    format: piece.format,
    images,
    captions: { instagram: piece.captions.instagram ?? '', facebook: piece.captions.facebook ?? piece.captions.instagram ?? '' } as Record<Network, string>,
    destinations: piece.destinations as Network[],
    facts,
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
      const stated = statedFacts(piece.event_ids, piece.facts, await deps.facts(piece.event_ids))
      if ('refused' in stated) {
        await fail(stated.refused)
        continue
      }
      const images: { url: string; restsOn: RestsOn }[] = []
      for (const up of uploads.slice(0, piece.slides)) {
        const path = studioPath(piece.id, up.slide_no, piece.format)
        const url = await deps.store(path, byteaBytes(up.png))
        await db.from('studio_uploads').update({ moved_at: now.toISOString(), moved_to: url }).eq('id', up.id)
        images.push({ url, restsOn: up.rests_on })
      }
      const r = await deps.receive(studioIntake(piece, images, stated.facts))
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
