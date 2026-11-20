import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { readTouchVoice } from './daily-queue'
import { inBusinessHours, recipientZone } from './sender'
import standing from './standing-approvals.generated.json'
import { readVoicePolicy, voiceProblems, type VoicePolicy } from './voice-gate'

/**
 * NO DAILY PRESS: AN APPROVED HELD FIRST LETTER QUEUES ITSELF (the PM's item 2 of 00:05:52, 21 November 2026, on law 23,
 * law 38 and Lawal's start of 20 November, 23:55: "Start now ... Then at least ten new Victorian organisers each business
 * day from lawal@, on the approved template"). Lawal approves a template once; the engine sends. His Send and Send All
 * stay his buttons, never a step the engine waits on.
 *
 * A held first letter queues itself into the next business window in its recipient's city ONLY when every one of these
 * holds, read now, and nothing here writes any of them:
 *   1. the sender is live (in test or hold mode nothing is queued, so a letter is never failed by test mode);
 *   2. its words pass every rule of the voice policy in force (voice-gate.ts voiceProblems, the gateway's validate);
 *   3. it clears under Lawal's standing approval of its exact template, by the gateway's own rule, ported here line for
 *      line (C:\dev\comms-gateway\gateway.py standing_clear and template_pattern): the approval is on, carries his words,
 *      was given under the policy in force, and the letter's subject and body are that template with only its fields
 *      filled, each field in its one form, the guide link its own city;
 *   4. the organiser's page check is recorded by a person (organiser_contacts.no_marketing_statement_checked, the
 *      conspicuous publication basis); the engine never ticks it.
 * Its slot is written fresh from today (law 42): now when the window is open, else the next 9:00 on a weekday in the
 * recipient's city. The database's own rules then judge the queue, and the sender judges the send again (one first
 * letter per organiser, suppression and unsubscribe, the daily cap, business hours, the words, its mailbox from lawal@).
 */
type Admin = SupabaseClient<Database>

export type StandingApproval = {
  readonly key: string
  readonly version: number
  readonly on: boolean
  readonly words: string
  readonly quoted_at: string
  readonly policy_version: string
  readonly subject: string
  readonly body: string
}

/** Lawal's standing approvals, copied unchanged from the gateway's own record (standing-approvals.generated.json). */
export function standingApprovals(): readonly StandingApproval[] {
  return ((standing as { templates?: StandingApproval[] }).templates ?? []) as readonly StandingApproval[]
}

const TEMPLATE_FIELD = /\[([^\]\n]{1,40})\]/g

/** Each field the approved template names and the one form its fill may take (gateway.py FIELD_FORMS, unchanged). */
const FIELD_FORMS: Readonly<Record<string, string>> = {
  organiser: '[A-Za-z0-9][^\\n\\[\\]]{0,118}',
  city: '[A-Z][A-Za-z ]{1,39}',
  'city slug': '[a-z0-9]+(?:-[a-z0-9]+)*',
  'what they run, or events': 'events',
  'unsubscribe link': 'https://www\\.eventlinqs\\.com\\.au/unsubscribe/outreach\\?t=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)

/** The approved text as a pattern: every word exact, every field a named group of its one form (gateway.py template_pattern). */
export function templatePattern(text: string): { readonly pattern: RegExp; readonly names: readonly string[] } | null {
  const parts: string[] = []
  const names: string[] = []
  let at = 0
  for (const m of text.matchAll(TEMPLATE_FIELD)) {
    const start = m.index ?? 0
    let name = m[1].trim().toLowerCase()
    if (text.slice(Math.max(0, start - 6), start) === '/city/' && name === 'city') name = 'city slug'
    const form = FIELD_FORMS[name]
    if (form === undefined) return null
    parts.push(escapeRegExp(text.slice(at, start)))
    parts.push(`(?<f${names.length}>${form})`)
    names.push(name)
    at = start + m[0].length
  }
  parts.push(escapeRegExp(text.slice(at)))
  return { pattern: new RegExp(`^(?:${parts.join('')})$`, 's'), names }
}

/** Whether a letter clears under Lawal's standing approval of its exact template (gateway.py standing_clear). */
export function standingClear(
  msg: { readonly template: string; readonly subject: string; readonly body: string },
  policyVersion: string,
  entries: readonly StandingApproval[] = standingApprovals(),
): { readonly cleared: boolean; readonly reason: string } {
  const named = msg.template.trim()
  if (!named) return { cleared: false, reason: 'the letter names no approved template' }
  const entry = entries.find((e) => `${e.key} v${e.version}` === named)
  if (!entry) return { cleared: false, reason: `no standing approval for ${named}` }
  if (!entry.on) return { cleared: false, reason: `the standing approval for ${named} is off: it is switched on only with Lawal's own words quoted` }
  if (!String(entry.words ?? '').trim()) return { cleared: false, reason: `the standing approval for ${named} carries no words of Lawal's` }
  if (entry.policy_version !== policyVersion) return { cleared: false, reason: 'the voice policy changed since the standing approval: Lawal approves again' }
  const values = new Map<string, string>()
  for (const [part, text] of [['subject', entry.subject ?? ''], ['body', entry.body ?? '']] as const) {
    const made = templatePattern(text)
    if (!made) return { cleared: false, reason: `${named} names a field this check cannot judge` }
    const got = made.pattern.exec(part === 'subject' ? msg.subject : msg.body)
    if (!got) return { cleared: false, reason: `the letter's ${part} is not ${named} with only its fields filled` }
    for (const [i, name] of made.names.entries()) {
      const v = got.groups?.[`f${i}`] ?? ''
      const before = values.get(name)
      if (before === undefined) values.set(name, v)
      else if (before !== v) return { cleared: false, reason: `the field '${name}' is filled two ways` }
    }
  }
  const city = values.get('city')
  const slug = values.get('city slug')
  if (city !== undefined && slug !== undefined && slug !== city.toLowerCase().replace(/ /g, '-')) {
    return { cleared: false, reason: "the guide link is not the letter's own city" }
  }
  return { cleared: true, reason: `standing approval of ${named}: '${entry.words.trim().slice(0, 160)}'` }
}

function hourIn(at: Date, zone: string): number {
  return Number(new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(at))
}

function weekdayIn(at: Date, zone: string): boolean {
  return !['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short' }).format(at))
}

