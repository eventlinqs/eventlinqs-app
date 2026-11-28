import { createAdminClient } from '@/lib/supabase/admin'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { readEngine } from './engine'
import { PREFLIGHT_ACTION } from '@/lib/social/preflight-line'
import { notPublishedNames, readTodaySchedule } from '@/lib/social/published-check'
import { readAcqPool } from '@/lib/outreach/acq-pool'
import { readPageChecks } from '@/lib/outreach/page-checks'
import { allWell, areaOfPlay, morningRows, type MorningFacts, type MorningRow } from './morning-report-math'

/**
 * THE 08:00 REPORT'S SEVEN PARTS, READ FROM PRODUCTION THAT MORNING (car D, part 2; the operating model, section 10; law 14
 * (f): no figure goes to Lawal unless read from the database that minute). Yesterday and today are Melbourne's own days
 * (midnightIn, right on daylight saving days). Each area is read on its own: a read that fails makes THAT area "not known"
 * and is named, and never prints a zero that reads like a calm day. Read only: it counts and writes nothing.
 * The words are ./morning-report-math.ts's; /api/ops/state hands this to the daily email (scripts/lib/state-report.mjs).
 */

type Db = ReturnType<typeof createAdminClient>
const ZONE = 'Australia/Melbourne'
const HOUR = 3_600_000

/** One organiser page the engine checked (law 43), with what the report links to: its saved copy and its Stop. */
export type ReportPageCheck = { readonly id: string; readonly organiser: string; readonly pageUrl: string; readonly stopped: boolean }

export type MorningReport = {
  readonly rows: readonly MorningRow[]
  readonly allWell: boolean
  readonly unreadable: readonly string[]
  readonly engine: string
  /** Every organiser page the engine checked since yesterday began, newest first (law 43). */
  readonly pageChecks?: readonly ReportPageCheck[]
  /** Yesterday's and today's posts that did not publish, by name; the daily email's headline reads them (fix (c)). */
  readonly postsNotPublished: readonly string[]
}

type Window = { readonly from: string; readonly to: string }

/** Melbourne's yesterday and today, as half open windows. */
export function windowsAt(now: Date): { yesterday: Window; today: Window } {
  const today = midnightIn(now, ZONE)
  const yesterday = midnightIn(new Date(today.getTime() - 12 * HOUR), ZONE)
  const tomorrow = midnightIn(new Date(today.getTime() + 36 * HOUR), ZONE)
  return { yesterday: { from: yesterday.toISOString(), to: today.toISOString() }, today: { from: today.toISOString(), to: tomorrow.toISOString() } }
}

/** A head count, or the read's own fault thrown. */
async function counted(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(`${what}: ${error.message}`)
  return count ?? 0
}

async function readLetters(db: Db, w: { yesterday: Window; today: Window }) {
  const plays = await db.from('outreach_plays').select('id, name')
  if (plays.error) throw new Error(`the plays: ${plays.error.message}`)
  const ids = (area: 'Organiser Marketing' | 'Event Photo Permissions') => (plays.data ?? []).filter((p) => areaOfPlay(p.name as string) === area).map((p) => p.id as string)
  const sentIn = (playIds: string[]) =>
    playIds.length === 0 ? Promise.resolve(0) : counted(db.from('outreach_touches').select('id', { count: 'exact', head: true }).in('play_id', playIds).eq('step', 1).eq('state', 'sent').gte('sent_at', w.yesterday.from).lt('sent_at', w.yesterday.to), 'first letters sent')
  const queuedIn = (playIds: string[]) =>
    playIds.length === 0 ? Promise.resolve(0) : counted(db.from('outreach_touches').select('id', { count: 'exact', head: true }).in('play_id', playIds).eq('step', 1).eq('state', 'queued').gte('scheduled_for', w.today.from).lt('scheduled_for', w.today.to), 'letters queued for today')
  const acq = ids('Organiser Marketing')
  const perm = ids('Event Photo Permissions')
  const [firsts, ready, requests, due] = await Promise.all([sentIn(acq), queuedIn(acq), sentIn(perm), queuedIn(perm)])
  return { firsts, ready, requests, due }
}

