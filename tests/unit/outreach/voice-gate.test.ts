import { describe, expect, it } from 'vitest'
import {
  SOURCE_ASK_SUBTYPE,
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
// Written to the communication standard (Lawal, 20:45 of 22 November 2026): "Hi <name>," then straight into the purpose.
const FIRST = [
  "Hi Her Majesty's Theatre Ballarat team,",
  'Your events are already listed on EventLinqs at no cost to you, each with a button straight to your own booking page. So far 6 people have opened their pages on EventLinqs.',
  "We'd love to help more people find Ian Moss and Troy Cassar-Daley: Together Alone Tour on Saturday 28 November: https://www.eventlinqs.com.au/events/ian-moss-and-troy-cassar-daley-together-alone-tour-her-majesty-s-theatre-ballarat-2026-11-28",
  "Send me one image of your next show you're happy for us to use, and I'll add it for you. Your tickets stay exactly where they are.",
  'Could you reply with one image, or add it here? https://www.eventlinqs.com.au/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000',
  'Kind regards,\n' + SIG.join('\n'),
  OPT,
].join('\n\n')
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://hermaj.com/contact', noMarketingStatementChecked: true } as const
const DM: VoiceMessage = { channel: 'instagram', category: 'first_contact', from: "instagram: Lawal's own account", to: [], subject: null, greetingName: "Her Majesty's Theatre Ballarat team", body: FIRST, consent: CONSENT, eventDate: '2026-11-28', landsOn: '2026-11-19' }
const EMAIL: VoiceMessage = { ...DM, channel: 'email', to: ['hermaj@hermaj.com'], subject: 'Helping more people find Ian Moss and Troy Cassar-Daley: Together Alone Tour on 28 November' }
const REPLY: VoiceMessage = {
  channel: 'email',
  category: 'reply',
  from: 'lawal@eventlinqs.com',
  to: ['someone@example.org'],
  subject: 'Re: Your festival, could I ask your advice?',
  greetingName: 'Sam',
  threadRef: 'conv-1',
  body: "Hi Sam,\n\nHere's your page on EventLinqs: https://www.eventlinqs.com.au/events/x\n\nKind regards,\n\nLawal Adams\nFounder, EventLinqs\neventlinqs.com.au",
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
  // The communication standard (Lawal, 20:45 of 22 November 2026; the PM's 20:47, item 1): no stock pleasantry is asked.
  it('01b: no warm second line is needed: straight into the purpose passes, and a thank you too', () => {
    expect(voiceProblems(REPLY, POLICY)).toEqual([])
    expect(voiceProblems({ ...REPLY, body: REPLY.body.replace("Here's your page", "Thank you for writing back. Here's your page") }, POLICY)).toEqual([])
    expect(voiceProblems(EMAIL, POLICY)).toEqual([])
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
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('Could you reply', 'No pressure at all. Could you reply') }, POLICY), 'invites a no')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('at no cost to you,', 'at no cost to you \u2014 truly,') }, POLICY), 'dash')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('6 people', '{count} people') }, POLICY), 'placeholder')).toBe(true)
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
    expect(has(approvalProblems(ok, { ...DM, body: DM.body.replace('one image of', 'an image of') }, POLICY), 'changed after approval')).toBe(true)
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

describe("the gateway's rules of 31 October noon (compounds, the sending mailbox, the thread)", () => {
  it('a compound modifier before a noun takes its hyphen; a compound word always does (law 6)', () => {
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('Send me one image', 'It has a day by day program. Send me one image') }, POLICY), 'compound modifier needs its hyphen')).toBe(true)
    expect(voiceProblems({ ...DM, body: DM.body.replace('Send me one image', 'It has a day-by-day program. Send me one image') }, POLICY)).toEqual([])
    expect(has(voiceProblems({ ...DM, body: DM.body.replace('Send me one image', 'Ask your sister in law. Send me one image') }, POLICY), 'compound word needs its hyphen')).toBe(true)
  })
  it('names the mailbox it goes from, and a known thread goes from its own mailbox only', () => {
    expect(has(voiceProblems({ ...DM, from: null }, POLICY), 'no sending mailbox')).toBe(true)
    expect(has(voiceProblems({ ...REPLY, to: ['chair@amcf.org.au'], from: 'hello@eventlinqs.com' }, POLICY), 'wrong mailbox')).toBe(true)
  })
  it('the policy carries the compounds and the threads, or it is refused', () => {
    expect(POLICY.compounds.mustHyphenateBeforeNoun).toContain('day by day')
    expect(POLICY.threads.some((t) => t.recipient === 'chair@amcf.org.au')).toBe(true)
    expect(() => readVoicePolicy({ ...POLICY, compounds: undefined })).toThrow(/POLICY_UNAVAILABLE/)
  })
})

