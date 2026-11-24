import { createHash } from 'node:crypto'
import generated from './voice-policy.generated.json'

/**
 * THE COMMUNICATION GATEWAY, IN THE PRODUCTION SEND PATH (the CONTROLLER's 08:40 of 31 October 2026, on Lawal's
 * zero-bypass directive of 08:25; window 2).
 *
 * C:\dev\comms-gateway\gateway.py validates every founder-voice message on the laptop. This is the same check, ported
 * line for line, for the messages the app holds and sends: a touch leaves held only when its words pass here AND Lawal
 * approved that exact content under the current policy version (approvalProblems). The policy facts are read from the
 * founder's two policy files by scripts/ops/voice-policy-generate.mjs into voice-policy.generated.json with their
 * version; the app cannot read C:\dev, so a change to either file means generating again, and every approval made under
 * the older version is asked again.
 *
 * The one addition to the gateway is the CHANNEL. The gateway is shaped for email; an Instagram or Facebook message has
 * no recipient address and no subject, so those two checks have nothing to judge there and are not asked. Every check
 * on the words themselves runs for every channel. Pure, apart from reading the generated policy.
 */

export type VoiceChannel = 'email' | 'instagram' | 'facebook' | 'website_form'
export type VoiceCategory = 'first_contact' | 'reply' | 'follow_up' | 'service'

export interface VoicePolicy {
  readonly version: string
  readonly firstSignature: readonly string[]
  readonly replySignature: readonly string[]
  readonly noExit: readonly string[]
  readonly permissions: readonly { recipient: string; topic: string; given: string; neverAsk: readonly string[] }[]
  /** Law 6, the dash rule: compound modifiers before a noun, and compound words, take the plain hyphen. */
  readonly compounds: { readonly mustHyphenateBeforeNoun: readonly string[]; readonly nounsAfter: string; readonly compoundWords: readonly string[] }
  /** A contact already written to on a thread is written to from that thread's own mailbox only. */
  readonly threads: readonly { recipient: string; mailbox: string; why: string }[]
  /** The mailbox the voice file was read from: Lawal's own, which an email by hand goes from. */
  readonly founderMailbox: string
  /** The communication standard's machine checks (EL-COMMS-STANDARD-LOCKED-17NOV.md Part 2 rule 7), from standard.json. */
  readonly standard: VoiceStandard
}

export interface VoiceStandard {
  readonly outreachCategories: readonly VoiceCategory[]
  readonly offerSubjects: readonly string[]
  readonly internalWords: readonly string[]
  readonly unprovedClaims: readonly string[]
  /**
   * THE FOUNDER SENTENCE IS OUT OF EVERY MESSAGE (Lawal, 18 November 2026, 11:31; standard.json founder_sentence, read
   * by gateway.py): founder focused, and an unproved claim. Each is refused wherever it stands in a body.
   */
  readonly founderSentence?: readonly string[]
  readonly consentBases: readonly string[]
  readonly minDaysAhead: number
  /**
   * THE STOCK PLEASANTRY IS OUT OF EVERY MESSAGE (Lawal's communication standard, 20:45 of 22 November 2026, adopting
   * C:\dev\START-16OCT\COMMS-STANDARD-REVIEW-22NOV.md: "change everything, even the greetings"; the PM's 20:47, item 1):
   * "Hi <name>," then straight into the purpose. standard.json stock_pleasantries, as gateway.py reads it; required.
   */
  readonly stockPleasantries: readonly string[]
  /**
   * THE FOUNDER SENTENCE IN ALL ITS FORMS (Lawal, 11:31 of 18 November 2026: the founder sentence, "I'm Lawal Adams, and
   * I'm building EventLinqs ...", is removed from every template, "founder focused and an unproved claim"; the PM's 23:16
   * of 23 November 2026, item 2): every first-person introduction of the founder, as patterns. standard.json
   * founder_introduction, as gateway.py reads it; required. founderSentence above keeps its two literal wordings.
   */
  readonly founderIntroduction: readonly string[]
  /** The ACQ-FIRST letter's own offer subjects (standard.json of 18 November 11:25, the PM's ruling of 11:25). */
  readonly acqFirstSubjects?: readonly string[]
  /** The subject of the ACQ-FIRST letter that names no night: the timing rule applies only where a night is named. */
  readonly acqFirstNoEventSubject?: string
  /** Every subject of an acquisition type that names no night (standard.json acq_types, needs_event_date false). */
  readonly acqFirstNoEventSubjects?: readonly string[]
  /**
   * THE SOURCE ASK (the founder, 12:14 of 23 November 2026: "Apply the already-approved communication workflow to routine
   * source requests."; standard.json source_ask): a letter asking an event listing website for permission to show its
   * event facts, subtype PERM-SOURCE. Its first letter takes these subjects and no offer subject; it names no night, so
   * with needsEventDate false the timing rule has nothing to judge. Absent, a PERM-SOURCE letter is judged as any other.
   */
  readonly sourceAsk?: { readonly subjects: readonly string[]; readonly needsEventDate: boolean }
}

