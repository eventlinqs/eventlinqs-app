import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ACQ_DAILY_TARGET, ACQ_GUIDE_CITIES } from '@/lib/outreach/acq-target'
import { readAcqPool } from '@/lib/outreach/acq-pool'
import { answerClassOf } from '@/lib/outreach/answer-timing'
import { ANSWER_TARGET_MINUTES, type TimedClass } from '@/lib/outreach/answer-report'

type Admin = SupabaseClient<Database>

/**
 * THE DAY'S WINS, EACH AGAINST ITS TARGET, IN THE 08:00 REPORT (Lawal, 26 November 2026, 00:04: "This engine must be
 * responsible for wins every day. It must not just be doing tasks. It must have objectives every day"; the PM's 00:04,
 * item 2). Yesterday's actual for each win, read from production, beside its approved target, and what the engine does
 * today about a miss. Targets are only the approved ones (C:\dev\GROWTH\plan.json version 8, daily_quotas; law 38): ten
 * first letters a send day, and one post per open city a day; a reply answered inside its own time is every one (the
 * PM's rule of 15:10 on 25 November); a pool of ten for the next send day (law 38's note). A win with no approved daily
 * target says so, and no target is invented. Today's action names only what the engine already does; no new spend and no
 * new contact rule.
 */
export type Win = {
  readonly name: string
  /** The approved target, or null where the plan sets none for a day. */
  readonly target: number | null
  /** Yesterday's actual, or null when it could not be read (said, never a zero). */
  readonly actual: number | null
  /** Words after the number: its breakdown or what was read. */
  readonly detail?: string
  /** What the engine does today when the target is missed. */
  readonly whenMissed?: string
  readonly unread?: string
}

/** One open city's post a day (plan.json version 8, daily_quotas.social_posts_per_open_city). */
export const POSTS_PER_OPEN_CITY = 1

/** One win in words. Pure. */
export function winWords(w: Win): string {
  if (w.actual === null) return `${w.name}: not read${w.unread ? ` (${w.unread})` : ''}`
  const detail = w.detail ? ` (${w.detail})` : ''
  if (w.target === null) return `${w.name}: ${w.actual}${detail}, no daily target in the plan`
  if (w.actual >= w.target) return `${w.name}: ${w.actual} of ${w.target}${detail}, MET`
  return `${w.name}: ${w.actual} of ${w.target}${detail}, MISSED by ${w.target - w.actual}${w.whenMissed ? `; today: ${w.whenMissed}` : ''}`
}

/** The scoreboard in one line for the report. Pure. */
export function scoreboardLine(day: string, wins: readonly Win[]): string {
  const missed = wins.filter((w) => w.actual !== null && w.target !== null && w.actual < w.target).length
  const head = missed === 0 ? `${day}: every target met.` : `${day}: ${missed} target${missed === 1 ? '' : 's'} missed.`
  return `${head} ${wins.map(winWords).join('. ')}.`
}

const ZONE = 'Australia/Melbourne'