describe('the mailbox Lawal sends from is data, never a literal in the code (one-contact-domain)', () => {
  it('the policy carries the mailbox the voice file was read from, and touch-voice reads it from there', async () => {
    expect(POLICY.founderMailbox).toMatch(/^lawal@[a-z0-9.-]+\.[a-z]{2,}$/)
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/outreach/touch-voice.ts', 'utf8')
    expect(src).not.toMatch(/[a-z]+@eventlinqs\.com/)
    expect(src).toMatch(/founderMailbox/)
  })
})

describe("the standard's machine checks (EL-COMMS-STANDARD-LOCKED-17NOV.md Part 2 rule 7; the PM's 02:00 of 18 November 2026)", () => {
  it('the policy carries the standard, generated with the two voice files into one version, or it is refused', () => {
    expect(POLICY.standard.offerSubjects.length).toBeGreaterThan(0)
    expect(POLICY.standard.minDaysAhead).toBe(3)
    expect(() => readVoicePolicy({ ...POLICY, standard: undefined })).toThrow(/POLICY_UNAVAILABLE/)
  })
  it('a segment A first letter passes whole, as an email and as a direct message', () => {
    expect(voiceProblems(EMAIL, POLICY)).toEqual([])
    expect(voiceProblems(DM, POLICY)).toEqual([])
  })
  it('the advice subject is refused for an offer led one', () => {
    expect(has(voiceProblems({ ...EMAIL, subject: 'Your next show, could I ask your advice?' }, POLICY), 'offer led subject')).toBe(true)
  })
  it('calls to action and questions are not counted (no numerical writing rule: Lawal, 20:45 of 22 November 2026)', () => {
    expect(voiceProblems({ ...EMAIL, body: FIRST.replace('Could you reply', 'If you could change one thing about selling tickets, what would it be? Could you reply') }, POLICY)).toEqual([])
  })
  it('no internal word reaches a customer', () => {
    expect(has(voiceProblems({ ...EMAIL, body: FIRST.replace('So far 6 people', "We read your site's robots.txt and our feed. So far 6 people") }, POLICY), 'internal word')).toBe(true)
  })
  it('no promise of a capability not proved on production', () => {
    expect(has(voiceProblems({ ...EMAIL, body: FIRST.replace('So far 6 people', "We'll feature it in our guides and posts within 24 hours. So far 6 people") }, POLICY), 'unproved claim')).toBe(true)
  })
  it('a letter lands 3 or more days before its night, never on or after it, and says when', () => {
    for (const landsOn of ['2026-11-28', '2026-11-29', '2026-11-26']) expect(has(voiceProblems({ ...EMAIL, landsOn }, POLICY), 'timing')).toBe(true)
    expect(has(voiceProblems({ ...EMAIL, eventDate: undefined }, POLICY), 'timing')).toBe(true)
  })
  it('the consent basis is present: published on their own site, its no refusal statement checked', () => {
    expect(has(voiceProblems({ ...EMAIL, consent: undefined }, POLICY), 'consent')).toBe(true)
    expect(has(voiceProblems({ ...EMAIL, consent: { ...CONSENT, noMarketingStatementChecked: false } }, POLICY), 'consent')).toBe(true)
  })
  it('no warm line and no paragraph rule: the topic may follow the greeting at once (Lawal, 20:45 of 22 November 2026)', () => {
    expect(voiceProblems({ ...EMAIL, body: FIRST.replace("team,\n\nYour events", 'team,\nYour events') }, POLICY)).toEqual([])
  })
  it('a reply or a service message is not held to the outreach checks', () => {
    expect(voiceProblems(REPLY, POLICY)).toEqual([])
  })
})

// THE ACQ-FIRST LETTER (the PM's 11:25 of 18 November 2026, item 1; standard.json's version of 18 November 11:25), as the
// gateway's tests 35 to 39: its own two offer subjects, and its no event form lawful, the timing rule applying only where
// a night is named.
const ACQ_BODY = [
  'Hi Hop Temple team,',
  "I'd love to help more people in Ballarat find Hop Temple Country Night on Friday 4 December.",
  "We can list your events at no cost to you: we build the listing ourselves, put it in our Ballarat guide, and give it a button straight to your own booking page. Your tickets stay exactly where they are.",
  "Would you like me to list Hop Temple Country Night? Just reply yes, and I'll send you the link to look over before it goes live.",
  'Kind regards,\n' + SIG.join('\n'),
  OPT,
].join('\n\n')
const ACQ: VoiceMessage = {
  channel: 'email', category: 'first_contact', from: 'hello@eventlinqs.com', to: ['info@hoptemple.com.au'], subject: 'Hop Temple Country Night: complimentary EventLinqs listing',
  greetingName: 'Hop Temple team', body: ACQ_BODY, consent: { basis: 'conspicuous_publication', publishedOnUrl: 'https://hoptemple.com.au/', noMarketingStatementChecked: true },
  eventDate: '2026-12-04', landsOn: '2026-11-19', subtype: 'ACQ-FIRST',
}
const ACQ_NO_EVENT: VoiceMessage = {
  ...ACQ, subject: 'Complimentary EventLinqs listing for Hop Temple', eventDate: undefined,
  body: ACQ_BODY.replace('find Hop Temple Country Night on Friday 4 December.', 'find your events.').replace('Would you like me to list Hop Temple Country Night?', 'Would you like me to list your next event?'),
}

