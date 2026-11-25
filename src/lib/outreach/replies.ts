/**
 * REPLIES, HANDLED AUTOMATICALLY WHERE THEY ARE CLEAR (window 6, 28 October 2026; the engine plan's FULL AUTOMATION:
 * "a clear stop or unsubscribe is suppressed at once with the one-line confirmation; a clear yes gets message 5 ... and
 * the claim link; a clear take it down removes the listing and confirms; a question that matches a stored answer gets
 * that answer. Anything not clear goes to /admin/today. Every classification is logged with its text and confidence.")
 *
 * THE CLASSIFIER IS RULES, NOT A MODEL, on purpose: every decision it makes can be read back from its text and tested,
 * and it says how sure it is. Only a classification at CLEAR (0.9) or above acts; anything less, or two meanings at
 * once, is logged as it is and waits for Lawal (needs_lawal). It reads the reply with the quoted thread removed.
 *
 * WHAT IT DOES NOT DO, said plainly: a clear take down is recorded (outreach_replies, the suppression list by the
 * database's own trigger, a removal_requests row) but the listing itself is not removed here and its confirmation is
 * HELD until it is, because "Done, it's off EventLinqs" must be true when it is sent. Listing removal is the listings
 * owner's write.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { PROVIDER_NAMES } from '@/lib/events/booking-links'
import type { InboundMessage } from './graph'
import { draftFromTemplate } from './drafts'
import { contextKeys } from './contact-policy'
import { objectionOf } from './objections'
import type { MediaDeps } from '@/lib/listings/organiser-media'
import { keepEmailedImages, recordEmailedYes, type EmailedFile, type EmailedMessage, type ThreadTouch } from '@/lib/comms/emailed-media'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'

type Admin = SupabaseClient<Database>

export const CLEAR = 0.9

export type ReplyOutcome = 'yes' | 'no' | 'stop' | 'take_down' | 'later' | 'question' | 'referred' | 'unclear' | 'photographs' | 'correction' | 'permission'

/**
 * THE THREE CLASSES AN ORGANISER'S ANSWER TO A LISTING OFTEN IS (law 30, the CRM directive's section 4: A, photographs;
 * C, a correction; and the permission they give). Aria's reply of 19 November 2026 held all three ("I've attached three
 * images ... We're also happy for EventLinqs to share these images ... Just one small correction") and was read as
 * 'referred' at 0.6, because her signature names a place. Each is a decision about an organiser's listing or images,
 * so it is held for Lawal with its class named, never answered by itself; the class tells the panel what to show.
 */