/** The start of a Melbourne day, as an instant. */
function melbourneMidnight(at: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  return new Date(at.getTime() - (((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + at.getMilliseconds()))
}

type Read<T> = { ok: true; value: T } | { ok: false; why: string }
const safely = async <T>(what: string, read: () => Promise<T>): Promise<Read<T>> => {
  try {
    return { ok: true, value: await read() }
  } catch (err) {
    return { ok: false, why: `${what}: ${err instanceof Error ? err.message : String(err)}` }
  }
}
const countOf = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
  const r = await q
  if (r.error) throw new Error(r.error.message)
  return r.count ?? 0
}
const win = (r: Read<number>, base: Omit<Win, 'actual' | 'unread'>): Win => (r.ok ? { ...base, actual: r.value } : { ...base, actual: null, unread: r.why })

/** Yesterday's scoreboard, read from production; each win read alone, so one failed read never hides the others. */
export async function readScoreboard(db: Admin, now: Date): Promise<string> {
  const today = melbourneMidnight(now)
  const yesterday = melbourneMidnight(new Date(today.getTime() - 12 * 3_600_000))
  const from = yesterday.toISOString()
  const to = today.toISOString()
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(yesterday).replace(',', '')

  const letters = await safely('first letters', () =>
    countOf(db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('comms_subtype', 'ACQ-FIRST').eq('state', 'sent').gte('sent_at', from).lt('sent_at', to)),
  )

  // Replies answered inside their own time: each reply of the day with its class, against the answer that went to it.
  const answers = await safely('replies answered', async () => {
    const got = await db.from('outreach_replies').select('source_message_id, received_at, outcome, wording, touch_id').gte('received_at', from).lt('received_at', to).neq('outcome', 'bounce').limit(500)
    if (got.error) throw new Error(got.error.message)
    const rows = (got.data ?? []) as { source_message_id: string | null; received_at: string; outcome: string | null; wording: string | null; touch_id: string | null }[]
    const ids = rows.map((r) => r.source_message_id).filter((x): x is string => Boolean(x))
    const sent = ids.length ? await db.from('outreach_touches').select('in_reply_to, sent_at, outreach_templates(key)').eq('state', 'sent').in('in_reply_to', ids).limit(500) : { data: [], error: null }
    if (sent.error) throw new Error(sent.error.message)
    const letterIds = rows.map((r) => r.touch_id).filter((x): x is string => Boolean(x))
    const cats = letterIds.length ? await db.from('outreach_touches').select('id, comms_category').in('id', letterIds) : { data: [], error: null }
    if (cats.error) throw new Error(cats.error.message)
    const catOf = new Map(((cats.data ?? []) as { id: string; comms_category: string | null }[]).map((c) => [c.id, c.comms_category]))
    const answerOf = new Map(((sent.data ?? []) as unknown as { in_reply_to: string; sent_at: string; outreach_templates: { key: string } | null }[]).map((a) => [a.in_reply_to, a]))
    let timed = 0
    let inTime = 0
    for (const r of rows) {
      const a = r.source_message_id ? answerOf.get(r.source_message_id) : undefined
      const klass = answerClassOf({ templateKey: a?.outreach_templates?.key ?? null, outcome: r.outcome, answeredCategory: r.touch_id ? (catOf.get(r.touch_id) ?? null) : null, words: r.wording ?? '' })
      if (klass === 'act_now') continue
      timed++
      if (a && (Date.parse(a.sent_at) - Date.parse(r.received_at)) / 60_000 <= ANSWER_TARGET_MINUTES[klass as TimedClass]) inTime++
    }
    return { timed, inTime }
  })

  const yeses = await safely('yeses', async () => {
    const y = await db.from('outreach_replies').select('touch_id').eq('outcome', 'yes').gte('received_at', from).lt('received_at', to).limit(500)
    if (y.error) throw new Error(y.error.message)
    const ids = ((y.data ?? []) as { touch_id: string | null }[]).map((r) => r.touch_id).filter((x): x is string => Boolean(x))
    const subs = ids.length ? await db.from('outreach_touches').select('id, comms_subtype').in('id', ids) : { data: [], error: null }
    if (subs.error) throw new Error(subs.error.message)
    const kinds = { listing: 0, photo: 0, source: 0 }
    for (const s of (subs.data ?? []) as { comms_subtype: string | null }[]) {
      if (s.comms_subtype === 'PERM-SOURCE') kinds.source++
      else if ((s.comms_subtype ?? '').startsWith('PERM')) kinds.photo++
      else kinds.listing++
    }
    return { all: (y.data ?? []).length, kinds }
  })

  const found = await safely('new organisers with a lawful address', () =>
    countOf(db.from('organiser_contacts').select('id', { count: 'exact', head: true }).eq('channel', 'email').not('basis', 'is', null).neq('basis', 'none').gte('created_at', from).lt('created_at', to)),
  )
  const pool = await safely('the pool for the next send day', () => readAcqPool(db, now))
  const listings = await safely('listings added', () =>
    countOf(db.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_test', false).gte('published_at', from).lt('published_at', to)),
  )
  const posts = await safely('posts live', async () => {
    const p = await db.from('social_piece_schedules').select('platform').eq('state', 'published').not('published_ref', 'is', null).gte('published_at', from).lt('published_at', to).limit(200)
    if (p.error) throw new Error(p.error.message)
    const by: Record<string, number> = {}
    for (const r of (p.data ?? []) as { platform: string }[]) by[r.platform] = (by[r.platform] ?? 0) + 1
    return by
  })
  const clicks = await safely('clicks through to sellers', () =>
    countOf(db.from('share_link_events').select('id', { count: 'exact', head: true }).eq('kind', 'outbound').eq('is_test', false).gte('occurred_at', from).lt('occurred_at', to)),
  )
  const tickets = await safely('tickets sold on EventLinqs', async () => {
    const t = await db.from('ledger_entries').select('quantity').eq('kind', 'sale').gte('occurred_at', from).lt('occurred_at', to).limit(5000)
    if (t.error) throw new Error(t.error.message)
    return ((t.data ?? []) as { quantity: number | null }[]).reduce((s, r) => s + (r.quantity ?? 0), 0)
  })

  const postTarget = ACQ_GUIDE_CITIES.length * POSTS_PER_OPEN_CITY
  const wins: Win[] = [
    win(letters, {
      name: 'First letters sent',
      target: ACQ_DAILY_TARGET,
      whenMissed: 'the general first letter play drafts up to its cap for the morning window, and the night\'s discovery turn reads up to sixty organisers while the week is short',
    }),
    answers.ok
      ? { name: 'Replies answered inside their time', target: answers.value.timed, actual: answers.value.inTime, whenMissed: 'every reply is answered in its own time by the replies engine; one waiting past it is named in the leads watch' }
      : { name: 'Replies answered inside their time', target: null, actual: null, unread: answers.why },
    yeses.ok
      ? { name: 'Yeses', target: null, actual: yeses.value.all, detail: `listing ${yeses.value.kinds.listing}, photo ${yeses.value.kinds.photo}, source ${yeses.value.kinds.source}` }
      : { name: 'Yeses', target: null, actual: null, unread: yeses.why },
    pool.ok
      ? {
          name: 'The pool (organisers never written, in a guide city, with a lawful address)',
          target: ACQ_DAILY_TARGET,
          actual: pool.value,
          detail: found.ok ? `${found.value} new with a lawful address yesterday` : `new ones not read: ${found.why}`,
          whenMissed: 'the night\'s discovery turn reads up to sixty organisers while the week is short',
        }
      : { name: 'The pool (organisers never written, in a guide city, with a lawful address)', target: ACQ_DAILY_TARGET, actual: null, unread: pool.why },
    win(listings, { name: 'Listings added', target: null }),
    posts.ok
      ? {
          name: 'Posts live with their network URL',
          target: postTarget,
          actual: Object.values(posts.value).reduce((s, n) => s + n, 0),
          detail: Object.entries(posts.value).map(([k, n]) => `${k} ${n}`).join(', ') || 'none',
          whenMissed: 'the publisher posts the pieces due in their bands; a held piece is named with its reason',
        }
      : { name: 'Posts live with their network URL', target: postTarget, actual: null, unread: posts.why },
    win(clicks, { name: 'Clicks through to sellers', target: null }),
    win(tickets, { name: 'Tickets sold on EventLinqs', target: null }),
  ]
  return scoreboardLine(day, wins)
}