describe('the ACQ-FIRST letter (standard.json of 18 November 12:40: its subjects by type)', () => {
  it('the policy carries every acquisition type\'s subjects, and the no night ones apart', () => {
    expect(POLICY.standard.acqFirstSubjects).toContain('^.+: complimentary EventLinqs listing$')
    expect(POLICY.standard.acqFirstSubjects).toContain('^Complimentary EventLinqs listing for .+$')
    expect(POLICY.standard.acqFirstNoEventSubjects).toContain('^Complimentary EventLinqs listing for .+$')
    expect(POLICY.standard.acqFirstNoEventSubjects).not.toContain('^.+: complimentary EventLinqs listing$')
  })
  it('35: an ACQ-FIRST letter naming a night passes', () => {
    expect(voiceProblems(ACQ, POLICY)).toEqual([])
  })
  it('36: its no event form passes', () => {
    expect(voiceProblems(ACQ_NO_EVENT, POLICY)).toEqual([])
  })
  it('37: the ACQ subjects are refused outside ACQ-FIRST', () => {
    expect(has(voiceProblems({ ...EMAIL, subject: 'Ian Moss on EventLinqs, at no cost to you' }, POLICY), 'offer led subject')).toBe(true)
    expect(has(voiceProblems({ ...ACQ, subtype: 'PERM-IMAGE' }, POLICY), 'offer led subject')).toBe(true)
  })
  it('38: a letter naming a night keeps its timing', () => {
    expect(has(voiceProblems({ ...ACQ, eventDate: undefined }, POLICY), 'timing')).toBe(true)
    expect(has(voiceProblems({ ...ACQ, landsOn: '2026-12-03' }, POLICY), 'timing')).toBe(true)
  })
  it('39: the no event form is for ACQ-FIRST only', () => {
    expect(has(voiceProblems({ ...ACQ_NO_EVENT, subtype: undefined }, POLICY), 'timing')).toBe(true)
  })
})

describe("the founder sentence is out of every message (Lawal, 18 November 2026, 11:31; gateway.py the same)", () => {
  const SENTENCE = "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists."
  it('the policy carries both of its sentences from standard.json', () => {
    expect(POLICY.standard.founderSentence).toEqual(expect.arrayContaining(['builds a community around every event', "I'm building EventLinqs"]))
  })
  it('a letter carrying it is refused, in every channel, wherever it stands', () => {
    const withIt = { ...EMAIL, body: EMAIL.body.replace("We'd love to help more people find", `${SENTENCE} We'd love to help more people find`) }
    expect(has(voiceProblems(withIt, POLICY), 'founder sentence')).toBe(true)
    expect(has(voiceProblems({ ...DM, body: withIt.body }, POLICY), 'founder sentence')).toBe(true)
    expect(has(voiceProblems({ ...ACQ, body: ACQ.body.replace('We can list your events', `${SENTENCE} We can list your events`) }, POLICY), 'founder sentence')).toBe(true)
  })
  it('the drill: the same letter without it passes', () => {
    expect(has(voiceProblems(EMAIL, POLICY), 'founder sentence')).toBe(false)
    expect(voiceProblems(ACQ, POLICY)).toEqual([])
  })
})

// THE SOURCE ASK (the founder, 12:14 of 23 November 2026: "Apply the already-approved communication workflow to routine
// source requests."; standard.json source_ask), as the gateway's tests 47 to 51: a PERM-SOURCE first letter takes its own
// subject, '<listings> events on EventLinqs', and no other; that subject opens no other letter; it names no night, so
// the timing rule has nothing to judge; every other check of law and fact stays. The first of WINDOW 5C's set of 07:30.
const SOURCE_BODY = [
  'Hi City of Ballarat team,',
  'EventLinqs is an Australian event discovery platform. We list upcoming Ballarat events so more people can find them, and we would like to include the events on Ballarat In The Know.',
  'For each event we would show its title, date, venue and organiser, with a link back to its own page on Ballarat In The Know.',
  'As we could not find terms covering the reuse of these listings, we wanted to ask first. Could you let us know whether the City is happy for us to show the Ballarat In The Know listings this way?',
  'Thanks for your time.',
  'Kind regards,\n' + SIG.join('\n'),
  OPT,
].join('\n\n')
const SOURCE_CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://ballaratintheknow.com.au/list-your-event', noMarketingStatementChecked: true } as const
const SOURCE: VoiceMessage = {
  channel: 'email', category: 'first_contact', from: 'hello@eventlinqs.com', to: ['marketing@ballarat.vic.gov.au'], subject: 'Ballarat In The Know events on EventLinqs',
  greetingName: 'City of Ballarat team', body: SOURCE_BODY, subtype: 'PERM-SOURCE', consent: SOURCE_CONSENT,
}

