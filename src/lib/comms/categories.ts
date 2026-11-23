/**
 * THE SEVEN COMMUNICATION CATEGORIES (Law 24; Lawal's master communications directive of 18 November 2026, 09:17,
 * C:\dev\START-16OCT\MASTER-COMMS-DIRECTIVE-LOCKED-18NOV.md, section 1: "Use these exact identifiers throughout
 * EventLinqs ... Every communication must have exactly one primary category. Subtypes must identify the specific purpose").
 *
 * This module is the one map from a message's source to its category and subtype. The database holds the same map
 * (migration 20261119125001_comms_categories.sql: comms_category_of_template and the social, report, digest and notice
 * columns; the template map as the latest migration replacing comms_subtype_of_template_key writes it, with the rows
 * later migrations add to it in place), and tests/unit/comms/categories.test.ts reads those migrations and fails if the
 * two ever disagree.
 */
export const COMMS_CATEGORIES = {
  ACQ: 'Organiser Acquisition',
  PERM: 'Event Image and Asset Permissions',
  LIST: 'Event Listing Communications',
  SOC: 'Social Media Marketing',
  RET: 'Organiser Retention',
  TKT: 'Native Ticketing Conversion',
  SYS: 'System and Operational Notifications',
} as const

export type CommsCategory = keyof typeof COMMS_CATEGORIES

export type CommsClass = { category: CommsCategory; subtype: string }

/** A subtype names its category first, then its purpose in capitals and hyphens (ACQ-FIRST, PERM-REMINDER). Pure. */
export function isCommsPair(category: string, subtype: string): boolean {
  return category in COMMS_CATEGORIES && new RegExp(`^${category}(-[A-Z0-9]+)+$`).test(subtype)
}

/**
 * Every CRM template, by its key, read on production at 10:33 on 18 November 2026 (q/law24-purposes.json), with the
 * reason each sits where it does:
 * - the first letters and their follow ups to organisers not yet on EventLinqs are ACQ (lane 1's twenty letters, the
 *   invitations, the direct message, and the letter asking a venue who looks after its nights);
 * - the replies inside an acquisition thread (who are you, not now, what does it cost, yes on a direct message) are ACQ;
 * - segment A, an organiser whose nights are already listed asked for one image, is PERM (directive section 4);
 * - law 49's two letters on each event's clock (21 November 2026): the photo permission request is PERM, the free
 *   promotion offer an acquisition first letter (src/lib/outreach/lifecycle-letters.ts);
 * - the source ask, a letter asking an event listing website for permission to show its event facts (the founder, 12:14
 *   of 23 November 2026: "Apply the already-approved communication workflow to routine source requests."), is PERM,
 *   subtype PERM-SOURCE, so it goes from hello@ (src/lib/outreach/source-asks.ts; migration 20261123130001);
 * - a listing's own news and its replies (featured, why listed, take it down, change it, withdrawn) are LIST;
 * - the after the night report, the next night ask and the thank you are RET;
 * - the reply to an organiser with their own ticketing is TKT;
 * - the confirmation of a stop is SYS (an operational and legal notice, never marketing).
 */