export const DECISION_CLASSES: readonly ReplyOutcome[] = ['photographs', 'correction', 'permission']
const PHOTO_WORDS = /\b(photos?|photographs?|images?|pictures?|pics|flyers?|posters?|artwork|attached)\b/i
const CORRECTION_WORDS = /\b(correction|correct (the|our|it)|incorrect|wrong|update the (venue|date|time|price|title|address|listing)|should (be|read|say)|typo|change the (venue|date|time|title|address))\b/i
// "you're welcome to use" is GroovyTown's own yes (the PM's 13:55 of 23 November 2026: "you're welcome to use our event
// promotional material for EventLinqs listings and social posts, now and for future events"), with a typed or a curly
// apostrophe as a mail client writes it.
const PERMISSION_WORDS = /\b(happy for (you|eventlinqs) to (use|share|post)|you (can|may) (use|share|post)|feel free to (use|share|post)|(you have|with) our permission|permission to (use|share|post)|go ahead and (use|share|post)|(you['’]re|you are) (more than |most |very )?welcome to (use|share|post))\b/i

/** Whether their own words (the quoted thread removed) give the use of their material: the 'permission' class. */
export function grantsInWords(ownWords: string): boolean {
  return PERMISSION_WORDS.test(ownWords)
}

export type ReplyKind =
  | { kind: 'bounce'; hard: boolean }
  | { kind: 'auto_reply' }
  | { kind: 'reply'; outcome: ReplyOutcome; confidence: number; answerKey: string | null; held?: string }

/**
 * A YES WRITTEN AFTER A GREETING, OR ON A CONDITION OUR OFFER MEETS (the PM's 01:20 item 4 and 07:03 of 25 November 2026):
 * Stage 29 Studios answered our complimentary listing letter "Hi Lawal, if it's free then yes this would be great thank
 * you" and was read as unclear at 0.3, because the yes opener was looked for only at a line's start. A yes may follow a
 * greeting on the same line, and a yes on the condition that it is free is a yes, because what we offer is free
 * (reply_cost: "Listing and featuring are free"). Any other condition stays unclear.
 */
const GREETING = String.raw`(?:(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))\b[^,\n]{0,30},?\s*)?`
const YES_OPENER = new RegExp(String.raw`^\s*${GREETING}(yes|yep|yeah|yes please|sure|sounds (good|great)|happy (to|for you)|go ahead|that works|absolutely|of course|love to)\b`, 'im')
const YES_IF_FREE =
  /\bif (it|this|that|the listing)(['’]s| is| will be)( (completely|totally|all))? (free|complimentary|at no cost|no cost|no charge)\b[^.?!\n]{0,30}?\b(then )?(yes|sure|happy|great|keen|love|go ahead|count us in|we['’]re in)\b/i

/**
 * MONEY OR A CONTRACT IS NEVER ANSWERED BY ITSELF (the CRM directive of 19 November 2026, section 9, as Lawal wrote it: no
 * reply promises what is not true, agrees a contract, or commits money; the PM's 07:03 of 25 November 2026, item 2): a
 * reply that asks us to pay, names a price of theirs, or asks for a contract, an agreement, an invoice, a sponsorship or a
 * commission is held whatever else it says, and goes to the PM, who shows Lawal the words. A question about OUR cost is
 * not this: reply_cost answers it (listing is free).
 */
export const MONEY_OR_CONTRACT =
  /\b(invoices?|contracts?|agreements?|sign(ed|ing)? (the|an|our|a|any)\b|terms and conditions|pay (us|you|for (the|a|an|our) (listing|feature|post|spot|placement))|payment (of|for|to)|our (fee|fees|rate|rates|price|prices|charge|charges) (is|are|for|start)|sponsor(s|ship)?|commission|advertising (fee|rate|package)s?|media kit|rate card)\b|[$]\s?\d/i
export const HELD_MONEY_OR_CONTRACT = 'it speaks of money or a contract, which no reply answers by itself (CRM directive section 9): held for the PM'

/** The reply without the thread it quotes: lines from the first "On ... wrote:", "From:" block or ">" quote are dropped. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const cut = lines.findIndex((l) => /^\s*>/.test(l) || /^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^From:\s/i.test(l.trim()))
  return (cut < 0 ? lines : lines.slice(0, cut)).join('\n').trim()
}

const ANSWERS: { key: string; outcome: 'question' | 'later'; pattern: RegExp }[] = [
  { key: 'reply_cost', outcome: 'question', pattern: /\b(how much|what does it cost|cost|price|fees?|charge)\b/i },
  { key: 'reply_existing_ticketing', outcome: 'question', pattern: /\b(we (already )?(use|sell (through|on|via))|humanitix|eventbrite|trybooking|moshtix|oztix|ticketmaster|ticketek)\b/i },
  { key: 'reply_who_are_you', outcome: 'question', pattern: /\b(who are you|who is this|what is eventlinqs|never heard of)\b/i },
  { key: 'reply_why_listed', outcome: 'question', pattern: /\b(why (is|are) (we|it|our|my)|how did you get (our|my)|where did you get)\b/i },
  { key: 'reply_not_now', outcome: 'later', pattern: /\b(not (right )?now|maybe later|another time|too busy|after (the )?(season|christmas|summer|new year))\b/i },
]

/**
 * A reply asking what we mean: which of two things ("are you hoping we send a list, or asking to take events from our
 * site?"), or what we want ("what exactly are you after?", "could you clarify what you need?"). One question, with an
 * 'or' between two readings, or a 'what' about what we want.
 */
const CLARIFYING: readonly RegExp[] = [
  /\b(are|were|is|was|do|did|would|will) you\b[^?]{0,200}\bor\b[^?]{0,200}\?/i,
  /\bwhat (exactly )?(is it )?(that )?(are you|do you|did you|would you|you('re| are))\b[^?.]{0,60}\b(want|wanting|after|asking|looking for|hoping|need|mean|proposing)\b/i,
  /\b(could|can|would) you (please )?(clarify|explain|confirm) (what|whether|which)\b/i,
]

/** An acknowledgement's opening and its one message: received or passed on (no auto header needed). */
const ACK_OPEN = /^\s*(thank you|thanks) for (contacting|your (e-?mail|message|enquiry|inquiry|interest)|getting in touch|reaching out)\b/i
const ACK_BODY = /\b(has been (forwarded|passed on|received|sent on)|we have received your|we('ll| will) (respond|get back|be in touch|reply)|this is an automated|do not reply to this (e-?mail|message)|one of our team will)\b/i

export function classifyInbound(m: Pick<InboundMessage, 'subject' | 'fromAddress' | 'text' | 'headers' | 'hasAttachments'>): ReplyKind {
  const kind = classifyWords(m)
  // Money or a contract holds any answer but a stop or a take down, which are honoured whatever else is said.
  if (kind.kind === 'reply' && kind.outcome !== 'stop' && kind.outcome !== 'take_down' && MONEY_OR_CONTRACT.test(stripQuoted(m.text))) {
    return { ...kind, confidence: Math.min(kind.confidence, 0.5), answerKey: null, held: HELD_MONEY_OR_CONTRACT }
  }
  return kind
}

function classifyWords(m: Pick<InboundMessage, 'subject' | 'fromAddress' | 'text' | 'headers' | 'hasAttachments'>): ReplyKind {
  const auto = (m.headers['auto-submitted'] ?? '').toLowerCase()
  const isDaemon = /^(mailer-daemon|postmaster)@/i.test(m.fromAddress)
  if (isDaemon || /^(undeliverable|delivery status notification \(failure\)|mail delivery failed|returned mail)/i.test(m.subject)) {
    return { kind: 'bounce', hard: /\b5\.\d\.\d+\b|\b55\d\b/.test(m.text) || !/\b4\.\d\.\d+\b/.test(m.text) }
  }
  if ((auto && auto !== 'no') || m.headers['x-autoreply'] || /^(automatic reply|auto(matic)?[- ]reply|out of (the )?office)/i.test(m.subject)) {
    return { kind: 'auto_reply' }
  }

  const text = stripQuoted(m.text)
  const words = text.split(/\s+/).filter(Boolean).length
  const short = words <= 25
  const hits: { outcome: ReplyOutcome; key: string | null }[] = []

  if (/\b(unsubscribe|stop (emailing|contacting|messaging)|remove me|take me off|do ?n[o']t (contact|email|message)|no more emails|please stop)\b|^\s*stop\.?\s*$/im.test(text)) hits.push({ outcome: 'stop', key: 'reply_stop' })
  if (/\b(take (it|this|us|that|the listing|our listing) (down|off)|remove (the|our|my) (listing|venue|page)|delete (the|our) (listing|page)|unlist)\b/i.test(text)) hits.push({ outcome: 'take_down', key: 'reply_take_down' })
  if (/^\s*(no thanks|no thank you|not interested|we('re| are) not interested|we('ll| will) pass|no,? (we('re| are)|not for us))/im.test(text)) hits.push({ outcome: 'no', key: null })
  if ((YES_OPENER.test(text) || YES_IF_FREE.test(text)) && !/\b(not|no|don'?t)\b/i.test((text.split('\n')[0] ?? '').replace(/\bno (cost|charge)\b/gi, ''))) hits.push({ outcome: 'yes', key: 'thank_you' })
  // A cost named as the condition of a yes ("if it is at no cost, yes please") is answered by our offer, not a question.
  for (const a of ANSWERS) if (a.pattern.test(text) && !(a.key === 'reply_cost' && YES_IF_FREE.test(text))) hits.push({ outcome: a.outcome, key: a.key })
  if (/\b(talk to|speak (to|with)|contact|email|reach out to)\s+[A-Z][a-z]+\b/.test(text) || /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(text)) hits.push({ outcome: 'referred', key: null })

  // AN ACKNOWLEDGEMENT WITH NO AUTO HEADER (Bendigo Symphony Orchestra's of 21 November 2026, 7.01 am: 'Thank you for
  // contacting the Bendigo Symphony Orchestra. Your message has been forwarded to our Committee.', read then as a person's
  // 'unclear' and put to Lawal): a short message that only thanks for the contact and says it was received or passed on
  // is an automatic reply, closed by the engine. Only when nothing in it is a person's answer (no stop, no yes or no, no
  // question, no referral), and never past eighty words.
  if (hits.length === 0 && words <= 80 && ACK_OPEN.test(text) && ACK_BODY.test(text) && !text.includes('?')) return { kind: 'auto_reply' }

  // A stop or a take down wins over anything else in the same reply: honouring a stop is never the wrong reading.
  const stop = hits.find((h) => h.outcome === 'stop') ?? hits.find((h) => h.outcome === 'take_down')
  if (stop) return { kind: 'reply', outcome: stop.outcome, confidence: short ? 0.95 : 0.9, answerKey: stop.key }
  // Then the decision classes, in the order the work goes: the photographs first (they wait on a decision), then a
  // correction to the listing, then a permission given; each outranks 'referred', which a signature can trip.
  if (m.hasAttachments && PHOTO_WORDS.test(text)) return { kind: 'reply', outcome: 'photographs', confidence: 0.95, answerKey: null }
  if (CORRECTION_WORDS.test(text)) return { kind: 'reply', outcome: 'correction', confidence: 0.9, answerKey: null }
  if (PERMISSION_WORDS.test(text)) return { kind: 'reply', outcome: 'permission', confidence: 0.9, answerKey: null }
  // A QUESTION ABOUT WHAT WE ASK (the PM's 20:50 item 4 of 24 November 2026): a reply to the Bendigo source ask asked which
  // of two things we meant and was read as 'referred', because its signature named a place. A reply that asks which of two
  // things we mean, or what we want, is a 'question', outranking 'referred'; no answer is drafted by itself (the answer to
  // a source uses source_ask version 2's wording), so it waits for Lawal with its class named.
  if (CLARIFYING.some((p) => p.test(text))) return { kind: 'reply', outcome: 'question', confidence: short ? 0.8 : 0.75, answerKey: null }
  const distinct = [...new Map(hits.map((h) => [h.outcome + (h.key ?? ''), h])).values()]
  if (distinct.length === 1) {
    const h = distinct[0]
    const confidence = h.outcome === 'referred' ? 0.6 : short ? 0.92 : 0.75
    return { kind: 'reply', outcome: h.outcome, confidence, answerKey: h.key }
  }
  return { kind: 'reply', outcome: 'unclear', confidence: distinct.length === 0 ? 0.3 : 0.5, answerKey: null }
}

/* The names come from the one table the listing page reads, the only file the copy gate lets spell them; a platform
 * that table does not name (Megatix, Ticket Tailor) is recognised as none, so its answer is held for Lawal. */
const PROVIDERS = Object.values(PROVIDER_NAMES).filter((n): n is string => n !== null)

/** The ticketing provider their own reply names, in its own spelling, or null: the answer is then held for Lawal. */
export function providerNamed(text: string): string | null {
  return PROVIDERS.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(text)) ?? null
}

/** Words a mailbox's display name holds when it names a role, a team or an organisation rather than a person. */
const NOT_A_PERSON = /\b(info|admin|administration|team|events?|bookings?|office|enquiries|inquiries|reception|hello|contact|marketing|manager|management|festival|studios?|club|bar|cafe|theatre|gallery|venue|centre|center|council|committee|inc|pty|ltd|group|music|productions?|entertainment|presents|the)\b/i

/**
 * THE NAME A PERSON SIGNS THEIR OWN MAIL WITH (the PM's 07:09 item 2 of 25 November 2026: no reply may greet a team "when
 * the sender gave a first name"; Jennifer Turner of Stage 29 Studios wrote from info@ and was greeted "Stage 29 Studios
 * team"). Their mailbox's display name, when it is a person's: two or three capitalised words, none naming a role, a team
 * or an organisation, and none a word of their organisation's own name. Null otherwise. Pure.
 */
export function personNameFrom(displayName: string | null | undefined, organiser: string | null | undefined): string | null {
  const name = (displayName ?? '').replace(/["'`]/g, '').trim().replace(/\s+/g, ' ')
  if (!name || name.includes('@')) return null
  const words = name.split(' ')
  if (words.length < 2 || words.length > 3) return null
  if (!words.every((w) => /^[A-Z][A-Za-z’-]{1,30}$/.test(w))) return null
  if (NOT_A_PERSON.test(name)) return null
  const orgWords = new Set((organiser ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  if (words.some((w) => orgWords.has(w.toLowerCase()))) return null
  return name
}

/**
 * Their own name, recorded on their contact when it holds none, from the message they sent from that same address (a
 * colleague answering in the thread is never named for the contact). The greeting then names them ("Hi Jennifer,"), as
 * the gateway's verified recipient rule reads person_name first. A refusal is said in the log and changes nothing else.
 */
async function recordSenderName(db: Admin, contactId: string, m: InboundMessage): Promise<void> {
  // Never a reason the reply itself is not logged: any fault here is said in the log and the run goes on.
  try {
    const contact = await db.from('organiser_contacts').select('address, person_name, organiser_id').eq('id', contactId).maybeSingle()
    if (contact.error || !contact.data || (contact.data.person_name ?? '').trim()) return
    if (String(contact.data.address ?? '').toLowerCase() !== m.fromAddress.toLowerCase()) return
    // The organisation's own words are left out of their name; the platform's own listings organisation is no sender's
    // organisation (src/lib/growth/platform-organiser.ts), so its name is never read for that.
    const orgId = (contact.data.organiser_id as string | null) ?? null
    const platform = orgId ? await readPlatformOrganiserIds(db) : new Set<string>()
    const organiser = orgId && !platform.has(orgId) ? await db.from('organisers').select('name').eq('id', orgId).maybeSingle() : null
    const name = personNameFrom(m.fromName, (organiser?.data?.name as string | undefined) ?? null)
    if (!name) return
    const saved = await db.from('organiser_contacts').update({ person_name: name }).eq('id', contactId).is('person_name', null)
    if (saved.error) console.error(`[outreach/replies] the name ${name} could not be recorded for contact ${contactId}:`, saved.error.message)
  } catch (err) {
    console.error(`[outreach/replies] their own name was not read for contact ${contactId}:`, err instanceof Error ? err.message : String(err))
  }
}

export type InboxReport = { read: number; matched: number; unmatched: number; autoReplies: number; bounces: number; replies: { id: string; outcome: string; confidence: number; action: string }[]; failed: { messageId: string | null; error: string }[] }

const OUR_ID = /<[^<>\s]+@eventlinqs\.com>/gi

/** Our message ids a message names (its In-Reply-To, References, or for a bounce its quoted original). */
function ourIdsIn(m: InboundMessage): string[] {
  return [...new Set(`${m.headers['in-reply-to'] ?? ''} ${m.headers['references'] ?? ''} ${m.text}`.match(OUR_ID) ?? [])]
}

/**
 * THEIR ATTACHMENTS, READ FROM THE MAILBOX ONLY WHEN TAKEN (the master directive's A3 (1)): the image attachments of a
 * message (inbound-attachments.ts isShownPhoto chose them), and the media pipeline that stores them. The run passes it;
 * without it a message's attachments stay in the mailbox, as before.
 */
export type InboxIntake = { readonly files: (graphId: string) => Promise<readonly EmailedFile[]>; readonly media: MediaDeps }

/** Said in a reply's action when its attachments could not be kept, so the next run that reads it takes them again. */
export const ATTACHMENTS_NOT_KEPT = 'its attachments were not kept'

/** Their attachments, kept as candidate assets (src/lib/comms/emailed-media.ts); the answer in words for the reply's action. */
async function takeAttachments(
  db: Admin,
  m: InboundMessage,
  input: { contactId: string; touch: ThreadTouch; message: EmailedMessage; now: Date; by: string },
  intake: InboxIntake,
): Promise<string> {
  try {
    const kept = await keepEmailedImages(db, input, { files: () => intake.files(m.graphId), media: intake.media })
    if (kept.state === 'not taken') return `its attachments stay in the mailbox: ${kept.why}`
    const parts = [`${kept.kept} image${kept.kept === 1 ? '' : 's'} kept as candidates ${kept.night ? `for ${kept.night}` : 'for review, no night of theirs named by the thread'}`]
    if (kept.already) parts.push(`${kept.already} already in the register`)
    if (kept.refused.length) parts.push(`not kept: ${kept.refused.join('; ')}`)
    return parts.join('; ')
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    console.error(`[outreach/replies] message ${m.internetMessageId || '(no id)'}: ${ATTACHMENTS_NOT_KEPT}:`, why)
    return `${ATTACHMENTS_NOT_KEPT} (${why}); the next run takes them again`
  }
}

/** Read new inbox messages, log each reply against its contact, and act on the clear ones. Idempotent by message id. */
export async function handleInbox(
  db: Admin,
  messages: InboundMessage[],
  deps: { mailbox: string; origin: string; actingUser: string; now: Date; intake?: InboxIntake },
): Promise<InboxReport> {
  const report: InboxReport = { read: messages.length, matched: 0, unmatched: 0, autoReplies: 0, bounces: 0, replies: [], failed: [] }
  for (const m of messages) {
    // ONE MESSAGE IN ITS OWN GUARD (Lawal's 15:14 of 22 November 2026: no individual message may disable a whole
    // operation; the PM's 15:15, F3): a reply that fails to log or act is recorded with its message id and the reason,
    // and every later message in the mailbox is still read. A message never logged is read again next run, by its id.
    try {
    if (m.fromAddress === deps.mailbox.toLowerCase()) continue
    const kind = classifyInbound(m)
    if (kind.kind === 'auto_reply') {
      report.autoReplies++
      continue
    }
    const ids = ourIdsIn(m)
    const touch = ids.length
      ? (await db.from('outreach_touches').select('id, contact_id, subject, context_key').in('internet_message_id', ids).order('sent_at', { ascending: false }).limit(1)).data?.[0]
      : undefined

    if (kind.kind === 'bounce') {
      if (!touch) {
        report.unmatched++
        continue
      }
      report.bounces++
      await db.from('outreach_delivery_events').insert({
        touch_id: touch.id,
        kind: kind.hard ? 'bounce_hard' : 'bounce_soft',
        occurred_at: m.receivedAt,
        detail: m.text.slice(0, 2000),
        source: 'graph_inbox',
        source_message_id: m.internetMessageId || null,
      })
      continue
    }

    const contactId =
      touch?.contact_id ??
      (await db.from('organiser_contacts').select('id').eq('channel', 'email').eq('address', m.fromAddress).maybeSingle()).data?.id
    if (!contactId) {
      report.unmatched++
      continue
    }
    report.matched++
    await recordSenderName(db, contactId, m)
    const clear = kind.confidence >= CLEAR && kind.outcome !== 'unclear' && kind.outcome !== 'referred'
    const logged = await db
      .from('outreach_replies')
      .insert({
        contact_id: contactId,
        touch_id: touch?.id ?? null,
        received_at: m.receivedAt,
        wording: (m.text.trim() || m.subject || '(empty)').slice(0, 5000),
        outcome: kind.outcome,
        objection: objectionOf(kind),
        classified_by: 'rules',
        confidence: kind.confidence,
        needs_lawal: !clear || kind.outcome === 'take_down' || DECISION_CLASSES.includes(kind.outcome),
        source_message_id: m.internetMessageId || null,
        logged_by: deps.actingUser,
      })
      .select('id')
      .single()
    // THEIR ATTACHMENTS (src/lib/comms/emailed-media.ts): taken from a reply that is not a stop, a take down or a no.
    const thread: ThreadTouch = touch ? { subject: (touch.subject as string | null) ?? null, context_key: (touch.context_key as string | null) ?? null } : null
    const message: EmailedMessage = { internetMessageId: m.internetMessageId, fromAddress: m.fromAddress, receivedAt: m.receivedAt, ownWords: stripQuoted(m.text) }
    const takes = deps.intake && m.hasAttachments === true && kind.outcome !== 'stop' && kind.outcome !== 'take_down' && kind.outcome !== 'no' ? deps.intake : null
    if (logged.error) {
      // A second read of the same message is refused by the unique message id: already handled, nothing more to do,
      // except where its attachments could not be kept last time: they are taken again (the register never keeps the
      // same file twice), and the reply's action says what happened.
      if (/outreach_replies_one_per_message/.test(logged.error.message)) {
        if (takes && m.internetMessageId) {
          const before = await db.from('outreach_replies').select('id, action_taken').eq('source_message_id', m.internetMessageId).maybeSingle()
          if (before.data && String(before.data.action_taken ?? '').includes(ATTACHMENTS_NOT_KEPT)) {
            const again = await takeAttachments(db, m, { contactId, touch: thread, message, now: deps.now, by: deps.actingUser }, takes)
            const kept = String(before.data.action_taken).split(`; ${ATTACHMENTS_NOT_KEPT}`)[0]
            await db.from('outreach_replies').update({ action_taken: `${kept}; ${again}` }).eq('id', before.data.id as string)
          }
        }
        continue
      }
      throw new Error(`logging a reply: ${logged.error.message}`)
    }

    // A reply held for money or a contract says so; any other held reply waits as before (the leads watch reads both).
    let action = kind.kind === 'reply' && kind.held ? kind.held : 'waits for Lawal'
    if (clear && kind.outcome === 'take_down') {
      const contact = await db.from('organiser_contacts').select('organiser_id, address, person_name').eq('id', contactId).single()
      const link = contact.data ? await db.from('organiser_venues').select('venue_id').eq('organiser_id', contact.data.organiser_id).limit(1) : null
      const venueId = link?.data?.[0]?.venue_id
      if (venueId) {
        const asked = await db.from('removal_requests').insert({
          venue_id: venueId,
          requester_email: contact.data?.address ?? m.fromAddress,
          requester_name: contact.data?.person_name || m.fromName || m.fromAddress,
          reason: 'Asked by reply to an outreach email',
          note: `outreach_replies ${logged.data.id}`,
        })
        action = asked.error
          ? `suppressed; the removal request could not be written (${asked.error.message}); waits for Lawal`
          : 'suppressed; a removal request is open for the listings owner; the confirmation is held until the listing is removed'
      } else {
        action = 'suppressed; no venue is linked to this organiser, so the listing to remove waits for Lawal'
      }
    } else if (clear && kind.answerKey) {
      const purpose = kind.outcome === 'yes' ? 'relationship' : 'reply'
      const drafted = await draftFromTemplate(db, {
        contactId,
        templateKey: kind.answerKey,
        purpose,
        extraFields: { 'thread subject': m.subject.replace(/^(re|fw|fwd):\s*/i, ''), provider: providerNamed(stripQuoted(m.text)) },
        inReplyTo: m.internetMessageId || null,
        contextKey: m.internetMessageId ? contextKeys.reply(m.internetMessageId) : null,
        scheduledFor: deps.now,
        origin: deps.origin,
        draftedBy: deps.actingUser,
      })
      action =
        drafted.state === 'done'
          ? `${kind.answerKey} ${drafted.value.state}${drafted.value.heldBecause.length ? `: ${drafted.value.heldBecause.join('; ')}` : ''}`
          : `${kind.answerKey} ${drafted.state === 'held by policy' ? 'not drafted' : 'refused'}: ${drafted.reason}`
    } else if (clear && kind.outcome === 'no') {
      action = 'the organiser is stopped; nothing sent'
    }
    // AN EMAILED YES IS A YES (the PM's 13:55 of 23 November 2026): their own words granting the use of their material,
    // the 'permission' class, are logged as their yes, night by night, before their attachments are taken, so the images
    // they sent with it are registered under it (src/lib/comms/emailed-media.ts recordEmailedYes).
    if (kind.outcome !== 'stop' && kind.outcome !== 'take_down' && kind.outcome !== 'no' && grantsInWords(message.ownWords)) {
      const yes = await recordEmailedYes(db, { contactId, touch: thread, message, now: deps.now, by: deps.actingUser }).catch((err: unknown) => ({
        state: 'not recorded' as const,
        why: err instanceof Error ? err.message : String(err),
      }))
      action = `${action}; ${yes.state === 'recorded' ? `their yes is recorded from their own words for ${yes.nights.join(', ')}` : `their yes is not recorded: ${yes.why}`}`
    }
    if (takes) action = `${action}; ${await takeAttachments(db, m, { contactId, touch: thread, message, now: deps.now, by: deps.actingUser }, takes)}`
    await db.from('outreach_replies').update({ action_taken: action }).eq('id', logged.data.id)
    report.replies.push({ id: logged.data.id, outcome: kind.outcome, confidence: kind.confidence, action })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[outreach/replies] ${deps.mailbox}: message ${m.internetMessageId || '(no id)'} not handled:`, error)
      report.failed.push({ messageId: m.internetMessageId || null, error })
    }
  }
  return report
}