describe('the source ask (PERM-SOURCE; the founder, 12:14 of 23 November 2026)', () => {
  it('the policy carries its subjects from standard.json, and that it names no night; a broken entry is refused', () => {
    expect(SOURCE_ASK_SUBTYPE).toBe('PERM-SOURCE')
    expect(POLICY.standard.sourceAsk).toEqual({ subjects: ['^.+ events on EventLinqs$'], needsEventDate: false })
    expect(() => readVoicePolicy({ ...POLICY, standard: { ...POLICY.standard, sourceAsk: { subjects: [], needsEventDate: false } } })).toThrow(/POLICY_UNAVAILABLE/)
    expect(() => readVoicePolicy({ ...POLICY, standard: { ...POLICY.standard, sourceAsk: { subjects: ['^.+ events on EventLinqs$'] } } })).toThrow(/POLICY_UNAVAILABLE/)
  })
  it('47: a source ask with its subject passes, naming no night', () => {
    expect(SOURCE.eventDate).toBeUndefined()
    expect(voiceProblems(SOURCE, POLICY)).toEqual([])
    expect(voiceProblems({ ...SOURCE, subject: 'City of Greater Bendigo events on EventLinqs' }, POLICY)).toEqual([])
  })
  it('48: a source ask takes no other subject, an offer subject included', () => {
    for (const subject of ['Promoting Ballarat In The Know on EventLinqs', 'Ballarat In The Know events', 'Ballarat In The Know events on EventLinqs today', 'Complimentary listing in our Ballarat events guide']) {
      expect(has(voiceProblems({ ...SOURCE, subject }, POLICY), 'a source ask (PERM-SOURCE) takes one of its approved subjects'), subject).toBe(true)
    }
  })
  it('49: its subject opens no other letter: an ordinary first letter, a photo request and an ACQ letter are refused it', () => {
    expect(has(voiceProblems({ ...EMAIL, subject: 'Ballarat In The Know events on EventLinqs' }, POLICY), 'offer led subject')).toBe(true)
    expect(has(voiceProblems({ ...EMAIL, subject: 'Ballarat In The Know events on EventLinqs', subtype: 'PERM-IMAGE' }, POLICY), 'offer led subject')).toBe(true)
    expect(has(voiceProblems({ ...ACQ, subject: 'Hop Temple events on EventLinqs' }, POLICY), 'offer led subject')).toBe(true)
    // The same letter under any other subtype is an ordinary first letter: its subject refused, and its timing asked.
    const asImage = voiceProblems({ ...SOURCE, subtype: 'PERM-IMAGE' }, POLICY)
    expect(has(asImage, 'offer led subject')).toBe(true)
    expect(has(asImage, 'timing')).toBe(true)
  })
  it('50: every check of law and fact stays', () => {
    expect(has(voiceProblems({ ...SOURCE, consent: undefined }, POLICY), 'consent')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, consent: { ...SOURCE_CONSENT, noMarketingStatementChecked: false } }, POLICY), 'consent')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace('For each event', 'We would read your feed. For each event') }, POLICY), 'internal word')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace('For each event', "We'll feature it in our guides. For each event") }, POLICY), 'unproved claim')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, greetingName: 'Visit Ballarat team' }, POLICY), 'verified recipient')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace('Founder, EventLinqs', 'CEO') }, POLICY), 'signature')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace(OPT, '') }, POLICY), 'opt out')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace('platform. We list', 'platform \u2014 we list') }, POLICY), 'dash')).toBe(true)
    expect(has(voiceProblems({ ...SOURCE, body: SOURCE_BODY.replace('EventLinqs is an Australian', "I'm building EventLinqs. EventLinqs is an Australian") }, POLICY), 'founder sentence')).toBe(true)
  })
  it('51: without its entry in the policy a source ask is refused, its subject and its timing', () => {
    const { sourceAsk: _absent, ...standard } = POLICY.standard
    void _absent
    const r = voiceProblems(SOURCE, { ...POLICY, standard })
    expect(has(r, 'a source ask (PERM-SOURCE) takes one of its approved subjects')).toBe(true)
    expect(has(r, 'timing')).toBe(true)
  })
})