/** The source ask's subtype (law 24 PERM; standard.json source_ask), as gateway.py's is_source_ask reads it. */
export const SOURCE_ASK_SUBTYPE = 'PERM-SOURCE'

/**
 * LAWAL'S OWN APPROVED SENTENCES ARE NOT JUDGED AGAINST THE WORD LISTS (source_ask version 2: Lawal approved its wording at
 * 20:42 of 24 November 2026 and the PM's 20:55 gives it as final). Two of its sentences carry words the standard's lists
 * catch elsewhere: "a feed" (internal_words: our machinery never reaches a customer; here it is the source's own format,
 * offered as their alternative) and "feature your events" (unproved_claims: a promise to feature; here it is the question
 * asking their permission). Each sentence, word for word, is taken out before the internal word and unproved claim lists
 * are read; every other word of the letter is judged as before, so "your feed" or "we'll feature your events" anywhere
 * else is still refused. gateway.py APPROVED_SENTENCES, the same.
 */
export const APPROVED_SENTENCES: readonly string[] = [
  "If you'd rather provide an event list or a feed, we're happy to work that way.",
  'Would you be happy for EventLinqs to feature your events in this way?',
]

/** The text with each approved sentence, word for word (any spacing), taken out, for the word lists alone. Pure. */
export function withoutApprovedSentences(text: string): string {
  let out = text.replace(/\s+/g, ' ')
  for (const s of APPROVED_SENTENCES) out = out.split(s).join(' ')
  return out
}

/**
 * WHAT A SOURCE ASK MUST SAY (the PM's 20:50 item 3 of 24 November 2026; Bendigo's reply asked whether we wanted an event
 * list sent to us or were asking to copy events from their calendar). A source ask's body (its own words, the quoted thread
 * left out) is refused when it says "include the events on" a source, which reads as putting events ON their site; when it
 * never names EventLinqs as where the events appear ("... events ... on EventLinqs" in one sentence); or when it names no
 * collection method (their public listings checked or read, or the feed or list they provide). gateway.py
 * source_ask_body_problems, the same. Every reason; empty when the body says all three. Pure.
 */
export function sourceAskBodyProblems(ownWords: string): string[] {
  const why: string[] = []
  const text = ownWords.replace(/\s+/g, ' ')
  // One sentence: any character but a full stop, question or exclamation mark that ends it (a site's own dots, as in
  // visitballarat.com.au, stay inside the sentence).
  const inSentence = (n: number) => `(?:[^.?!]|[.?!](?=\\S)){0,${n}}`
  if (/\binclude (the |their |your )?events on\b/i.test(text)) {
    why.push('a source ask never says "include the events on" a source: it reads as asking to put events on their site; say they would appear on EventLinqs')
  }
  if (!new RegExp(`\\bevents?\\b${inSentence(160)}\\bon EventLinqs\\b`, 'i').test(text)) why.push('a source ask names EventLinqs as where the events would appear ("... events ... on EventLinqs")')
  const method =
    new RegExp(`\\b(check|checking|read|reading|review|reviewing)\\b${inSentence(100)}\\bpublic\\b${inSentence(40)}\\blistings?\\b`, 'i').test(text) ||
    new RegExp(`\\b(your|their) (event )?(feed|event list)\\b${inSentence(60)}\\b(send|provide|share)`, 'i').test(text)
  if (!method) why.push('a source ask names how we would get the events (their public listings checked, or the list or feed they provide)')
  return why
}