export const TEMPLATE_CLASS: Readonly<Record<string, CommsClass>> = {
  acq_first: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  twenty_advice: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  twenty_offer: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  twenty_own_page: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  first_invitation: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  first_invitation_referred: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  first_dm: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  who_looks_after_events: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  twenty_day4: { category: 'ACQ', subtype: 'ACQ-FOLLOWUP' },
  twenty_day10: { category: 'ACQ', subtype: 'ACQ-FOLLOWUP' },
  day4_follow_up: { category: 'ACQ', subtype: 'ACQ-FOLLOWUP' },
  day10_close: { category: 'ACQ', subtype: 'ACQ-FOLLOWUP' },
  day4_dm: { category: 'ACQ', subtype: 'ACQ-FOLLOWUP' },
  reply_who_are_you: { category: 'ACQ', subtype: 'ACQ-REPLY' },
  reply_not_now: { category: 'ACQ', subtype: 'ACQ-REPLY' },
  reply_cost: { category: 'ACQ', subtype: 'ACQ-REPLY' },
  dm_on_yes: { category: 'ACQ', subtype: 'ACQ-REPLY' },
  segment_a_first: { category: 'PERM', subtype: 'PERM-IMAGE' },
  segment_a_day4: { category: 'PERM', subtype: 'PERM-REMINDER' },
  segment_a_day10: { category: 'PERM', subtype: 'PERM-REMINDER' },
  lifecycle_perm: { category: 'PERM', subtype: 'PERM-IMAGE' },
  source_ask: { category: 'PERM', subtype: 'PERM-SOURCE' },
  lifecycle_acq: { category: 'ACQ', subtype: 'ACQ-FIRST' },
  featured: { category: 'LIST', subtype: 'LIST-FEATURED' },
  reply_why_listed: { category: 'LIST', subtype: 'LIST-REPLY' },
  reply_take_down: { category: 'LIST', subtype: 'LIST-REPLY' },
  reply_change: { category: 'LIST', subtype: 'LIST-REPLY' },
  withdrawal_confirmed: { category: 'LIST', subtype: 'LIST-WITHDRAWN' },
  after_your_night: { category: 'RET', subtype: 'RET-PERFORMANCE' },
  anything_coming_up: { category: 'RET', subtype: 'RET-NEXT-EVENT' },
  thank_you: { category: 'RET', subtype: 'RET-THANK-YOU' },
  reply_existing_ticketing: { category: 'TKT', subtype: 'TKT-REPLY' },
  reply_stop: { category: 'SYS', subtype: 'SYS-UNSUBSCRIBE' },
}

/**
 * A message with no template (written by hand in the CRM, or found in hello@'s Sent Items): it takes the category of
 * the latest classified message to the same contact, so a thread keeps its one category; with none, the CRM's own
 * place, acquisition, by its step (all 22 such messages on production at 10:33 were step 1 first letters of lane 1).
 * Recorded with its source ('thread' or 'default') so a default can be seen and corrected. Pure.
 */
export function classOfUntemplated(input: { purpose: string; step: number | null; thread: CommsClass | null }): CommsClass {
  if (input.thread) {
    const tail = input.purpose === 'reply' ? 'REPLY' : input.step && input.step > 1 ? (input.thread.category === 'PERM' ? 'REMINDER' : 'FOLLOWUP') : null
    return tail ? { category: input.thread.category, subtype: `${input.thread.category}-${tail}` } : input.thread
  }
  if (input.purpose === 'reply') return { category: 'ACQ', subtype: 'ACQ-REPLY' }
  if (input.purpose === 'relationship') return { category: 'RET', subtype: 'RET-RELATIONSHIP' }
  return { category: 'ACQ', subtype: input.step && input.step > 1 ? 'ACQ-FOLLOWUP' : 'ACQ-FIRST' }
}

/** A social piece is SOC, its subtype its kind (daily_poster is SOC-DAILY-POSTER). Pure. */
export function classOfSocialPiece(kind: string): CommsClass {
  return { category: 'SOC', subtype: `SOC-${kind.toUpperCase().replace(/_/g, '-')}` }
}

/** The other message records, each one kind of message (directive section 1). */
export const RECORD_CLASS = {
  organiser_night_reports: { category: 'RET', subtype: 'RET-PERFORMANCE' },
  organiser_sales_digest_sends: { category: 'RET', subtype: 'RET-SALES-DIGEST' },
  platform_notifications: { category: 'SYS', subtype: 'SYS-ADMIN-NOTICE' },
} as const satisfies Record<string, CommsClass>

/** An attendee's alert about an event is LIST; every other notification (the performer marketplace's) is SYS. */
export const NOTIFICATION_LIST_TYPES = ['just_announced', 'on_sale', 'going_fast', 'last_chance', 'tonight', 'waitlist_available'] as const

/** A notification's class by its type (gig_posted is SYS-GIG-POSTED, tonight is LIST-TONIGHT). Pure. */
export function classOfNotification(type: string): CommsClass {
  const category: CommsCategory = (NOTIFICATION_LIST_TYPES as readonly string[]).includes(type) ? 'LIST' : 'SYS'
  return { category, subtype: `${category}-${type.toUpperCase().replace(/_/g, '-')}` }
}

/** The 20 a business day counts these only: a first contact to an organiser not yet on EventLinqs (directive section 3). */
export function countsTowardTheTwenty(c: CommsClass): boolean {
  return c.category === 'ACQ' && c.subtype === 'ACQ-FIRST'
}
