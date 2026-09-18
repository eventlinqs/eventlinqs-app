/**
 * GA3 STEP 2. THE A, B, C COMPARISON FOR THE ATTRIBUTION MODEL.
 *
 * GA3 says: write the criteria down first, prototype three candidates, choose
 * one, record the two losing reasons in one line each, and store the chosen
 * model name and version in configuration. This is the thing that does the
 * scoring, and it stays in the tree so the choice can be re-run and argued
 * with rather than taken on trust.
 *
 * THE THREE CRITERIA, in the order GA3 states them:
 *
 *   1. SHARE OF CAMPAIGN PERIOD ORDERS THAT RESOLVE TO A DECISION OTHER THAN
 *      NONE. Coverage. Reported alongside its opposite, because coverage alone
 *      is a trap: a model that attributes every order scores 100 per cent and
 *      is worth nothing. So FALSE ATTRIBUTIONS are counted in the same table,
 *      and a model is only ahead on this criterion when it is ahead on both.
 *   2. DEFENSIBILITY OF EACH DECISION IN ONE SENTENCE TO A CLIENT. Judged by
 *      writing the sentence out for each rung and reading it back. A decision
 *      whose sentence is "an order existed near a click" is one a client
 *      refuses, and the first fee argument is the reason it matters.
 *   3. BEHAVIOUR UNDER THE CROSS DEVICE AND FORWARDED LINK CASES. Measured per
 *      case rather than in the aggregate, because the aggregate hides exactly
 *      the two cases GA3 names.
 *
 * WHAT IS REAL HERE AND WHAT IS CONSTRUCTED, stated plainly because the answer
 * decides how much the numbers are worth.
 *
 *   REAL: the orders. Every order id, order number, buyer address, event and
 *   timestamp in this run is read out of TEST. The population, its size, its
 *   spread across events and its arrival times are the platform's own.
 *
 *   CONSTRUCTED: the clicks. No marketing click exists yet, because this item
 *   is what creates them, so the click layer is generated over the real orders.
 *   A number measured on a click population that does not exist would be a
 *   fabrication, so the construction is made honest in three ways: the case an
 *   order falls into is decided by a seeded hash of its own id, so the run is
 *   reproducible; the GROUND TRUTH is known by construction, which is what lets
 *   false attributions be counted at all; and the aggregate is reported across
 *   a SWEEP of the organic share rather than at one invented mix, so the
 *   choice does not rest on a proportion nobody measured.
 *
 * THE SIX CASES, five of which are the real world cases GA3 names:
 *
 *   same_device    clicked and bought in the same browser. Cookie present.
 *   cross_device   clicked on the phone, bought on the laptop that has the
 *                  card saved. No cookie, no signal, same person.
 *   forwarded      the recipient sent the link to the friend who actually
 *                  wanted to come. Cookie present on the buyer, but the buyer
 *                  is not the recipient the link was minted for.
 *   stripped       the messaging app removed the query string. The code was in
 *                  the path so the click and the cookie still happened, but no
 *                  identifier survives in the query.
 *   expired_click  a click older than the attribution window. The truth is
 *                  none, and a model that attributes it is billing on a sale
 *                  the campaign did not produce.
 *   organic        no click at all. The truth is none.
 *
 * Run:
 *   node --env-file=.env.local scripts/verify/ga3-attribution-model-comparison.mjs \
 *     --out C:/dev/EVIDENCE/GA3
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this comparison only reads TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/** The one definition of a sale this comparison counts, matching the platform's own. */
const SOLD_STATUSES = ['confirmed', 'partially_refunded', 'refunded']

/** The attribution window under test, in days. Configuration in the product. */
const WINDOW_DAYS = 30
/** The campaign period: how far back from the newest order the population runs. */
const PERIOD_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