/** The lawful basis to write to this address (the standard's Part 2 rule 5, the Spam Act's conspicuous publication test). */
export interface VoiceConsent {
  readonly basis: string
  readonly publishedOnUrl: string | null
  readonly noMarketingStatementChecked: boolean
}

export interface VoiceMessage {
  readonly channel: VoiceChannel
  readonly category: VoiceCategory
  /** The mailbox or account it goes from; named before drafting (the gateway's rule). */
  readonly from: string | null
  /** Email addresses; empty for a direct message. */
  readonly to: readonly string[]
  readonly subject: string | null
  /** The verified recipient the greeting must name: a person on their page, else '<organisation> team'. */
  readonly greetingName: string | null
  readonly body: string
  readonly threadRef?: string | null
  /** An outreach letter's lawful basis; a first letter and a follow up carry it (the standard's Part 2 rule 5). */
  readonly consent?: VoiceConsent
  /** The local day of the night the letter is about, and the local day it would land (YYYY-MM-DD), for the timing rule. */
  readonly eventDate?: string
  readonly landsOn?: string
  /**
   * The message's communication subtype (Law 24), as its record carries it: ACQ-FIRST has its own subjects and no event
   * form; PERM-SOURCE, the source ask, has its own subjects and names no night.
   */
  readonly subtype?: string | null
}

/** The generated policy, refused whole if any fact is missing: POLICY_UNAVAILABLE means stop, never assume. */
export function readVoicePolicy(raw: unknown = generated): VoicePolicy {
  const p = raw as Partial<VoicePolicy>
  const strings = (a: unknown) => Array.isArray(a) && a.length > 0 && a.every((s) => typeof s === 'string' && s.length > 0)
  const c = p?.compounds
  const compoundsWhole = Boolean(c) && strings(c?.mustHyphenateBeforeNoun) && typeof c?.nounsAfter === 'string' && c.nounsAfter.length > 0 && strings(c?.compoundWords)
  if (typeof p?.version !== 'string' || !/^[0-9a-f]{16}$/.test(p.version) || !strings(p.firstSignature) || !strings(p.replySignature) || !strings(p.noExit) || !Array.isArray(p.permissions) || !compoundsWhole || !Array.isArray(p.threads) || typeof p.founderMailbox !== 'string' || !EMAIL.test(p.founderMailbox)) {
    throw new Error('POLICY_UNAVAILABLE: the voice policy is missing or incomplete; generate it from the policy files (scripts/ops/voice-policy-generate.mjs)')
  }
  const s = p.standard
  const standardWhole =
    Boolean(s) && strings(s?.outreachCategories) && strings(s?.offerSubjects) && strings(s?.internalWords) && strings(s?.unprovedClaims) && strings(s?.consentBases) && Number.isInteger(s?.minDaysAhead) && strings(s?.stockPleasantries) && strings(s?.founderIntroduction)
  if (!standardWhole) throw new Error('POLICY_UNAVAILABLE: the communication standard is missing from the voice policy; generate it from the policy files (scripts/ops/voice-policy-generate.mjs)')
  const sa = s?.sourceAsk
  if (sa !== undefined && !(Boolean(sa) && strings(sa?.subjects) && typeof sa?.needsEventDate === 'boolean')) {
    throw new Error('POLICY_UNAVAILABLE: the source ask in the voice policy is not whole; generate it from the policy files (scripts/ops/voice-policy-generate.mjs)')
  }
  return p as VoicePolicy
}

/**
 * THE COMMUNICATION STANDARD (Lawal, 20:45 of 22 November 2026: he adopted C:\dev\START-16OCT\COMMS-STANDARD-REVIEW-22NOV.md,
 * "follow this A to Z", "change everything, even the greetings"; the PM's 20:47, item 1). No stock pleasantry is asked
 * of any message: "Hi <name>," then straight into the purpose. The warm second line, its paragraph rule and the count of
 * calls to action were style rules and are gone, here as in gateway.py; every check of law or fact stays.
 */
