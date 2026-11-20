import { createAdminClient } from '@/lib/supabase/admin'
import { nextRun } from './automation-math'
import { countOf } from '@/lib/text/plural'
import { SCHEDULES, type Schedule } from './automation-schedules'
import { DAYS_READ, lastDays, newestOf, provingOf, recoveredAfter, type DayBounds, type Proving } from './engine-math'

/**
 * /admin/engine, ONE ROW PER AUTOMATION (the operating model's amendment 1, A4 and A5; the PM's 01:39 of 19 November 2026,
 * item 3: "built from the crons and records that exist, not new ones"). Each row: its business area (law 25's names) and
 * what it does; its schedule and next run; its last production run, in numbers, with its evidence; its last failure and
 * whether a good run followed it; its switch and who set it; and A5's "proving, day N of 3", each day read from the
 * automation's own records. Every figure is read now; a read that fails says so on its row, never a zero, and no row
 * says it runs without a production run behind it. The rules are ./engine-math.ts.
 */

export type EngineRow = {
  readonly key: string
  readonly title: string
  readonly area: string
  readonly does: string
  readonly schedules: readonly { readonly where: Schedule['where']; readonly cron: string; readonly next: string | null }[]
  readonly lastRun: { readonly at: string; readonly what: string; readonly evidence: string | null } | null
  readonly lastFailure: { readonly at: string; readonly what: string; readonly recovered: boolean | null } | null
  readonly switch: string
  /** A5 over its own records; null where its runs are kept outside this database (GitHub's own runs). */
  readonly proving: Proving | null
  readonly note: string | null
  readonly readFailed: string | null
}

type Db = ReturnType<typeof createAdminClient>
type Counted = PromiseLike<{ count: number | null; error: { message: string } | null }>
type Read = Pick<EngineRow, 'lastRun' | 'lastFailure' | 'switch' | 'note'> & { readonly days: readonly { day: string; ran: boolean }[] | null }

async function ranOn(label: string, days: readonly DayBounds[], count: (d: DayBounds) => Counted): Promise<{ day: string; ran: boolean }[]> {
  return Promise.all(
    days.map(async (d) => {
      const { count: n, error } = await count(d)
      if (error) throw new Error(`${label}: ${error.message}`)
      return { day: d.day, ran: (n ?? 0) > 0 }
    }),
  )
}

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

async function row(base: Pick<EngineRow, 'key' | 'title' | 'area' | 'does'> & { schedules: Schedule[] }, now: Date, read: () => Promise<Read>): Promise<EngineRow> {
  const schedules = base.schedules.map((s) => ({ where: s.where, cron: s.cron, next: nextRun(s.cron, now)?.toISOString() ?? null }))
  try {
    const r = await read()
    return { key: base.key, title: base.title, area: base.area, does: base.does, schedules, lastRun: r.lastRun, lastFailure: r.lastFailure, switch: r.switch, proving: r.days ? provingOf(r.days) : null, note: r.note, readFailed: null }
  } catch (err) {
    return { key: base.key, title: base.title, area: base.area, does: base.does, schedules, lastRun: null, lastFailure: null, switch: 'not read', proving: null, note: null, readFailed: err instanceof Error ? err.message : String(err) }
  }
}

