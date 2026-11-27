import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntakeInput, Network, RestsOn, StatedFact } from '@/lib/creative/intake'
import { checkLine, checkProblems } from './studio-check'

/**
 * THE STUDIO BRIDGE'S MOVE (the PM's 14:12 and 14:20 of 27 November 2026, car N step 2b (c); migration 20261127140001).
 * The social studio, a scheduled cloud Claude session, writes its pieces into studio_pieces through SQL, and its rendered
 * slides reach studio_uploads (through SQL, or the laptop inbox uploader, car R). This moves each piece whose every slide
 * has arrived: each PNG stored once as JPEG under event-images/creative/<piece id>/<slide>-<format>.jpg (car R1: the one
 * place the creative intake takes a finished design, and the format Instagram's publishing takes), then the piece handed
 * to the creative intake with its slides in order, captions, nights, facts, link and slot, where every existing check
 * runs as now (facts, rights, the founder's approval). A refusal is written on the piece, never a silent drop; nothing is
 * published here.
 *
 * THE PHONE CHECK (Lawal, 16:52: "no piece reaches Lawal without a passed phone check"; the PM's 17:00, car Q; migration
 * 20261127170001; ./studio-check.ts): a piece moves only when every slide's ten items pass and every slide has its phone
 * view. Otherwise it stays, its reason written on the piece (held_reason) and, once for each new reason, in ops_phase_runs
 * (deps.held); it is read again on every run, so a fixed checklist or a replaced slide moves it. Each slide's phone view
 * is stored beside it (<slide>-<format>-phone.jpg) for /admin/social, including for a piece that moved before the check.
 */

type Db = SupabaseClient

export type StudioView = 'full' | 'phone' | 'grid' | 'desktop'

export type StudioMoveDeps = {
  readonly store: (path: string, bytes: Uint8Array) => Promise<string>
  readonly receive: (input: IntakeInput) => Promise<{ readonly state: string; readonly id?: string; readonly reason?: string; readonly faults?: readonly string[] }>
  /** Each night as the engine reads it now, by its id (store.ts readCampaignNights); a night not public now is absent. */
  readonly facts: (eventIds: readonly string[]) => Promise<ReadonlyMap<string, StatedFact>>
  /** The hold, said once for each new reason (the run writes it into ops_phase_runs). */
  readonly held?: (pieceKey: string, reason: string) => Promise<void>
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
  qa_checklist?: unknown
  held_reason?: string | null
}

type UploadRow = { id: string; slide_no: number; view: StudioView; rests_on: RestsOn }

/** A bytea as PostgREST returns it ('\x' and hex) as bytes. Pure. */
export function byteaBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