const CATEGORIES: readonly VoiceCategory[] = ['first_contact', 'follow_up', 'reply', 'service']
const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/
const URL_G = /https?:\/\/[^\s<>"]+/g
const OPT_OUT = "If you'd rather I didn't write again"

/** gateway.py to_text: simple HTML to lines. */
function toText(body: string): string {
  let t = body
  if (t.includes('<') && t.includes('>')) {
    t = t
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, text: string) => (text.trim() === href ? text : `${text} ${href}`))
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
  }
  return t.replace(/\r/g, '')
}

/** gateway.py own_part: the message's own words, before any quoted earlier message. */
function ownPart(text: string): string {
  return text.split(/\n\s*(?:From:\s|-----Original Message-----|On .{5,80} wrote:)/)[0] ?? ''
}

const linesOf = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

/**
 * NO STOCK PLEASANTRY (standard.json stock_pleasantries; gateway.py the same, in every message, word for word): each one
 * in the message's own words after its greeting and before its closing, refused quoting the rule. Until 23 November 2026
 * neither the gate nor the send time word check knew it, so law 49's play could still draft lifecycle_acq version 1,
 * "I hope you're well.", and nothing would have stopped it. Pure.
 */
export function pleasantryProblems(bodyBefore: string, std: VoiceStandard): string[] {
  const r: string[] = []
  for (const pat of std.stockPleasantries ?? []) {
    const m = bodyBefore.match(new RegExp(pat, 'i'))
    if (m) r.push(`stock pleasantry "${m[0]}": straight to the purpose, no stock pleasantry (the communication standard, Lawal 20:45 of 22 November 2026)`)
  }
  return r
}

/**
 * THE FOUNDER SENTENCE IN ALL ITS FORMS (standard.json founder_introduction; gateway.py the same, in every message, word
 * for word): a first-person introduction of the founder in the message's own words after its greeting and before its
 * closing, so the signature block ("Lawal Adams / Founder, EventLinqs") and a DM's sign-off pass. Until 23 November 2026
 * only two wordings were refused, and law 49's free promotion letter opened "I'm Lawal, founder of EventLinqs". Pure.
 */
export function founderIntroductionProblems(bodyBefore: string, std: VoiceStandard): string[] {
  const r: string[] = []
  for (const pat of std.founderIntroduction ?? []) {
    const m = bodyBefore.match(new RegExp(pat, 'i'))
    if (m) r.push(`the founder sentence is out of every message (Lawal, 11:31): a first-person introduction of the founder, "${m[0]}"`)
  }
  return r
}

/** Every reason the message may not be held as approved, scheduled or sent; empty when it passes. */
/**
 * A MESSAGE'S WORDS, READ AGAIN AT SEND TIME (the PM's 20:40 of 19 November 2026, item 2: a letter carrying the founder
 * sentence went at 9.30 am that day, drafted from a template version the platform had not been taught to refuse). The
 * word rules of voiceProblems that need nothing but the words, in its own words: the founder sentence anywhere in the
 * body; before the closing, the internal words and the unproved claims. The sender runs it on every queued message.
 * Pure.
 */
export function wordsProblems(body: string, policy: VoicePolicy): string[] {
  const r: string[] = []
  const std = policy.standard
  for (const words of std.founderSentence ?? []) {
    if (body.toLowerCase().includes(words.toLowerCase())) r.push(`the founder sentence is out of every message (Lawal, 11:31): found ${JSON.stringify(words)}`)
  }
  const L = linesOf(ownPart(toText(body)))
  const k = L.indexOf('Kind regards,')
  const before = (k === -1 ? L.slice(1) : L.slice(1, k)).join(' ')
  const listed = withoutApprovedSentences(before)
  for (const pat of std.internalWords) {
    const m = listed.match(new RegExp(pat, 'i'))
    if (m) r.push(`internal word ${JSON.stringify(m[0])} never reaches a customer (standard Part 2 rule 6)`)
  }
  for (const pat of std.unprovedClaims) {
    const m = listed.match(new RegExp(pat, 'i'))
    if (m) r.push(`unproved claim ${JSON.stringify(m[0])}: only what works on production today is named (standard Part 2 rule 1)`)
  }
  r.push(...founderIntroductionProblems(before, std))
  r.push(...pleasantryProblems(before, std))
  return r
}

