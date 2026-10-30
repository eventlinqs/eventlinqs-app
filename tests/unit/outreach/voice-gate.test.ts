import { describe, expect, it } from 'vitest'
import {
  approvalProblems,
  readVoicePolicy,
  voiceContentHash,
  voiceProblems,
  type VoiceMessage,
  type VoicePolicy,
} from '@/lib/outreach/voice-gate'

/*
 * THE PRODUCTION SEND PATH ENFORCES THE SAME CHECKS AS THE COMMUNICATION GATEWAY (the CONTROLLER's 08:40 of 31 October
 * 2026; Lawal's zero-bypass directive of 08:25). C:\dev\comms-gateway\gateway.py validate, ported, with the channel the
 * gateway does not know: an Instagram or Facebook message has no recipient address and no subject to judge. Lawal's
 * ten failure tests are mirrored here, numbered as test_gateway.py numbers them.
 */
const POLICY: VoicePolicy = readVoicePolicy()

const SIG = ['Lawal Adams', 'Founder, EventLinqs', 'eventlinqs.com.au', 'ABN 30 837 447 587', 'Geelong, VIC, Australia']
const OPT = "If you'd rather I didn't write again, just reply and say so, or unsubscribe here: https://www.eventlinqs.com.au/unsubscribe/outreach"
const FIRST = [
  'Hi Kaze team,',
  "I hope you're all well. Something fun in Ballarat every night of the week since 1989 is quite a mission.",
  "I'm Lawal Adams, and I'm building EventLinqs, a new Australian ticketing platform that builds a community around every event it lists. Your 24 upcoming karaoke nights are already on our Ballarat guide: https://www.eventlinqs.com.au/go/v/f768f410-67e2-44d0-a29d-ac06da1ebc6f",
  "Could I ask your advice: which three photos of your karaoke nights would you most like people to see? Just reply with them attached and I'll put them up myself.",
  'Kind regards,\n' + SIG.join('\n'),
  OPT,
].join('\n\n')
const DM: VoiceMessage = { channel: 'instagram', category: 'first_contact', to: [], subject: null, greetingName: 'Kaze team', body: FIRST }
const EMAIL: VoiceMessage = { ...DM, channel: 'email', to: ['info@kaze.example'], subject: 'Your karaoke nights, could I ask your advice?' }
const REPLY: VoiceMessage = {
  channel: 'email',
  category: 'reply',
  to: ['someone@example.org'],
  subject: 'Re: Your festival, could I ask your advice?',
  greetingName: 'Sam',
  threadRef: 'conv-1',
  body: "Hi Sam,\n\nI hope you're well, and that the festival preparations are going smoothly.\n\nHere's your page on EventLinqs: https://www.eventlinqs.com.au/events/x\n\nKind regards,\n\nLawal Adams\nFounder, EventLinqs\neventlinqs.com.au",
}
const has = (r: string[], s: string) => r.some((x) => x.includes(s))

describe('the policy', () => {
  it('is generated from the two policy files, with their version', () => {
    expect(POLICY.version).toMatch(/^[0-9a-f]{16}$/)
    expect(POLICY.firstSignature).toEqual(SIG)
    expect(POLICY.replySignature).toEqual(['Lawal Adams', 'Founder, EventLinqs'])
    expect(POLICY.noExit.length).toBeGreaterThan(2)
  })
  it('04: a policy that cannot be read is refused, never assumed', () => {
    expect(() => readVoicePolicy({})).toThrow(/POLICY_UNAVAILABLE/)
  })
})

describe('validate, as the gateway', () => {
  it('10: a correct message passes, as an email, a direct message and a reply', () => {
    expect(voiceProblems(EMAIL, POLICY)).toEqual([])
    expect(voiceProblems(DM, POLICY)).toEqual([])
    expect(voiceProblems(REPLY, POLICY)).toEqual([])
  })
  it('a direct message is judged as one: no address and no subject are asked of it; an email still needs both', () => {
    expect(voiceProblems({ ...EMAIL, to: [] }, POLICY)).toContain('no recipient')
    expect(has(voiceProblems({ ...EMAIL, subject: null }, POLICY), 'subject')).toBe(true)
  })
  it('01: no greeting is blocked', () => {
    expect(has(voiceProblems({ ...REPLY, body: REPLY.body.replace('Hi Sam,\n\n', '') }, POLICY), 'greeting')).toBe(true)
  })
  it('01b: no warm second line is blocked', () => {
    expect(has(voiceProblems({ ...REPLY, body: REPLY.body.replace("I hope you're well, and that the festival preparations are going smoothly.", "I'm sorry this took longer.") }, POLICY), 'warmly')).toBe(true)
  })
  it('02: no sign off is blocked', () => {
    expect(has(voiceProblems({ ...REPLY, body: REPLY.body.replace('Kind regards,', 'Cheers,') }, POLICY), 'Kind regards')).toBe(true)
  })
  it('03: a wrong signature is blocked, and a first message without the opt out footer', () => {
    expect(has(voiceProblems({ ...REPLY, body: REPLY.body.replace('Founder, EventLinqs', 'CEO') }, POLICY), 'signature')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: DM.body.replace(OPT, '') }, POLICY), 'opt out')).toBe(true)
  })
  it('12: a greeting naming anyone but the verified recipient is blocked', () => {
    expect(has(voiceProblems({ ...REPLY, greetingName: 'Fred' }, POLICY), 'verified recipient')).toBe(true)
  })
  it('11: a permission already given is never asked again', () => {
    const r = voiceProblems({ ...REPLY, to: ['chair@amcf.org.au'], body: REPLY.body.replace("Here's your page", "Are you happy for us to use the photos? Here's your page") }, POLICY)
    expect(has(r, 'already given')).toBe(true)
  })
  it('never invites a no, never a dash, never a placeholder', () => {
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('Could I ask', 'No pressure at all. Could I ask') }, POLICY), 'invites a no')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('quite a mission', 'quite a mission \u2014 truly') }, POLICY), 'dash')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('Ballarat guide', '{city} guide') }, POLICY), 'placeholder')).toBe(true)
  })
})

describe('approval of the exact content, under this policy', () => {
  const ok = { contentHash: voiceContentHash(DM), policyVersion: POLICY.version, byFounder: true }
  it('10: Lawal approving this exact message under this policy clears it', () => {
    expect(approvalProblems(ok, DM, POLICY)).toEqual([])
  })
  it('09: no approval is no send', () => {
    expect(has(approvalProblems(null, DM, POLICY), 'no approval')).toBe(true)
  })
  it('06: changed after approval is blocked', () => {
    expect(has(approvalProblems(ok, { ...DM, body: DM.body.replace('three photos', 'four photos') }, POLICY), 'changed after approval')).toBe(true)
  })
  it('05: an approval under an older policy is approved again', () => {
    expect(has(approvalProblems({ ...ok, policyVersion: 'old' }, DM, POLICY), 'policy changed')).toBe(true)
  })
  it('07: anyone but Lawal approving is not an approval (a delegated agent cannot bypass)', () => {
    expect(has(approvalProblems({ ...ok, byFounder: false }, DM, POLICY), 'only Lawal')).toBe(true)
  })
  it('08: a scheduled message is judged again before it goes, and fails if its words now fail', () => {
    const broken = { ...DM, body: DM.body.replace('Kind regards,', 'Best,') }
    expect(approvalProblems({ ...ok, contentHash: voiceContentHash(broken) }, broken, POLICY).length).toBeGreaterThan(0)
  })
})
