/**
 * THE SOURCE ASKS (WINDOW 5C, 23 November 2026). A source ask is a letter asking an event listing website for permission
 * to show its event facts: the title, date, venue and organiser of each event, with a link back to its own page. The
 * founder adopted at 12:14 of 23 November 2026: "Apply the already-approved communication workflow to routine source
 * requests." So each is a CRM first letter like any other, of law 24's PERM category, subtype PERM-SOURCE
 * (src/lib/comms/categories.ts TEMPLATE_CLASS source_ask), from hello@, the permissions mailbox (law 33 (a)); the
 * communication standard knows the kind (C:\dev\comms-gateway\standard.json source_ask, voice-gate.ts): its subject is
 * '<listings> events on EventLinqs', and it names no night, so the timing rule has nothing to judge.
 *
 * Each source's facts are a reviewed data file (scripts/ops/data/source-asks-23nov.json), read from the drafts of the
 * PM's 07:30 (C:\dev\EVIDENCE\EL-23NOV\source-asks\SET.md); this module only writes them through the one template, by the
 * engine's own renderTemplate and rules (src/lib/outreach/rules.ts), so each body is the drafted body word for word:
 *
 *   "Hi [organiser] team," / who we are and the [city] events we list, and the [site] whose events we would include /
 *   what we would show, with a link back to its own page on [site] / the [ask], its one question / "Thanks for your
 *   time." / Lawal's closing and signature, and the contact's own [unsubscribe link].
 *
 * THE ENGINE SENDS THEM (the founder, 14:55 of 23 November 2026: "Just get my engine going, please: my outreach, my photo
 * permissions, everything my system should be doing."). source_ask version 1 is a standing template in the gateway's own
 * record (C:\dev\comms-gateway\standing-approvals.json, copied to standing-approvals.generated.json), so a held letter
 * that is that template with only its fields filled, each in its one form, queues itself (self-queue.ts) inside its
 * approved play and the sender sends it from hello@ in the recipient's window. Every field is judged by its one form
 * (self-queue.ts FIELD_FORMS, gateway.py the same), so the template is written in those fields: [listings], [organiser],
 * [city], [site], [ask] and [unsubscribe link]. The seventh source, What's On Melbourne, is a website form: it is not
 * drafted here, and only the founder sends it, by hand. Pure.
 */
import { HELLO_MAILBOX } from './addresses'
import { LAWAL_SIGNATURE, renderTemplate, unsubscribeLine, type TemplateRow } from './rules'
import { SOURCE_ASK_SUBTYPE, type VoiceMessage } from './voice-gate'

export type SourceAskContact = {
  channel: 'email'
  address: string
  /** The page the address is published on, read on the data file's seenOn day. */
  publishedOn: string
  /** The inbox's function as its page gives it: what the letter must be relevant to. */
  role: string
  /** Why the ask fits that address. */
  relevance: string
  /** The page carried no statement refusing such messages, checked on the day it was read. */
  noMarketingStatementChecked: boolean
  checkNote: string
  /** The drafted message file the facts were read from. */
  evidence: string
}

export type SourceAsk = {
  id: string
  /** The source as the research names it. */
  source: string
  /** The CRM organiser's name; the greeting is "Hi [organiser] team,". */
  organiser: string
  /** Who owns the listings, as their own pages say. */
  owner: string
  website: string
  /** The place whose events we list, as the letter names it. */
  city: string
  /** The website whose events we would include, as the letter names it. */
  site: string
  /** The listings the subject names: '<listings> events on EventLinqs'. */
  listings: string
  /** The ask: what their own pages say about reuse, and its one question. */
  askLine: string
  contact: SourceAskContact
  routeFound: string
}

export type SourceAskData = { source: string; adopted: string; seenOn: string; notLoaded: { id: string; source: string; channel: string; address: string; why: string }[]; asks: SourceAsk[] }

export const SOURCE_ASK_EMAIL: TemplateRow & { key: string } = {
  key: 'source_ask',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: '[listings] events on EventLinqs',
  body: [
    'Hi [organiser] team,',
    'EventLinqs is an Australian event discovery platform. We list upcoming [city] events so more people can find them, and we would like to include the events on [site].',
    'For each event we would show its title, date, venue and organiser, with a link back to its own page on [site].',
    '[ask]',
    'Thanks for your time.',
    `Kind regards,\n${LAWAL_SIGNATURE}`,
    unsubscribeLine('[unsubscribe link]'),
  ].join('\n\n'),
}

/** The play the letters ride in, approved on the founder's words of 12:14 and 14:55 of 23 November 2026. */
export const SOURCE_ASK_PLAY = 'Source asks, 23 November 2026'

export type SourceAskDraft = {
  id: string
  organiser: string
  template: string
  channel: 'email'
  address: string
  greetingName: string
  subject: string | null
  body: string
  /** Every rule of the messages file the draft fails; empty means it may queue. */
  ruleFailures: string[]
}

/** One source's letter, filled from its reviewed facts. `unsubscribeUrl` is the contact's own link. Pure. */
export function draftSourceAsk(ask: SourceAsk, unsubscribeUrl: string): SourceAskDraft {
  const rendered = renderTemplate(SOURCE_ASK_EMAIL, { organiser: ask.organiser, listings: ask.listings, city: ask.city, site: ask.site, ask: ask.askLine }, unsubscribeUrl)
  return {
    id: ask.id,
    organiser: ask.organiser,
    template: SOURCE_ASK_EMAIL.key,
    channel: 'email',
    address: ask.contact.address,
    greetingName: `${ask.organiser} team`,
    subject: rendered.subject,
    body: rendered.body,
    ruleFailures: rendered.heldBecause,
  }
}

/**
 * The draft as the communication gateway reads it (voice-gate.ts voiceProblems): a first letter of subtype PERM-SOURCE
 * from hello@, to its one published address, on its conspicuous publication basis. It names no night. Pure.
 */
export function sourceAskVoiceMessage(ask: SourceAsk, draft: SourceAskDraft): VoiceMessage {
  return {
    channel: 'email',
    category: 'first_contact',
    from: HELLO_MAILBOX,
    to: [draft.address],
    subject: draft.subject,
    greetingName: draft.greetingName,
    body: draft.body,
    subtype: SOURCE_ASK_SUBTYPE,
    consent: { basis: 'conspicuous_publication', publishedOnUrl: ask.contact.publishedOn, noMarketingStatementChecked: ask.contact.noMarketingStatementChecked },
  }
}