export function voiceProblems(msg: VoiceMessage, policy: VoicePolicy): string[] {
  const r: string[] = []
  const cat = msg.category
  if (!CATEGORIES.includes(cat)) return [`unknown category ${String(cat)}`]
  const isEmail = msg.channel === 'email'
  const to = msg.to ?? []
  if (isEmail) {
    if (to.length === 0) r.push('no recipient')
    for (const a of to) if (!EMAIL.test(a)) r.push(`malformed recipient address ${a}`)
  }
  const subj = (msg.subject ?? '').trim()
  if (isEmail || msg.channel === 'website_form') {
    if (!subj) r.push('no subject line')
    if (isEmail && (cat === 'reply' || cat === 'follow_up') && !/^re:\s/i.test(subj)) r.push('a reply must keep the thread subject, starting "Re:"')
    // The advice subject is replaced by an offer led one, from the standard's own list (the PM's 02:00 of 18 November 2026).
    // A source ask (PERM-SOURCE) takes its own subjects and is not judged against the offer subjects (gateway.py the same).
    const sourceAsk = msg.subtype === SOURCE_ASK_SUBTYPE
    const subjects = sourceAsk
      ? [...(policy.standard.sourceAsk?.subjects ?? [])]
      : [...policy.standard.offerSubjects, ...(msg.subtype === 'ACQ-FIRST' ? policy.standard.acqFirstSubjects ?? [] : [])]
    if (cat === 'first_contact' && (/could I ask your advice/i.test(subj) || !subjects.some((pat) => new RegExp(pat).test(subj)))) {
      r.push(
        sourceAsk
          ? `a source ask (PERM-SOURCE) takes one of its approved subjects (standard.json source_ask); found ${JSON.stringify(subj.slice(0, 80))}`
          : `a first message takes an offer led subject (standard Part 2 rule 7); found ${JSON.stringify(subj.slice(0, 80))}`,
      )
    }
  }
  if (isEmail && (cat === 'reply' || cat === 'follow_up') && !msg.threadRef) r.push('a reply must name the thread it answers (thread_ref)')

  const own = ownPart(toText(msg.body ?? ''))
  const L = linesOf(own)
  if (L.length === 0) return [...r, 'empty message']
  if (msg.subtype === SOURCE_ASK_SUBTYPE && (cat === 'first_contact' || cat === 'follow_up')) r.push(...sourceAskBodyProblems(own))
  const gname = (msg.greetingName ?? '').trim()
  if (!gname) r.push('greeting_name missing: the recipient must be verified before drafting')
  if (!/^Hi [^,]+,$/.test(L[0])) r.push(`first line must be the greeting "Hi <name>," on its own line; found ${JSON.stringify(L[0].slice(0, 60))}`)
  else if (gname && L[0] !== `Hi ${gname},`) r.push(`greeting names ${JSON.stringify(L[0].slice(3, -1))} but the verified recipient is ${JSON.stringify(gname)}`)

  const k = L.indexOf('Kind regards,')
  let bodyBefore: string
  if (k === -1) {
    r.push('closing "Kind regards," missing on its own line')
    bodyBefore = L.slice(1).join(' ')
  } else {
    const sig = L.slice(k + 1)
    const want = cat === 'first_contact' ? policy.firstSignature : policy.replySignature
    if (sig.slice(0, want.length).join('\u0000') !== want.join('\u0000')) r.push(`signature must be ${want.join(' / ')}; found ${sig.slice(0, want.length).join(' / ')}`)
    if (cat === 'first_contact') {
      const tail = sig.slice(want.length).join(' ')
      if (!tail.includes(OPT_OUT) || !/https?:\/\/[^\s<>"]+/.test(tail)) r.push('first message footer must carry the opt out line with its unsubscribe link')
    } else if (sig.some((s) => s.includes('ABN'))) {
      r.push('replies sign without the ABN block (voice file)')
    }
    bodyBefore = L.slice(1, k).join(' ')
  }

  const low = bodyBefore.toLowerCase()
  for (const p of policy.noExit) {
    if (low.includes(p.toLowerCase().replace(/^[. ]+|[. ]+$/g, ''))) r.push(`invites a no or offers an exit: ${JSON.stringify(p)} (communication law 5)`)
  }
  if (low.includes("i'm lawal from")) r.push('"I\'m Lawal from" is never used (Lawal\'s rule)')
  r.push(...founderIntroductionProblems(bodyBefore, policy.standard))
  r.push(...pleasantryProblems(bodyBefore, policy.standard))
  if (/[\u2014\u2013]| - /.test(own)) r.push("em dash, en dash or spaced hyphen (Lawal's rule)")
  // gateway.py's placeholder pattern; the fourth word is written T(?:O)DO only so the source carries no to-do marker.
  if (/\{[a-z_]+\}|<link>|T(?:O)DO|\[name\]/.test(own)) r.push('unfilled placeholder left in the message')
  for (const u of own.match(URL_G) ?? []) {
    const u2 = u.replace(/[.,);]+$/, '')
    if (u2.includes('eventlinqs') && !u2.startsWith('https://www.eventlinqs.com.au')) r.push(`EventLinqs link must be https://www.eventlinqs.com.au/...: ${u2}`)
    if (!/^https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s]*)?$/.test(u2)) r.push(`malformed link ${u2}`)
  }
  const sents = bodyBefore
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 25)
  const dup = sents.filter((s, i) => sents.indexOf(s) !== i)
  if (dup.length > 0) r.push(`repeated sentence: ${JSON.stringify([...new Set(dup)].sort()[0].slice(0, 60))}`)
  // Law 6 (gateway.py, the dash rule): the phrase and the noun it modifies, any spacing, any case.
  const spaced = (phrase: string) =>
    phrase
      .split(' ')
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')
  for (const c of policy.compounds.mustHyphenateBeforeNoun) {
    const m = own.match(new RegExp(`\\b${spaced(c)}\\s+(${policy.compounds.nounsAfter})\\b`, 'i'))
    if (m) r.push(`compound modifier needs its hyphen: "${m[0]}" -> "${c.replace(/ /g, '-')} ${m[1]}" (Lawal's dash rule)`)
  }
  for (const c of policy.compounds.compoundWords) {
    if (new RegExp(`\\b${spaced(c)}\\b`, 'i').test(own)) r.push(`compound word needs its hyphen: "${c}" -> "${c.replace(/ /g, '-')}"`)
  }
  const sender = (msg.from ?? '').trim().toLowerCase()
  if (!sender) r.push('no sending mailbox (from): the right mailbox must be named before drafting')
  for (const t of policy.threads) {
    if (to.some((a) => a.toLowerCase() === t.recipient.toLowerCase()) && sender && sender !== t.mailbox.toLowerCase()) r.push(`wrong mailbox: ${t.recipient} is written to from ${t.mailbox} (${t.why}), not ${sender}`)
  }
  for (const p of policy.permissions) {
    if (!to.some((a) => a.toLowerCase() === p.recipient.toLowerCase())) continue
    for (const pat of p.neverAsk) if (new RegExp(pat, 'i').test(own)) r.push(`asks again for permission already given: ${p.topic} (${p.given})`)
  }
  return [...r, ...standardProblems(msg, policy.standard, bodyBefore)]
}