export async function readMorningReport(now: Date = new Date()): Promise<MorningReport> {
  const db = createAdminClient()
  const w = windowsAt(now)
  const unreadable: string[] = []
  const safely = async <T,>(area: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read()
    } catch (fault) {
      unreadable.push(`${area}: ${fault instanceof Error ? fault.message : String(fault)}`)
      return null
    }
  }

  const letters = await safely('letters', () => readLetters(db, w))
  // The day's pool of organisers with a recorded basis not yet written (src/lib/outreach/acq-pool.ts); a failed read
  // says the pool could not be read, never a zero.
  const pool = await readAcqPool(db, now).catch((fault: unknown) => {
    unreadable.push(`the Organiser Marketing pool: ${fault instanceof Error ? fault.message : String(fault)}`)
    return null
  })
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, weekday: 'short' }).format(now)
  const replies = await safely('replies', async () => ({
    received: await counted(db.from('outreach_replies').select('id', { count: 'exact', head: true }).gte('received_at', w.yesterday.from).lt('received_at', w.yesterday.to), 'replies received'),
    positive: await counted(db.from('outreach_replies').select('id', { count: 'exact', head: true }).eq('outcome', 'yes').gte('received_at', w.yesterday.from).lt('received_at', w.yesterday.to), 'positive replies'),
    waiting: await counted(db.from('outreach_replies').select('id', { count: 'exact', head: true }).eq('needs_lawal', true).is('action_taken', null), 'replies waiting'),
  }))
  const photos = await safely('photos', async () => ({
    received: await counted(db.from('social_assets').select('id', { count: 'exact', head: true }).eq('asset_state', 'organiser_authorised').gte('created_at', w.yesterday.from).lt('created_at', w.yesterday.to), 'photos received'),
    approved: await counted(db.from('social_assets').select('id', { count: 'exact', head: true }).eq('asset_state', 'organiser_authorised').eq('approval_status', 'approved').gte('created_at', w.yesterday.from).lt('created_at', w.yesterday.to), 'photos approved'),
  }))
  const social = await safely('Social Media Marketing', async () => {
    // A day publishes a handful (the cadence bands); fifty is far above any day the policy allows, and is said if reached.
    const pub = await db.from('social_piece_schedules').select('platform, published_ref').eq('state', 'published').gte('published_at', w.yesterday.from).lt('published_at', w.yesterday.to).limit(50)
    if (pub.error) throw new Error(`posts published: ${pub.error.message}`)
    if ((pub.data ?? []).length === 50) throw new Error('fifty or more posts in a day, more than the publishing policy allows; read the engine page')
    return {
      published: (pub.data ?? []).map((p) => ({ platform: p.platform as string, ref: (p.published_ref as string | null) ?? null })),
      scheduledToday: await counted(db.from('social_piece_schedules').select('id', { count: 'exact', head: true }).eq('state', 'scheduled').gte('go_at', w.today.from).lt('go_at', w.today.to), 'posts scheduled'),
      held: await counted(db.from('social_piece_schedules').select('id', { count: 'exact', head: true }).eq('state', 'held').gte('go_at', w.today.from), 'posts held'),
      preflight: await (async () => {
        // Today's pre-flight (src/lib/social/preflight.ts), its line and, only when nothing can post, why.
        const pre = await db.from('audit_log').select('metadata').eq('action', PREFLIGHT_ACTION).gte('created_at', w.today.from).order('created_at', { ascending: false }).limit(1)
        if (pre.error) throw new Error(`the pre-flight: ${pre.error.message}`)
        const meta = ((pre.data ?? [])[0]?.metadata ?? null) as { line?: unknown; nothingCanPost?: unknown } | null
        return meta && typeof meta.line === 'string' ? { line: meta.line, nothingCanPost: typeof meta.nothingCanPost === 'string' ? meta.nothingCanPost : null } : null
      })(),
      // Yesterday's and today's posts that did not publish, by name: the daily state never reads ALL GREEN beside one
      // (the PM's 22:50 of 28 November 2026, fix (c); src/lib/social/published-check.ts).
      notPublished: notPublishedNames([...(await readTodaySchedule(db, new Date(w.yesterday.from))), ...(await readTodaySchedule(db, new Date(w.today.from)))], now),
    }
  })
  const listings = await safely('Event Listings', async () => ({
    published: await counted(db.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_test', false).gte('published_at', w.yesterday.from).lt('published_at', w.yesterday.to), 'events published'),
    ended: await counted(db.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_test', false).gte('end_date', w.yesterday.from).lt('end_date', w.yesterday.to), 'events ended'),
    onToday: await counted(db.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_test', false).lt('start_date', w.today.to).gte('end_date', w.today.from), 'events on today'),
  }))
  const ticketing = await safely('Ticketing & Revenue', async () => {
    // Revenue truth (law 2 of 31 October): EventLinqs' own retained fee, never the gross ticket sales.
    const orders = await db.from('orders').select('organisation_id, platform_fee_retained_cents').eq('status', 'confirmed').eq('is_test', false).gte('confirmed_at', w.yesterday.from).lt('confirmed_at', w.yesterday.to).limit(1000)
    if (orders.error) throw new Error(`orders: ${orders.error.message}`)
    if ((orders.data ?? []).length === 1000) throw new Error('a thousand or more orders in a day: the report reads them in full before it counts them')
    const rows = orders.data ?? []
    const orgs = [...new Set(rows.map((o) => o.organisation_id as string))]
    let activations = 0
    for (const org of orgs) {
      const before = await counted(db.from('orders').select('id', { count: 'exact', head: true }).eq('organisation_id', org).eq('status', 'confirmed').eq('is_test', false).lt('confirmed_at', w.yesterday.from), 'earlier orders')
      if (before === 0) activations += 1
    }
    return { ordersConfirmed: rows.length, feeRevenueCents: rows.reduce((n, o) => n + ((o.platform_fee_retained_cents as number | null) ?? 0), 0), activations }
  })
  const engine = await safely('System Operations', () => readEngine(now))
  // LAW 43 (Lawal, 21 November 2026, 01:05): each page the engine checked, with its link and its Stop.
  const pageChecks = await safely('the engine page checks', () => readPageChecks(db, w.yesterday.from))

  const facts: MorningFacts = {
    marketing: letters && replies ? { firstLettersSent: letters.firsts, positiveReplies: replies.positive, readyToday: letters.ready, poolToday: pool, businessDay: weekday !== 'Sun' } : null,
    permissions: letters && photos ? { requestsSent: letters.requests, photosReceived: photos.received, photosApproved: photos.approved, requestsDueToday: letters.due } : null,
    social,
    listings,
    relationships: replies ? { repliesReceived: replies.received, waitingForLawal: replies.waiting } : null,
    ticketing,
    system: engine
      ? {
          failures: engine
            .filter((r) => r.lastFailure && r.lastFailure.at >= w.yesterday.from && r.lastFailure.at < w.today.to)
            .map((r) => ({ title: r.title, recovered: r.lastFailure?.recovered ?? null })),
          unreadable: engine.filter((r) => r.readFailed).map((r) => `${r.title}: ${r.readFailed}`),
        }
      : null,
  }
  return {
    rows: morningRows(facts),
    allWell: allWell(facts),
    unreadable,
    engine: '/admin/engine',
    pageChecks: (pageChecks ?? []).map((c) => ({ id: c.id, organiser: c.organiser, pageUrl: c.pageUrl, stopped: c.stoppedAt !== null })),
    postsNotPublished: social?.notPublished ?? [],
  }
}