/** The next moment a business window is open in the zone, from now (law 42: from today, never a day before). */
export function nextWindowStart(now: Date, zone: string): Date {
  if (inBusinessHours(now, zone)) return now
  let midnight = midnightIn(now, zone)
  for (let i = 0; i < 9; i++) {
    let nine = new Date(midnight.getTime() + 9 * 3_600_000)
    const h = hourIn(nine, zone)
    if (h !== 9) nine = new Date(nine.getTime() + (9 - h) * 3_600_000)
    if (nine.getTime() > now.getTime() && weekdayIn(nine, zone)) return nine
    midnight = midnightIn(new Date(midnight.getTime() + 36 * 3_600_000), zone)
  }
  throw new Error(`no business window found in nine days in ${zone}`)
}

export type SelfQueueReport = {
  readonly note?: string
  readonly queued: { readonly id: string; readonly at: string; readonly why: string }[]
  readonly waiting: { readonly id: string; readonly reasons: readonly string[] }[]
}

type HeldFirst = { id: string; contact_id: string; subject: string | null; body: string; outreach_templates: { key: string; version: number } | null }

export async function queueApprovedHeldLetters(db: Admin, deps: { readonly now: Date; readonly policy?: VoicePolicy; readonly approvals?: readonly StandingApproval[] }): Promise<SelfQueueReport> {
  const report: SelfQueueReport = { queued: [], waiting: [] }
  const sender = await db.from('outreach_sender').select('mode').eq('id', true).single()
  if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)
  if (sender.data.mode !== 'live') return { ...report, note: `the sender is ${sender.data.mode}: no letter queues itself` }
  let policy: VoicePolicy
  try {
    policy = deps.policy ?? readVoicePolicy()
  } catch (error) {
    return { ...report, note: error instanceof Error ? error.message : String(error) }
  }
  const held = await db
    .from('outreach_touches')
    .select('id, contact_id, subject, body, outreach_templates(key, version)')
    .eq('state', 'held')
    .eq('step', 1)
    .eq('comms_category', 'ACQ')
    .limit(200)
  if (held.error) throw new Error(`the held first letters: ${held.error.message}`)
  for (const t of (held.data ?? []) as unknown as HeldFirst[]) {
    const reasons: string[] = []
    const voice = await readTouchVoice(db, t.id)
    if (!voice) {
      report.waiting.push({ id: t.id, reasons: ['it is no longer waiting'] })
      continue
    }
    reasons.push(...voiceProblems(voice, policy))
    const template = t.outreach_templates ? `${t.outreach_templates.key} v${t.outreach_templates.version}` : ''
    const clear = standingClear({ template, subject: t.subject ?? '', body: t.body }, policy.version, deps.approvals ?? standingApprovals())
    if (!clear.cleared) reasons.push(clear.reason)
    const contact = await db.from('organiser_contacts').select('basis, no_marketing_statement_checked').eq('id', t.contact_id).maybeSingle()
    if (contact.error || !contact.data) reasons.push('its contact could not be read')
    else if (!contact.data.basis) reasons.push('no basis for writing is recorded for its contact')
    else if (contact.data.basis === 'conspicuous_publication' && !contact.data.no_marketing_statement_checked) {
      reasons.push("the check that their page says nothing against messages is a person's, and it is not recorded")
    }
    if (reasons.length > 0) {
      report.waiting.push({ id: t.id, reasons })
      continue
    }
    const at = nextWindowStart(deps.now, await recipientZone(db, t.contact_id)).toISOString()
    const moved = await db.from('outreach_touches').update({ state: 'queued', scheduled_for: at }).eq('id', t.id).eq('state', 'held').select('id').maybeSingle()
    if (moved.error || !moved.data) {
      report.waiting.push({ id: t.id, reasons: [moved.error?.message.replace(/^refused: /, '') ?? 'it was no longer held'] })
      continue
    }
    report.queued.push({ id: t.id, at, why: clear.reason })
  }
  return report
}