const dayOf = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : Number.NaN)

/**
 * gateway.py standard_checks, line for line: on a first letter or a follow up, no internal word, no unproved claim, the
 * consent basis, and the timing rule (3 or more days before its night). Lawal's paragraph rule and the one call to
 * action count were removed on 22 November 2026 (his 20:45), in both.
 */
function standardProblems(msg: VoiceMessage, std: VoiceStandard, bodyBefore: string): string[] {
  const r: string[] = []
  const cat = msg.category
  if (!std.outreachCategories.includes(cat)) return r
  const listed = withoutApprovedSentences(bodyBefore)
  for (const pat of std.internalWords) {
    const m = listed.match(new RegExp(pat, 'i'))
    if (m) r.push(`internal word ${JSON.stringify(m[0])} never reaches a customer (standard Part 2 rule 6)`)
  }
  for (const pat of std.unprovedClaims) {
    const m = listed.match(new RegExp(pat, 'i'))
    if (m) r.push(`unproved claim ${JSON.stringify(m[0])}: only what works on production today is named (standard Part 2 rule 1)`)
  }
  // As gateway.py reads it: the whole body, case ignored (the founder sentence, Lawal's 11:31 of 18 November 2026).
  for (const words of std.founderSentence ?? []) {
    if ((msg.body ?? '').toLowerCase().includes(words.toLowerCase())) r.push(`the founder sentence is out of every message (Lawal, 11:31): found ${JSON.stringify(words)}`)
  }
  const c = msg.consent
  if (!c || !std.consentBases.includes(c.basis)) r.push(`consent basis missing or unknown: one of ${std.consentBases.join(', ')} (standard Part 2 rule 5)`)
  else if (c.basis === 'conspicuous_publication' && !((c.publishedOnUrl ?? '').startsWith('https://') && c.noMarketingStatementChecked === true)) {
    r.push('consent by conspicuous publication needs the page it was published on and its no refusal statement checked (standard Part 2 rule 5)')
  }
  // The ACQ-FIRST letter's no event form names no night, so the timing rule has nothing to judge (gateway.py, the same).
  // The no night subjects: the old single one, and every subject of a type that names no night (standard.json acq_types,
  // needs_event_date false, as gateway.py reads it).
  const noEventSubjects = [...(std.acqFirstNoEventSubject ? [std.acqFirstNoEventSubject] : []), ...(std.acqFirstNoEventSubjects ?? [])]
  const noEvent = msg.subtype === 'ACQ-FIRST' && msg.eventDate === undefined && noEventSubjects.some((pat) => new RegExp(pat).test((msg.subject ?? '').trim()))
  if (noEvent) return r
  // The source ask names no night (standard.json source_ask, needs_event_date false; the founder's 12:14 of 23 November
  // 2026), so the timing rule has nothing to judge, as gateway.py reads it. Without that entry the rule stands.
  if (msg.subtype === SOURCE_ASK_SUBTYPE && std.sourceAsk !== undefined && !std.sourceAsk.needsEventDate) return r
  const ev = dayOf(msg.eventDate)
  const lands = dayOf(msg.landsOn)
  if (Number.isNaN(ev) || Number.isNaN(lands)) r.push('timing: event_date and lands_on (YYYY-MM-DD) are needed so no letter lands on or after its night (standard Part 2 rule 4)')
  else {
    const ahead = Math.round((ev - lands) / 86_400_000)
    if (ahead < std.minDaysAhead) r.push(`timing: it would land ${ahead} day(s) before its night; a letter about a night goes only ${std.minDaysAhead} or more days ahead, never on or after its day (standard Part 2 rule 4)`)
  }
  return r
}

