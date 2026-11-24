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
 *
 * VERSION 2 (Lawal, 24 November 2026, 20:42 and 20:52; the PM's 20:50, 20:55 and 20:56): Bendigo's reply asked whether we
 * wanted an event list sent to us or were asking to copy events from their calendar, because version 1's second line said
 * "we would like to include the events on [site]", which reads as asking to put events ON their calendar, never said the
 * events would appear on EventLinqs or how we would get them, and its ask leaned on their third party clause as if it might
 * cover us. Version 2 is the wording Lawal approved as final: what we ask and where it appears, that they need send nothing,
 * how we would get the events (our PROPOSED process: their public listings checked about once a week, each event reviewed
 * by a person before it appears), what each listing shows and where its link goes, that no photo or description is copied,
 * the alternative of a list or feed, and the one question. Version 1 is withdrawn: its standing approval is off, so no
 * letter of it queues again; it is kept below as the record of the four letters sent on 24 November. A source's terms are
 * quoted only to say why we ask, never as if they might authorise us (askLineProblems).
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

/** A source ask template row: the template the CRM stores under its key and version. */
export type SourceAskTemplate = TemplateRow & { key: string; version: number }

/**
 * source_ask VERSION 1 (23 November 2026), WITHDRAWN on 24 November 2026 (the PM's 20:50): the record of the four letters
 * sent on 24 November. Never drafted again: its standing approval is off, and the voice gate refuses its body (it says
 * "include the events on" a source and names no collection method; voice-gate.ts sourceAskBodyProblems).
 */
export const SOURCE_ASK_EMAIL_V1: SourceAskTemplate = {
  key: 'source_ask',
  version: 1,
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

/**
 * source_ask VERSION 2, the standing template (Lawal, 24 November 2026: approved at 20:42; at 20:52, "Lock it in ... It is
 * ready for the next day, for tomorrow's message."; the PM's 20:55 gives the wording as final). The subject, greeting,
 * signature and unsubscribe line are version 1's; the body is exactly the approved one, in its order.
 */
export const SOURCE_ASK_EMAIL: SourceAskTemplate = {
  key: 'source_ask',
  version: 2,
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: '[listings] events on EventLinqs',
  body: [
    'Hi [organiser] team,',
    "We'd like your permission to feature upcoming events from [site] on EventLinqs, our Australian event discovery platform, so more people discover events in [city].",
    "Our proposed process is to check [site]'s public event listings about once a week, with a person on our team reviewing each event before it appears. Each EventLinqs listing would show the event's title, date, venue and organiser, with a direct link to its page on [site] for full details and bookings. We would not copy any event photos or descriptions.",
    "You wouldn't need to prepare or send us anything. If you'd rather provide an event list or a feed, we're happy to work that way.",
    '[ask]',
    `Kind regards,\n${LAWAL_SIGNATURE}`,
    unsubscribeLine('[unsubscribe link]'),
  ].join('\n\n'),
}

/** The ask where a source has no term to name (the PM's 20:55): it asks about featuring the events in this way, so the yes covers the process. */
export const SOURCE_ASK_DEFAULT_ASK = 'Would you be happy for EventLinqs to feature your events in this way?'

/**
 * A SOURCE'S TERMS SAY WHY WE ASK, NEVER THAT THEY MIGHT AUTHORISE US (the PM's 20:50 item 2): version 1's Bendigo ask quoted
 * their clause that listings "may be forwarded to other third party networks" and asked whether EventLinqs could be "one of
 * them", as if a clause written for their own partners might cover us. Refused: an ask that asks to be one of a party their
 * terms name, and an ask that ends in no question. Every reason; empty when the ask may go. Pure.
 */
export function askLineProblems(askLine: string): string[] {
  const why: string[] = []
  if (/\b(be|become|count as|join)\s+(one of|part of)\b|\b(be|become|count|counted|included|listed)\s+among\b|\bone of (them|those|your\b[^.?]{0,40}\b(partners|networks|parties|affiliates))\b/i.test(askLine)) {
    why.push("the ask asks to be one of a party the source's terms name; their terms say why we ask, never that they might authorise us")
  }
  if (!/\?$/.test(askLine.trim())) why.push('the ask ends in no question')
  return why
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

/**
 * One source's letter, filled from its reviewed facts, through version 2 unless a template is named; its ask judged by
 * askLineProblems beside the messages file's rules. `unsubscribeUrl` is the contact's own link. Pure.
 */
export function draftSourceAsk(ask: SourceAsk, unsubscribeUrl: string, template: SourceAskTemplate = SOURCE_ASK_EMAIL): SourceAskDraft {
  const rendered = renderTemplate(template, { organiser: ask.organiser, listings: ask.listings, city: ask.city, site: ask.site, ask: ask.askLine }, unsubscribeUrl)
  return {
    id: ask.id,
    organiser: ask.organiser,
    template: template.key,
    channel: 'email',
    address: ask.contact.address,
    greetingName: `${ask.organiser} team`,
    subject: rendered.subject,
    body: rendered.body,
    ruleFailures: [...rendered.heldBecause, ...askLineProblems(ask.askLine)],
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