/** Where a slide is stored, as JPEG: the creative intake's own place (campaign.ts isCreativeFileUrl); a view beside it. Pure. */
export function studioPath(pieceId: string, slideNo: number, format: string, view: StudioView = 'full'): string {
  return `creative/${pieceId}/${slideNo}-${format}${view === 'full' ? '' : `-${view}`}.jpg`
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

/** One upload's PNG stored at its path and marked moved; its bytes are read only now, one at a time. */
async function storeUpload(db: Db, deps: StudioMoveDeps, up: { id: string }, path: string, now: Date): Promise<string> {
  const b = await db.from('studio_uploads').select('png').eq('id', up.id).single()
  if (b.error || !b.data) throw new Error(`the PNG of ${path} could not be read: ${b.error?.message ?? 'no row'}`)
  const url = await deps.store(path, byteaBytes(String((b.data as { png: string }).png)))
  await db.from('studio_uploads').update({ moved_at: now.toISOString(), moved_to: url }).eq('id', up.id)
  return url
}

/** Moves every piece whose slides have all arrived and whose phone check passed; one line a piece. A read that fails throws. */
export async function moveStudioPieces(db: Db, deps: StudioMoveDeps, now: Date): Promise<string[]> {
  const p = await db
    .from('studio_pieces')
    .select('id, brief_id, piece_key, format, slides, captions, destinations, event_ids, facts, link, objective, preferred_at, latest_at, expires_at, qa_checklist, held_reason')
    .is('moved_at', null)
    .is('error', null)
    // A piece past its expiry never moves (the intake would refuse it), so a held one drops out and never blocks newer ones.
    .gt('expires_at', now.toISOString())
    .order('created_at')
    .limit(20)
  if (p.error) throw new Error(`the studio's pieces could not be read: ${p.error.message}`)
  const lines: string[] = []
  for (const piece of (p.data ?? []) as PieceRow[]) {
    const fail = async (why: string) => {
      await db.from('studio_pieces').update({ error: why.slice(0, 1000) }).eq('id', piece.id)
      lines.push(`${piece.piece_key}: NOT MOVED, ${why}`)
    }
    try {
      const u = await db.from('studio_uploads').select('id, slide_no, view, rests_on').eq('piece_key', piece.piece_key).eq('format', piece.format).order('slide_no')
      if (u.error) throw new Error(`its slides could not be read: ${u.error.message}`)
      const uploads = (u.data ?? []) as UploadRow[]
      const slideOf = (n: number, view: StudioView) => uploads.find((x) => x.slide_no === n && (x.view ?? 'full') === view)
      const numbers = Array.from({ length: piece.slides }, (_, i) => i + 1)
      const full = numbers.map((n) => slideOf(n, 'full')).filter((x): x is UploadRow => x !== undefined)
      if (full.length < piece.slides) {
        lines.push(`${piece.piece_key}: waiting, ${full.length} of ${piece.slides} slides arrived`)
        continue
      }
      const problems = checkProblems(piece.qa_checklist ?? null, piece.slides, new Set(numbers.filter((n) => slideOf(n, 'phone') !== undefined)))
      if (problems.length > 0) {
        const reason = `Held by the phone check: ${problems.join('; ')}`.slice(0, 1000)
        if (reason !== (piece.held_reason ?? null)) {
          const w = await db.from('studio_pieces').update({ held_reason: reason, held_at: now.toISOString() }).eq('id', piece.id)
          if (w.error) console.error(`[social/studio-move] the hold of ${piece.piece_key} could not be written: ${w.error.message}`)
          await deps.held?.(piece.piece_key, reason)
        }
        lines.push(`${piece.piece_key}: HELD, ${reason}`)
        continue
      }
      const stated = statedFacts(piece.event_ids, piece.facts, await deps.facts(piece.event_ids))
      if ('refused' in stated) {
        await fail(stated.refused)
        continue
      }
      const images: { url: string; restsOn: RestsOn }[] = []
      for (const up of full) images.push({ url: await storeUpload(db, deps, up, studioPath(piece.id, up.slide_no, piece.format), now), restsOn: up.rests_on })
      for (const n of numbers) await storeUpload(db, deps, slideOf(n, 'phone') as UploadRow, studioPath(piece.id, n, piece.format, 'phone'), now)
      const r = await deps.receive(studioIntake(piece, images, stated.facts))
      if (r.state === 'refused') {
        await fail(`the creative intake refused it: ${r.reason ?? 'no reason given'}`)
        continue
      }
      await db.from('studio_pieces').update({ moved_at: now.toISOString(), intake_id: r.id ?? null, held_reason: null, held_at: null }).eq('id', piece.id)
      lines.push(`${piece.piece_key}: moved, ${images.length} slides and their phone views, ${checkLine([], piece.slides)} Intake ${r.state}${r.faults?.length ? ` (${r.faults.join('; ')})` : ''}`)
    } catch (err) {
      await fail(err instanceof Error ? err.message : String(err))
    }
  }
  lines.push(...(await storeLatePhoneViews(db, deps, now)))
  return lines
}

/**
 * A phone view that arrives for a piece already moved (one that moved before the check, or a view sent after) is stored
 * beside its slide, so /admin/social shows what the phone shows. It never moves the piece again. A failure is said.
 */
async function storeLatePhoneViews(db: Db, deps: StudioMoveDeps, now: Date): Promise<string[]> {
  const v = await db.from('studio_uploads').select('id, piece_key, slide_no, format').eq('view', 'phone').is('moved_at', null).order('created_at').limit(40)
  if (v.error) return [`late phone views could not be read: ${v.error.message}`]
  const views = (v.data ?? []) as { id: string; piece_key: string; slide_no: number; format: string }[]
  if (views.length === 0) return []
  const m = await db.from('studio_pieces').select('id, piece_key').in('piece_key', [...new Set(views.map((x) => x.piece_key))]).not('moved_at', 'is', null)
  if (m.error) return [`the moved pieces could not be read: ${m.error.message}`]
  const moved = new Map(((m.data ?? []) as { id: string; piece_key: string }[]).map((x) => [x.piece_key, x.id]))
  const lines: string[] = []
  for (const x of views) {
    const pieceId = moved.get(x.piece_key)
    if (!pieceId) continue
    try {
      await storeUpload(db, deps, x, studioPath(pieceId, x.slide_no, x.format, 'phone'), now)
      lines.push(`${x.piece_key}: phone view of slide ${x.slide_no} stored`)
    } catch (err) {
      lines.push(`${x.piece_key}: phone view of slide ${x.slide_no} NOT STORED, ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return lines
}