/** gateway.py chash: the exact content an approval is for. */
export function voiceContentHash(msg: VoiceMessage): string {
  const keep = { body: msg.body, category: msg.category, channel: msg.channel, from: msg.from ?? null, greeting_name: msg.greetingName ?? null, subject: msg.subject ?? null, thread_ref: msg.threadRef ?? null, to: [...(msg.to ?? [])] }
  return createHash('sha256').update(JSON.stringify(keep)).digest('hex').slice(0, 16)
}

export interface VoiceApproval {
  readonly contentHash: string
  readonly policyVersion: string
  /** Lawal himself approved it: no other person, window or agent can. */
  readonly byFounder: boolean
}

/** gateway.py send-check: the words pass now, and Lawal approved exactly these words under this policy. */
export function approvalProblems(approval: VoiceApproval | null, msg: VoiceMessage, policy: VoicePolicy): string[] {
  const words = voiceProblems(msg, policy)
  if (words.length > 0) return words
  if (!approval) return ['no approval recorded for this message']
  const why: string[] = []
  if (!approval.byFounder) why.push('only Lawal approves a founder-voice message')
  if (approval.contentHash !== voiceContentHash(msg)) why.push('changed after approval: approve the new wording')
  if (approval.policyVersion !== policy.version) why.push('voice policy changed since approval: approve again')
  return why
}
