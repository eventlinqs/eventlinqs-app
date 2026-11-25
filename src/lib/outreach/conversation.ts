/**
 * ONE CHANNEL PER CONVERSATION (Lawal, 25 November 2026, 14:41: "We'll never change the communication channel. We'll
 * keep it the same", and 14:43: "A different email address addressing an email I sent to another address is just
 * confusing ... The customer should not see that"; the PM's 14:42 and 14:43). The rules, pure:
 *
 *   1. A message to someone we are already in conversation with goes from the mailbox of the newest message between us
 *      whose mailbox is known: the one they last wrote to, or the one we last wrote from. Never another, for any
 *      category, sequence or sender rule. Stage 29 Studios: our last message came from hello@, so hello@ it stays.
 *   2. It sits in that thread: In-Reply-To names the newest message, References every one before it.
 *   3. The only change is theirs: their own words asking us to write to another address ("email me at ... instead"),
 *      which is recorded on the contact and kept for every message after; a request to be phoned or texted is held for
 *      the PM (no call or text is placed by machine).
 */

export type ConversationMessage = {
  readonly id: string
  /** When it was received (theirs) or sent (ours), as an ISO time. */
  readonly at: string
  /** The mailbox of ours it arrived in or left from; null when no record says. */
  readonly mailbox: string | null
}

export function conversationOf(
  messages: readonly ConversationMessage[],
  ours: readonly string[],
): { readonly ids: readonly string[]; readonly mailbox: string | null } {
  const mine = new Set(ours.map((m) => m.toLowerCase()))
  const sorted = [...messages].filter((m) => m.id).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
  const ids = [...new Set(sorted.map((m) => m.id))]
  const known = [...sorted].reverse().find((m) => m.mailbox !== null && mine.has(m.mailbox.toLowerCase()))
  return { ids, mailbox: known ? (known.mailbox as string).toLowerCase() : null }
}

const ADDRESS = /[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/gi
/** Their words asking for another address: "instead", "please email/use/contact", "best address", "from now on". */
const ASKS_FOR_ADDRESS =
  /\b(instead|(please )?(e-?mail|write to|contact|reach|use|try|cc) (me|us|him|her|them|my|our|this)|(best|better|preferred|new|right|correct) (e-?mail|address|contact)|going forward|from now on|(send|direct) (it|this|them|everything|future (emails?|messages?)) to)\b/i

/**
 * The address their own words ask us to write to instead, read from their message alone (the quoted letter stripped),
 * never guessed: exactly one address of theirs in a sentence that asks for it, and not the address they wrote from or
 * one of ours. Null when there is none, or more than one to choose from.
 */
export function statedAddressIn(ownWords: string, input: { readonly from: string; readonly ours: readonly string[] }): string | null {
  const skip = new Set([input.from.toLowerCase(), ...input.ours.map((o) => o.toLowerCase())])
  const found = new Set<string>()
  for (const sentence of ownWords.split(/(?<=[.!?])\s+|\n+/)) {
    if (!ASKS_FOR_ADDRESS.test(sentence)) continue
    for (const a of sentence.match(ADDRESS) ?? []) {
      const address = a.replace(/[.'-]+$/, '').toLowerCase()
      if (!skip.has(address)) found.add(address)
    }
  }
  return found.size === 1 ? [...found][0] : null
}

/** Their words asking to be phoned or texted: held for the PM, who escalates to Lawal the same hour. */
const ASKS_FOR_A_CALL =
  /\b((call|ring|phone|text|sms) (me|us)|give (me|us) a (call|ring|bell)|(call|ring|text) (on|at) [+(0-9]|my (mobile|cell|phone|number) is|(happy|easier|best|prefer) to (chat|talk|speak) (on|over|by) (the )?phone|(a|quick) phone call|(have|jump on|book|schedule|arrange) a (quick )?call)\b/i

export function asksToBePhoned(ownWords: string): boolean {
  return ASKS_FOR_A_CALL.test(ownWords)
}

export const PHONE_HELD =
  'a request to be phoned or texted: held for the PM, who escalates it to Lawal the same hour; no call or text is placed by machine'