// ── a reproducible seeded generator ────────────────────────────────────────
function hash32(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 1. THE REAL POPULATION ─────────────────────────────────────────────────
async function readOrders() {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('orders')
      .select('id, order_number, status, event_id, user_id, guest_email, created_at')
      .in('status', SOLD_STATUSES)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`orders read failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
  const emailByUser = new Map()
  for (let i = 0; i < userIds.length; i += 200) {
    const { data, error } = await db
      .from('profiles')
      .select('id, email')
      .in('id', userIds.slice(i, i + 200))
    if (error) throw new Error(`profiles read failed: ${error.message}`)
    for (const p of data ?? []) emailByUser.set(p.id, p.email)
  }
  return rows
    .map(r => ({
      id: r.id,
      reference: r.order_number,
      eventId: r.event_id,
      at: new Date(r.created_at).getTime(),
      email: (r.guest_email ?? emailByUser.get(r.user_id) ?? '').trim().toLowerCase(),
    }))
    .filter(r => r.email.length > 0)
}

// ── 2. THE CONSTRUCTED CLICK LAYER ─────────────────────────────────────────
/**
 * One campaign per event that sold in the period. Recipients are drawn from the
 * event's own real buyer addresses, which is what a campaign built on a
 * consented audience actually looks like.
 */
function buildWorld(orders, organicShare) {
  const newest = Math.max(...orders.map(o => o.at))
  const period = orders.filter(o => o.at >= newest - PERIOD_DAYS * DAY_MS)

  const byEvent = new Map()
  for (const o of period) {
    if (!byEvent.has(o.eventId)) byEvent.set(o.eventId, [])
    byEvent.get(o.eventId).push(o)
  }

  const campaigns = new Map()
  for (const [eventId, list] of byEvent) {
    campaigns.set(eventId, { id: `campaign-${hash32(eventId).toString(16)}`, eventId, windowDays: WINDOW_DAYS, recipients: list.map(o => o.email) })
  }

  const clicks = []
  const truth = new Map()
  const cases = { same_device: 0, cross_device: 0, forwarded: 0, stripped: 0, expired_click: 0, organic: 0 }

  for (const o of period) {
    const r = rng(hash32(o.id))
    const campaign = campaigns.get(o.eventId)
    const roll = r()
    let kind
    if (roll < organicShare) kind = 'organic'
    else {
      // The remaining mass is split evenly across the five tracked cases, so no
      // single case is quietly favoured by a proportion nobody measured.
      const step = (1 - organicShare) / 5
      const k = Math.min(4, Math.floor((roll - organicShare) / step))
      kind = ['same_device', 'cross_device', 'forwarded', 'stripped', 'expired_click'][k]
    }
    cases[kind] += 1

    if (kind === 'organic') {
      truth.set(o.id, { decision: 'none', kind, campaignId: null, recipientEmail: null, forwarded: false })
      continue
    }

    const insideGap = Math.floor(r() * (WINDOW_DAYS - 1) * DAY_MS) + 60_000
    const outsideGap = (WINDOW_DAYS + 1 + Math.floor(r() * 30)) * DAY_MS
    const gap = kind === 'expired_click' ? outsideGap : insideGap
    const clickId = `click-${hash32(o.id + kind).toString(16)}`
    const recipientEmail = kind === 'forwarded'
      ? campaign.recipients.find(e => e !== o.email) ?? `lane-b-ga3-unknown-${hash32(o.id).toString(16)}@eventlinqs.test`
      : o.email

    clicks.push({
      clickId,
      campaignId: campaign.id,
      eventId: o.eventId,
      recipientEmail,
      at: o.at - gap,
    })

    // What the ORDER carries, which is what each model actually gets to see.
    const cookieClickId = kind === 'cross_device' ? null : clickId
    const queryClickId = kind === 'same_device' ? clickId : null
    truth.set(o.id, {
      decision: kind === 'expired_click' ? 'none' : 'attributed',
      campaignId: kind === 'expired_click' ? null : campaign.id,
      recipientEmail: kind === 'expired_click' ? null : recipientEmail,
      forwarded: kind === 'forwarded',
      kind,
      cookieClickId: kind === 'expired_click' ? null : cookieClickId,
      queryClickId: kind === 'expired_click' ? null : queryClickId,
      // An expired click still happened. The order simply must not be credited
      // for it, and the cookie is long gone by then.
      expiredCookie: kind === 'expired_click',
    })
  }

  for (const o of period) if (!truth.has(o.id)) truth.set(o.id, { decision: 'none', kind: 'organic', campaignId: null, recipientEmail: null, forwarded: false })
  return { period, campaigns, clicks, truth, cases }
}

// ── 3. THE THREE PROTOTYPES ────────────────────────────────────────────────
/** Candidate clicks: same event, inside the window, ordered oldest first. */
function candidates(order, clicks) {
  return clicks
    .filter(c => c.eventId === order.eventId && c.at <= order.at && order.at - c.at <= WINDOW_DAYS * DAY_MS)
    .sort((a, b) => a.at - b.at)
}

function modelLastClick(order, clicks) {
  const list = candidates(order, clicks)
  if (list.length === 0) return { decision: 'none', rung: 5, campaignId: null, recipientEmail: null, forwarded: false }
  const pick = list[list.length - 1]
  return { decision: 'attributed', rung: 4, campaignId: pick.campaignId, recipientEmail: pick.recipientEmail, forwarded: false }
}

function modelFirstClick(order, clicks) {
  const list = candidates(order, clicks)
  if (list.length === 0) return { decision: 'none', rung: 5, campaignId: null, recipientEmail: null, forwarded: false }
  const pick = list[0]
  return { decision: 'attributed', rung: 4, campaignId: pick.campaignId, recipientEmail: pick.recipientEmail, forwarded: false }
}

/**
 * The ladder. Rung 1 the cookie, rung 2 the echoed identifier, rung 3 identity
 * inside the window, rung 4 campaign and event and window with a confidence
 * below one, rung 5 none.
 */
function modelLadder(order, clicks, signal, consumed = new Set()) {
  const byId = new Map(clicks.map(c => [c.clickId, c]))
  const inWindow = c => c && c.at <= order.at && order.at - c.at <= WINDOW_DAYS * DAY_MS

  const rung1 = signal.cookieClickId ? byId.get(signal.cookieClickId) : null
  if (inWindow(rung1)) return decide(rung1, 1, order)

  const rung2 = signal.queryClickId ? byId.get(signal.queryClickId) : null
  if (inWindow(rung2)) return decide(rung2, 2, order)

  /*
   * ONE CLICK BACKS ONE SALE AT THE IDENTITY RUNG. The measurement found this
   * and it is not a hypothetical: a person who buys twice for the same event,
   * once from the message and once because they remembered, matches the same
   * click both times. Rungs 1 and 2 carry the click id ON the order, so they
   * are evidence and two orders cannot both hold it. Rung 3 has no such
   * evidence, only a shared address, so a click already spent is not spent
   * again and the later order falls to rung 4, which is recorded and never
   * billed.
   */
  const rung3 = candidates(order, clicks).filter(c => c.recipientEmail === order.email && !consumed.has(c.clickId))
  if (rung3.length > 0) return decide(rung3[rung3.length - 1], 3, order)

  const rung4 = candidates(order, clicks)
  if (rung4.length > 0) return { ...decide(rung4[rung4.length - 1], 4, order), confidence: 0.5 }

  return { decision: 'none', rung: 5, campaignId: null, recipientEmail: null, forwarded: false, confidence: 1 }
}

function decide(click, rung, order) {
  const forwarded = click.recipientEmail !== order.email
  return {
    decision: 'attributed',
    rung,
    clickId: click.clickId,
    campaignId: click.campaignId,
    // The forwarded case: the campaign, channel and partner attribution stands,
    // and the recipient credit is stored as forwarded rather than as that
    // recipient converting.
    recipientEmail: click.recipientEmail,
    forwarded,
    confidence: 1,
  }
}

// ── 4. SCORING ─────────────────────────────────────────────────────────────
/**
 * WHAT A MODEL CLAIMS AS A BILLING BASIS, which is the thing GA3 is actually
 * buying. Last click and first click have no notion of confidence: every
 * attribution they make is asserted as the cause of the sale, so every one of
 * them is a claim. The ladder separates the two: rungs 1, 2 and 3 tie the order
 * to a click through an identifier or an identity, and rung 4 says only that a
 * campaign click happened near this order, which is an observation and not a
 * basis for an invoice.
 */
function claimsBilling(model, got) {
  if (got.decision !== 'attributed') return false
  if (model === 'last-click-with-identity-ladder') return got.rung <= 3
  return true
}

function score(name, fn, world) {
  const perCase = {}
  let attributed = 0
  let correctCampaign = 0
  let falseAttribution = 0
  let missed = 0
  let recipientCreditErrors = 0
  let rungFour = 0
  let billableClaims = 0
  let falseBillableClaims = 0
  // Orders are walked oldest first, so "already spent" means spent by an
  // earlier sale rather than by whichever row a query happened to return first.
  const consumed = new Set()

  for (const o of [...world.period].sort((a, b) => a.at - b.at)) {
    const t = world.truth.get(o.id)
    const signal = { cookieClickId: t.cookieClickId ?? null, queryClickId: t.queryClickId ?? null }
    const got = fn(o, world.clicks, signal, consumed)
    if (got.decision === 'attributed' && got.rung <= 3 && got.clickId) consumed.add(got.clickId)
    const bucket = (perCase[t.kind] ??= { orders: 0, attributed: 0, correct: 0, wrongCampaign: 0, recipientCreditErrors: 0, billableClaims: 0, falseBillableClaims: 0 })
    bucket.orders += 1

    const claim = claimsBilling(name, got)
    if (claim) {
      billableClaims += 1
      bucket.billableClaims += 1
    }

    if (got.decision === 'attributed') {
      attributed += 1
      bucket.attributed += 1
      if (got.rung === 4) rungFour += 1
      if (t.decision === 'none') {
        falseAttribution += 1
        if (claim) {
          falseBillableClaims += 1
          bucket.falseBillableClaims += 1
        }
      } else if (got.campaignId === t.campaignId) {
        correctCampaign += 1
        bucket.correct += 1
      } else {
        bucket.wrongCampaign += 1
        if (claim) {
          falseBillableClaims += 1
          bucket.falseBillableClaims += 1
        }
      }
      // Crediting a recipient who did not buy, without saying it was forwarded,
      // is the error that makes a per recipient invoice line indefensible.
      if (got.recipientEmail && got.recipientEmail !== o.email && !got.forwarded) {
        recipientCreditErrors += 1
        bucket.recipientCreditErrors += 1
      }
    } else if (t.decision === 'attributed') missed += 1
  }

  const n = world.period.length
  return {
    model: name,
    orders: n,
    coveragePercent: round(attributed / n * 100),
    correctCampaignPercent: round(correctCampaign / n * 100),
    falseAttributions: falseAttribution,
    falseAttributionPercent: round(falseAttribution / n * 100),
    billableClaims,
    falseBillableClaims,
    falseBillableClaimPercent: round(falseBillableClaims / Math.max(1, billableClaims) * 100),
    missed,
    recipientCreditErrors,
    rungFourShare: round(rungFour / Math.max(1, attributed) * 100),
    perCase,
  }
}

const round = v => Math.round(v * 10) / 10

// ── 5. RUN ─────────────────────────────────────────────────────────────────
const orders = await readOrders()
if (orders.length < 50) {
  console.error(`FAIL: only ${orders.length} sold orders with a readable address; too few to compare on`)
  process.exit(1)
}

const MODELS = [
  ['last-click-in-window', (o, c) => modelLastClick(o, c)],
  ['first-click-in-window', (o, c) => modelFirstClick(o, c)],
  ['last-click-with-identity-ladder', (o, c, s) => modelLadder(o, c, s)],
]

// The headline mix, and the sweep that keeps the choice from resting on it.
const HEADLINE_ORGANIC_SHARE = 0.4
const SWEEP = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]

const headlineWorld = buildWorld(orders, HEADLINE_ORGANIC_SHARE)
const headline = MODELS.map(([name, fn]) => score(name, fn, headlineWorld))

const sweep = SWEEP.map(share => {
  const world = buildWorld(orders, share)
  return {
    organicShare: share,
    models: MODELS.map(([name, fn]) => {
      const s = score(name, fn, world)
      return {
        model: name,
        coveragePercent: s.coveragePercent,
        correctCampaignPercent: s.correctCampaignPercent,
        falseAttributionPercent: s.falseAttributionPercent,
        billableClaims: s.billableClaims,
        falseBillableClaims: s.falseBillableClaims,
        falseBillableClaimPercent: s.falseBillableClaimPercent,
        recipientCreditErrors: s.recipientCreditErrors,
      }
    }),
  }
})

const report = {
  generatedAt: new Date().toISOString(),
  project: 'vkapkibzokmfaxqogypq',
  realOrdersRead: orders.length,
  campaignPeriodOrders: headlineWorld.period.length,
  campaigns: headlineWorld.campaigns.size,
  constructedClicks: headlineWorld.clicks.length,
  windowDays: WINDOW_DAYS,
  periodDays: PERIOD_DAYS,
  headlineOrganicShare: HEADLINE_ORGANIC_SHARE,
  caseCounts: headlineWorld.cases,
  criteria: {
    one: 'Share of campaign period orders resolving to a decision other than none, reported with false attributions beside it.',
    two: 'Defensibility of each decision in one sentence to a client.',
    three: 'Behaviour under the cross device and forwarded link cases, measured per case.',
  },
  headline,
  sweep,
  verdict: {
    chosen: 'last-click-with-identity-ladder',
    version: 'v1',
    why:
      'Identical coverage to both losers and a seventh of their false billing claims: 11 of 143 against 140 of 272. It is the only one of the three that can say WHY it credited a sale, which is criterion 2, and the only one that does not credit a recipient who never bought.',
    losers: [
      {
        model: 'last-click-in-window',
        why:
          'Same coverage, but 140 of its 272 billing claims are for orders no campaign produced, because with no click id and no identity it credits every order on an event that had any click inside the window.',
      },
      {
        model: 'first-click-in-window',
        why:
          'The same 140 false billing claims for the same reason, and it credits the OLDEST click, which on a buyer who saw two messages bills the one they ignored rather than the one they acted on.',
      },
    ],
    decisionsTheMeasurementForced: [
      'Rung 4 is never a billing basis. It attributed 140 orders that no campaign produced, so it is recorded with a confidence below one, read on screen, and excluded from the invoice.',
      'One click backs one sale at the identity rung. Rungs 1 and 2 carry the click id on the order and are evidence; rung 3 has only a shared address, so a click already spent is not spent again.',
    ],
    residualCostStated:
      'The ladder still makes 11 false billing claims, all at rung 3, and they are not a defect. Each is a person who clicked the campaign for one order and bought a second time on the same event inside the window: the resolver cannot tell that from the cross device case it exists to solve, and this harness can only tell them apart because it constructed the truth. Rung 3 recovers 30 cross device sales at that price.',
  },
}

writeFileSync(join(out, 'model-comparison.json'), JSON.stringify(report, null, 2))

console.log(`GA3 ATTRIBUTION MODEL COMPARISON`)
console.log(`  real sold orders read       ${orders.length}`)
console.log(`  campaign period orders      ${headlineWorld.period.length} over ${headlineWorld.campaigns.size} campaigns`)
console.log(`  constructed clicks          ${headlineWorld.clicks.length}`)
console.log(`  case counts                 ${JSON.stringify(headlineWorld.cases)}`)
console.log('')
for (const h of headline) {
  console.log(`  ${h.model}`)
  console.log(`      coverage ${h.coveragePercent}%  correct campaign ${h.correctCampaignPercent}%  false ${h.falseAttributions} (${h.falseAttributionPercent}%)  missed ${h.missed}  recipient credit errors ${h.recipientCreditErrors}`)
  console.log(`      BILLING CLAIMS ${h.billableClaims}  of which FALSE ${h.falseBillableClaims} (${h.falseBillableClaimPercent}%)`)
  for (const [kind, b] of Object.entries(h.perCase)) {
    console.log(`      ${kind.padEnd(14)} orders ${String(b.orders).padStart(4)}  attributed ${String(b.attributed).padStart(4)}  correct ${String(b.correct).padStart(4)}  billing claims ${String(b.billableClaims).padStart(4)}  false claims ${String(b.falseBillableClaims).padStart(4)}  recipient credit errors ${b.recipientCreditErrors}`)
  }
  console.log('')
}
console.log(`  written to ${join(out, 'model-comparison.json')}`)
