/**
 * THE VENUE PARTNERSHIP ASKS (window 6, 30 October 2026; the release checklist's D7, "Venue partnerships: ask
 * recurring venues for a feed, a submission route or permission for their programme"; the register's D7 acceptance,
 * "Twelve venue drafts in the play queue on production", as "a play in the outreach engine (no send until Graph
 * consent)").
 *
 * Each venue's ask, its true line and its source are a reviewed data file (scripts/ops/data/venue-asks-30oct.json),
 * from window 3's research of 28 October; this module only writes them in Lawal's format and judges each by every rule
 * of the messages file (renderTemplate, src/lib/outreach/rules.ts). One email template and its DM twin:
 *
 *   email  "Hi [venue] team," / "I hope you're all well." and the true line / the ask, its one question / Lawal's
 *          closing, signature and unsubscribe line
 *   DM     "Hi [venue] team," the true line and the ask, ending with Lawal's DM sign-off; Lawal sends a DM by hand
 *
 * Every draft is HELD, whatever the rules say, because its play is a draft: nothing is sent until Lawal approves the
 * play, and the database refuses to queue a cadence message outside an approved play (20261029210001). A venue with no
 * address read on its own pages gets no draft and says why. Pure.
 */
import { DM_SIGN_OFF, renderTemplate, type TemplateRow } from './rules'

export type VenueAskKind = 'feed' | 'submission' | 'permission'

export type VenueAskContact = {
  channel: 'email' | 'instagram'
  address: string
  /** Already on production with its basis (R4, 29 October); otherwise these say where it was read and why it fits. */
  existing: boolean
  publishedOn?: string
  role?: string
  relevance?: string
}

export type VenueAsk = {
  /** The name the greeting uses: "Hi [venue] team,". */
  venue: string
  /** The CRM organiser's exact name on production, or the name a new one is recorded under. */
  organiser: string
  city: string
  website: string
  ask: VenueAskKind
  contact: VenueAskContact | null
  noDraftBecause?: string
  subject?: string
  trueLine?: string
  askLine?: string
}

/**
 * The photo request every venue email carries (the project manager's 16:42 of 30 October 2026: D7's asks gain "send us
 * 3 photos of your venue, with your yes"). A statement, never a second question; a reply with photos and a yes becomes a
 * pending row in public.venue_images through venue_image_add, shown only once Lawal approves it.
 */
export const VENUE_PHOTO_ASK = "If you're happy for us to show your venue on its nights, reply with three photos of it and a line saying yes."

export const VENUE_ASK_EMAIL: TemplateRow & { key: string } = {
  key: 'venue_ask',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: '[subject]',
  body: `Hi [venue] team,\nI hope you're all well. [true line]\n[ask]\n${VENUE_PHOTO_ASK}\nKind regards,\n[signature]\n\n[unsubscribe]`,
}

export const VENUE_ASK_DM: TemplateRow & { key: string } = {
  key: 'venue_ask_dm',
  channel: 'dm',
  purpose: 'cadence',
  step: 1,
  subject: null,
  body: `Hi [venue] team, [true line] [ask]\n${DM_SIGN_OFF}`,
}

/** Why every draft waits, whatever its rules say. */
export const DRAFT_PLAY_HOLD = 'held for Lawal: the D7 venue partnerships play is a draft, and nothing is sent until he approves it'

export type VenueAskDraft =
  | { venue: string; organiser: string; state: 'drafted'; template: string; channel: 'email' | 'dm'; address: string; subject: string | null; body: string; ruleFailures: string[]; heldBecause: string[] }
  | { venue: string; organiser: string; state: 'no_draft'; reason: string }

/** One venue's draft, or why it has none. `unsubscribeUrl` is the contact's own link (emails only). */
export function draftVenueAsk(ask: VenueAsk, unsubscribeUrl: string | null): VenueAskDraft {
  if (!ask.contact) return { venue: ask.venue, organiser: ask.organiser, state: 'no_draft', reason: ask.noDraftBecause ?? 'no address was read on the venue\'s own pages' }
  const template = ask.contact.channel === 'email' ? VENUE_ASK_EMAIL : VENUE_ASK_DM
  const rendered = renderTemplate(template, { venue: ask.venue, subject: ask.subject ?? null, 'true line': ask.trueLine ?? null, ask: ask.askLine ?? null }, ask.contact.channel === 'email' ? unsubscribeUrl : null)
  return {
    venue: ask.venue,
    organiser: ask.organiser,
    state: 'drafted',
    template: template.key,
    channel: template.channel === 'email' ? 'email' : 'dm',
    address: ask.contact.address,
    subject: rendered.subject,
    body: rendered.body,
    ruleFailures: rendered.heldBecause,
    heldBecause: [...rendered.heldBecause, DRAFT_PLAY_HOLD],
  }
}
