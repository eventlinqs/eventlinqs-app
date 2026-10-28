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
import type { InboundMessage } from './graph'
import { draftFromTemplate } from './drafts'

type Admin = SupabaseClient<Database>

export const CLEAR = 0.9

export type ReplyOutcome = 'yes' | 'no' | 'stop' | 'take_down' | 'later' | 'question' | 'referred' | 'unclear'

export type ReplyKind =
  | { kind: 'bounce'; hard: boolean }
  | { kind: 'auto_reply' }
  | { kind: 'reply'; outcome: ReplyOutcome; confidence: number; answerKey: string | null }

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

export function classifyInbound(m: Pick<InboundMessage, 'subject' | 'fromAddress' | 'text' | 'headers'>): ReplyKind {
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
  if (/^\s*(yes|yep|yeah|yes please|sure|sounds (good|great)|happy (to|for you)|go ahead|that works|absolutely|of course|love to)\b/im.test(text) && !/\b(not|no|don'?t)\b/i.test(text.split('\n')[0] ?? '')) hits.push({ outcome: 'yes', key: 'thank_you' })
  for (const a of ANSWERS) if (a.pattern.test(text)) hits.push({ outcome: a.outcome, key: a.key })
  if (/\b(talk to|speak (to|with)|contact|email|reach out to)\s+[A-Z][a-z]+\b/.test(text) || /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/.test(text)) hits.push({ outcome: 'referred', key: null })

  // A stop or a take down wins over anything else in the same reply: honouring a stop is never the wrong reading.
  const stop = hits.find((h) => h.outcome === 'stop') ?? hits.find((h) => h.outcome === 'take_down')
  if (stop) return { kind: 'reply', outcome: stop.outcome, confidence: short ? 0.95 : 0.9, answerKey: stop.key }
  const distinct = [...new Map(hits.map((h) => [h.outcome + (h.key ?? ''), h])).values()]
  if (distinct.length === 1) {
    const h = distinct[0]
    const confidence = h.outcome === 'referred' ? 0.6 : short ? 0.92 : 0.75
    return { kind: 'reply', outcome: h.outcome, confidence, answerKey: h.key }
  }
  return { kind: 'reply', outcome: 'unclear', confidence: distinct.length === 0 ? 0.3 : 0.5, answerKey: null }
}

const PROVIDERS = ['Humanitix', 'Eventbrite', 'TryBooking', 'Moshtix', 'Oztix', 'Ticketmaster', 'Ticketek', 'Megatix', 'Ticket Tailor', 'DICE']

/** The ticketing provider their own reply names, in its own spelling, or null: the answer is then held for Lawal. */
export function providerNamed(text: string): string | null {
  return PROVIDERS.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(text)) ?? null
}

export type InboxReport = { read: number; matched: number; unmatched: number; autoReplies: number; bounces: number; replies: { id: string; outcome: string; confidence: number; action: string }[] }

const OUR_ID = /<[^<>\s]+@eventlinqs\.com>/gi

/** Our message ids a message names (its In-Reply-To, References, or for a bounce its quoted original). */
function ourIdsIn(m: InboundMessage): string[] {
  return [...new Set(`${m.headers['in-reply-to'] ?? ''} ${m.headers['references'] ?? ''} ${m.text}`.match(OUR_ID) ?? [])]
}

/** Read new inbox messages, log each reply against its contact, and act on the clear ones. Idempotent by message id. */
export async function handleInbox(
  db: Admin,
  messages: InboundMessage[],
  deps: { mailbox: string; origin: string; actingUser: string; now: Date },
): Promise<InboxReport> {
  const report: InboxReport = { read: messages.length, matched: 0, unmatched: 0, autoReplies: 0, bounces: 0, replies: [] }
  for (const m of messages) {
    if (m.fromAddress === deps.mailbox.toLowerCase()) continue
    const kind = classifyInbound(m)
    if (kind.kind === 'auto_reply') {
      report.autoReplies++
      continue
    }
    const ids = ourIdsIn(m)
    const touch = ids.length
      ? (await db.from('outreach_touches').select('id, contact_id').in('internet_message_id', ids).order('sent_at', { ascending: false }).limit(1)).data?.[0]
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
    const clear = kind.confidence >= CLEAR && kind.outcome !== 'unclear' && kind.outcome !== 'referred'
    const logged = await db
      .from('outreach_replies')
      .insert({
        contact_id: contactId,
        touch_id: touch?.id ?? null,
        received_at: m.receivedAt,
        wording: (m.text.trim() || m.subject || '(empty)').slice(0, 5000),
        outcome: kind.outcome,
        classified_by: 'rules',
        confidence: kind.confidence,
        needs_lawal: !clear || kind.outcome === 'take_down',
        source_message_id: m.internetMessageId || null,
        logged_by: deps.actingUser,
      })
      .select('id')
      .single()
    if (logged.error) {
      // A second read of the same message is refused by the unique message id: already handled, nothing more to do.
      if (/outreach_replies_one_per_message/.test(logged.error.message)) continue
      throw new Error(`logging a reply: ${logged.error.message}`)
    }

    let action = 'waits for Lawal'
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
        scheduledFor: deps.now,
        origin: deps.origin,
        draftedBy: deps.actingUser,
      })
      action = drafted.state === 'done' ? `${kind.answerKey} ${drafted.value.state}${drafted.value.heldBecause.length ? `: ${drafted.value.heldBecause.join('; ')}` : ''}` : `${kind.answerKey} refused: ${drafted.reason}`
    } else if (clear && kind.outcome === 'no') {
      action = 'the organiser is stopped; nothing sent'
    }
    await db.from('outreach_replies').update({ action_taken: action }).eq('id', logged.data.id)
    report.replies.push({ id: logged.data.id, outcome: kind.outcome, confidence: kind.confidence, action })
  }
  return report
}
