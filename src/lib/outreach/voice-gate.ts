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
  return p as VoicePolicy
}

const WARM: Record<VoiceCategory, readonly string[]> = {
  first_contact: ["I hope you're well", "I hope you're all well"],
  follow_up: ["I hope you're well", "I hope you're all well"],
  reply: ["I hope you're well", "I hope you're all well", 'Thank you'],
  service: ["I hope you're well", "I hope you're all well", 'Thank you'],
}
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

/** Every reason the message may not be held as approved, scheduled or sent; empty when it passes. */
export function voiceProblems(msg: VoiceMessage, policy: VoicePolicy): string[] {
  const r: string[] = []
  const cat = msg.category
  if (!(cat in WARM)) return [`unknown category ${String(cat)}`]
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
    if (cat === 'first_contact' && !/could I ask your advice\?$/i.test(subj)) r.push('a first message subject is "<their event>, could I ask your advice?" (voice file)')
  }
  if (isEmail && (cat === 'reply' || cat === 'follow_up') && !msg.threadRef) r.push('a reply must name the thread it answers (thread_ref)')

  const own = ownPart(toText(msg.body ?? ''))
  const L = linesOf(own)
  if (L.length === 0) return [...r, 'empty message']
  const gname = (msg.greetingName ?? '').trim()
  if (!gname) r.push('greeting_name missing: the recipient must be verified before drafting')
  if (!/^Hi [^,]+,$/.test(L[0])) r.push(`first line must be the greeting "Hi <name>," on its own line; found ${JSON.stringify(L[0].slice(0, 60))}`)
  else if (gname && L[0] !== `Hi ${gname},`) r.push(`greeting names ${JSON.stringify(L[0].slice(3, -1))} but the verified recipient is ${JSON.stringify(gname)}`)
  if (L.length > 1 && !WARM[cat].some((w) => L[1].startsWith(w))) r.push(`second line must open warmly (${WARM[cat].join(' / ')}); found ${JSON.stringify(L[1].slice(0, 60))}`)

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