/** Every row of the engine page, read now. */
export async function readEngine(now: Date = new Date()): Promise<EngineRow[]> {
  const db: Db = createAdminClient()
  const days = lastDays(now, DAYS_READ)
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString()

  /* Listing checks name their writer (import_file), so each listing automation's runs are read from its own rows. */
  const checksBy = (pattern: string) => async (): Promise<Pick<Read, 'days'> & { last: string | null; n: number }> => {
    const [ran, newest, { count, error }] = await Promise.all([
      ranOn(`listing_checks ${pattern}`, days, (d) =>
        db.from('listing_checks').select('id', { count: 'exact', head: true }).like('import_file', pattern).gte('checked_at', d.from).lt('checked_at', d.to),
      ),
      db.from('listing_checks').select('checked_at').like('import_file', pattern).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('listing_checks').select('id', { count: 'exact', head: true }).like('import_file', pattern).gte('checked_at', days[0].from),
    ])
    const last = must('listing_checks', newest) as { checked_at: string } | null
    if (error) throw new Error(`listing_checks: ${error.message}`)
    return { days: ran, last: last?.checked_at ?? null, n: count ?? 0 }
  }

  return Promise.all([
    row(
      {
        key: 'social-publish',
        title: 'Social posts: plan, draw again, publish',
        area: 'Social Media Marketing',
        does: "Plans the week's posts, draws again any drawing the rules in force correct, gives each approved post its moment and publishes it on Instagram and Facebook through Blotato.",
        schedules: [SCHEDULES.socialPublish],
      },
      now,
      async () => {
        const [ran, drawnRead, pubRead, heldRead, flagRead] = await Promise.all([
          ranOn('social_piece_revisions', days, async (d) => {
            const drawn = await db.from('social_piece_revisions').select('id', { count: 'exact', head: true }).eq('made_by', 'sweep').gte('made_at', d.from).lt('made_at', d.to)
            if (drawn.error || (drawn.count ?? 0) > 0) return drawn
            return db.from('social_piece_schedules').select('id', { count: 'exact', head: true }).gte('published_at', d.from).lt('published_at', d.to)
          }),
          db.from('social_piece_revisions').select('made_at').eq('made_by', 'sweep').order('made_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('social_piece_schedules').select('published_at, published_ref, platform').not('published_at', 'is', null).order('published_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('social_piece_schedules').select('created_at, held_reason, platform').eq('state', 'held').not('held_reason', 'like', 'Sent as blotato:%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle(),
        ])
        const drawn = must('social_piece_revisions', drawnRead) as { made_at: string } | null
        const pub = must('social_piece_schedules', pubRead) as { published_at: string; published_ref: string | null; platform: string } | null
        const held = must('social_piece_schedules', heldRead) as { created_at: string; held_reason: string | null; platform: string } | null
        const flag = must('feature_flags', flagRead) as { enabled: boolean } | null
        const lastAt = newestOf(drawn?.made_at, pub?.published_at)
        return {
          days: ran,
          lastRun: lastAt
            ? lastAt === pub?.published_at
              ? { at: lastAt, what: `published a post on ${pub.platform}`, evidence: pub.published_ref }
              : { at: lastAt, what: 'drew posts again in the rules in force', evidence: null }
            : null,
          lastFailure: held ? { at: held.created_at, what: `held on ${held.platform}: ${(held.held_reason ?? 'no reason recorded').slice(0, 160)}`, recovered: recoveredAfter(held.created_at, pub?.published_at ?? null) } : null,
          switch: `Publishing by itself is ${flag?.enabled ? 'on' : 'off'}`,
          note: null,
        }
      },
    ),
    row(
      {
        key: 'outreach-run',
        title: 'Letters: first contacts and photo permission',
        area: 'Organiser Marketing and Event Photo Permissions',
        does: 'Drafts the day’s letters for approval, sends each approved letter from its queue through Graph, and checks the sending domain every six hours.',
        schedules: [SCHEDULES.outreachRun],
      },
      now,
      async () => {
        const [ran, senderRead, sentRead, failedRead] = await Promise.all([
          ranOn('outreach_touches', days, (d) =>
            db.from('outreach_touches').select('id', { count: 'exact', head: true }).or(`and(sent_at.gte.${d.from},sent_at.lt.${d.to}),and(drafted_at.gte.${d.from},drafted_at.lt.${d.to})`),
          ),
          db.from('outreach_sender').select('mode, changed_by, dns_checked_at').limit(1).maybeSingle(),
          db.from('outreach_touches').select('sent_at, internet_message_id').is('sent_by', null).not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('outreach_touches').select('drafted_at, sending_at, failed_reason').not('failed_reason', 'is', null).gte('drafted_at', week).order('drafted_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        const sender = must('outreach_sender', senderRead) as { mode: string; changed_by: string | null; dns_checked_at: string | null } | null
        const sent = must('outreach_touches', sentRead) as { sent_at: string; internet_message_id: string | null } | null
        const failed = must('outreach_touches', failedRead) as { drafted_at: string; sending_at: string | null; failed_reason: string } | null
        const lastAt = newestOf(sent?.sent_at, sender?.dns_checked_at)
        const failedAt = failed ? (failed.sending_at ?? failed.drafted_at) : null
        return {
          days: ran,
          lastRun: lastAt ? (lastAt === sent?.sent_at ? { at: lastAt, what: 'sent an approved letter by itself', evidence: sent.internet_message_id } : { at: lastAt, what: 'checked SPF, DKIM and DMARC', evidence: null }) : null,
          lastFailure: failed && failedAt ? { at: failedAt, what: failed.failed_reason.slice(0, 160), recovered: recoveredAfter(failedAt, sent?.sent_at ?? null) } : null,
          switch: sender ? `The sender is ${sender.mode}${sender.changed_by ? ', set by a person' : ', never set by a person'}` : 'no sender row',
          note: null,
        }
      },
    ),
    row(
      {
        key: 'collection-run',
        title: 'Listings: the collection run and the scout',
        area: 'Event Listings',
        does: "Reads every registered source due, lists a partner's own nights by its rule and holds the rest for a person; on the 23:25 turn the scout examines new sites; then it writes the engine's day line.",
        schedules: [SCHEDULES.collectionRun],
      },
      now,
      async () => {
        const [c, failedRead, goodRead, lineRead] = await Promise.all([
          checksBy('collection run%')(),
          db.from('listing_source_runs').select('ran_at, outcome').eq('succeeded', false).gte('ran_at', week).order('ran_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('listing_source_runs').select('ran_at').eq('succeeded', true).order('ran_at', { ascending: false }).limit(1).maybeSingle(),
          db.from('discovery_engine_days').select('day, all_passed, checks').order('day', { ascending: false }).limit(3),
        ])
        const failed = must('listing_source_runs', failedRead) as { ran_at: string; outcome: string | null } | null
        const good = must('listing_source_runs', goodRead) as { ran_at: string } | null
        const line = must('discovery_engine_days', lineRead) as { day: string; all_passed: boolean; checks: Record<string, { pass: boolean; why: string }> }[] | null
        const judged = (line ?? []).find((d) => Object.keys(d.checks ?? {}).length > 0)
        const failing = judged ? Object.entries(judged.checks).filter(([, v]) => !v.pass).map(([k, v]) => `${k}: ${v.why}`) : []
        return {
          days: c.days,
          lastRun: c.last ? { at: c.last, what: `confirmed listings against their sources (${c.n} today)`, evidence: null } : null,
          lastFailure: failed ? { at: failed.ran_at, what: `a source's read failed: ${(failed.outcome ?? '').slice(0, 140)}`, recovered: recoveredAfter(failed.ran_at, good?.ran_at ?? null) } : null,
          switch: 'Runs by itself; no switch',
          note: judged ? `The engine's day line for ${judged.day}: ${judged.all_passed ? 'every check passed' : `not all passed (${failing.join('; ')})`}.` : null,
        }
      },
    ),
    row(
      { key: 'big-event-hunt', title: 'Listings: the big event hunt', area: 'Event Listings', does: "Reads the headline venues' own pages twice a day and lists their new ticketed nights by the hunt's rule.", schedules: [SCHEDULES.bigEventHunt] },
      now,
      async () => {
        const c = await checksBy('big event hunt%')()
        return { days: c.days, lastRun: c.last ? { at: c.last, what: `confirmed headline nights (${c.n} today)`, evidence: null } : null, lastFailure: null, switch: 'Runs by itself; no switch', note: null }
      },
    ),
    row(
      { key: 'listing-occurrences', title: "Listings: each night's own day", area: 'Event Listings', does: "Every hour: reads a listed night again on its own day, writes the next nights of a series, and takes an ended night off the guides.", schedules: [SCHEDULES.listingOccurrences] },
      now,
      async () => {
        const c = await checksBy('same day re-read')()
        return { days: c.days, lastRun: c.last ? { at: c.last, what: `read nights again on their own day (${c.n} today)`, evidence: null } : null, lastFailure: null, switch: 'Runs by itself; no switch', note: null }
      },
    ),
    row(
      { key: 'booking-link-check', title: 'Listings: booking links and prices', area: 'Event Listings', does: 'Once a day: asks every booking link whether it still reaches its seller, and reads its price.', schedules: [SCHEDULES.bookingLinkCheck] },
      now,
      async () => {
        const [ran, lastRead] = await Promise.all([
          ranOn('event_booking_links', days, (d) => db.from('event_booking_links').select('id', { count: 'exact', head: true }).gte('price_checked_at', d.from).lt('price_checked_at', d.to)),
          db.from('event_booking_links').select('price_checked_at').not('price_checked_at', 'is', null).order('price_checked_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        const last = must('event_booking_links', lastRead) as { price_checked_at: string } | null
        return { days: ran, lastRun: last ? { at: last.price_checked_at, what: 'checked booking links and their prices', evidence: null } : null, lastFailure: null, switch: 'Runs by itself; no switch', note: null }
      },
    ),
    row(
      { key: 'growth-scorecard', title: 'The daily scorecard', area: 'System Operations', does: "Once a day: reads the plan's numbers from production and keeps the day's scorecard.", schedules: [SCHEDULES.growthScorecard] },
      now,
      async () => {
        const [ran, lastRead] = await Promise.all([
          ranOn('growth_scorecard_daily', days, (d) => db.from('growth_scorecard_daily').select('day', { count: 'exact', head: true }).gte('read_at', d.from).lt('read_at', d.to)),
          db.from('growth_scorecard_daily').select('day, read_at, plan_version').order('read_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        const last = must('growth_scorecard_daily', lastRead) as { day: string; read_at: string; plan_version: number } | null
        return { days: ran, lastRun: last ? { at: last.read_at, what: `kept the scorecard for ${last.day} (plan version ${last.plan_version})`, evidence: null } : null, lastFailure: null, switch: 'Runs by itself; no switch', note: null }
      },
    ),
    row(
      { key: 'social-measure', title: "Social posts: the platforms' own figures", area: 'Social Media Marketing', does: "Once a day after 06:40: reads each post's reach, views, saves, shares and clicks from Blotato and keeps them apart from our own counts.", schedules: [SCHEDULES.socialPublish] },
      now,
      async () => {
        const [ran, lastRead] = await Promise.all([
          ranOn('social_measure_runs', days, (d) => db.from('social_measure_runs').select('id', { count: 'exact', head: true }).gte('ran_at', d.from).lt('ran_at', d.to)),
          db.from('social_measure_runs').select('ran_at, kept').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        const last = must('social_measure_runs', lastRead) as { ran_at: string; kept: number } | null
        return { days: ran, lastRun: last ? { at: last.ran_at, what: `kept ${countOf(last.kept, 'figure')}`, evidence: null } : null, lastFailure: null, switch: 'Runs inside the hourly social run', note: null }
      },
    ),
    row(
      { key: 'state-report', title: 'The daily state', area: 'System Operations', does: "Once a day on GitHub: reads the platform's state and sends it.", schedules: [SCHEDULES.stateReport] },
      now,
      async () => ({ days: null, lastRun: null, lastFailure: null, switch: 'Runs on GitHub Actions', note: 'Its runs are kept by GitHub, not in this database: read them in the repository’s Actions tab.' }),
    ),
    row(
      { key: 'engine-verifier', title: 'The engine verifier', area: 'System Operations', does: 'Twice a day on GitHub: checks listed nights against their sources, field by field.', schedules: [SCHEDULES.engineVerifier, SCHEDULES.engineVerifierMorning] },
      now,
      async () => ({ days: null, lastRun: null, lastFailure: null, switch: 'Runs on GitHub Actions', note: 'Its runs are kept by GitHub, not in this database: read them in the repository’s Actions tab.' }),
    ),
  ])
}
