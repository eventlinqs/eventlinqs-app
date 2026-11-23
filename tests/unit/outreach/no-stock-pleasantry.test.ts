import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIFECYCLE_PERM } from '@/lib/outreach/lifecycle-letters'
import { renderTemplate } from '@/lib/outreach/rules'
import { SOURCE_ASK_EMAIL } from '@/lib/outreach/source-asks'
import { TWENTY_LETTERS } from '@/lib/outreach/twenty-letters'
import { readVoicePolicy, voiceProblems, wordsProblems, type VoiceMessage } from '@/lib/outreach/voice-gate'

/*
 * NO STOCK PLEASANTRY, IN THE GATE AND AT SEND (Lawal's communication standard, 20:45 of 22 November 2026, adopting
 * C:\dev\START-16OCT\COMMS-STANDARD-REVIEW-22NOV.md: "follow this A to Z", "change everything, even the greetings"; the
 * PM's 20:47, item 1: no stock pleasantry anywhere, "Hi <name>," then straight into the purpose).
 *
 * THE CASE. At 22:5x on 23 November 2026 the coordinator found law 49's free promotion play still drafting lifecycle_acq
 * version 1, which opens "I hope you're well." (and counts down "[days] days to [event]"): the templates in the code had
 * lost the pleasantry, but the version the play was pinned to on production had not, and nothing refused it: neither the
 * voice gate (voice-gate.ts, the gateway's port) nor the send time word check (wordsProblems, which the sender runs on
 * every queued letter) knew the rule. The play was paused by a logged write. The rule now lives once, in the gateway's
 * standard (C:\dev\comms-gateway\standard.json stock_pleasantries), read by gateway.py and carried into the app's
 * generated policy, never a second list.
 */
const POLICY = readVoicePolicy()
const SIG = ['Lawal Adams', 'Founder, EventLinqs', 'eventlinqs.com.au', 'ABN 30 837 447 587', 'Geelong, VIC, Australia']
const OPT = "If you'd rather I didn't write again, just reply and say so, or unsubscribe here: https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000005"
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000005'
const LETTER = [
  'Hi Hop Temple team,',
  "We'll help people in Ballarat discover Hop Temple Country Night on Friday 4 December, prepare its listing at no cost to you, and direct interested visitors to your existing booking page.",
  'Would you like us to list Hop Temple Country Night? Just reply yes, and we will send you the listing to check before it goes live.',
  'Kind regards,\n' + SIG.join('\n'),
  OPT,
].join('\n\n')
const MSG: VoiceMessage = {
  channel: 'email', category: 'first_contact', from: 'lawal@eventlinqs.com', to: ['info@hoptemple.com.au'], subject: "Hop Temple Country Night on Friday 4 December: let's fill it",
  greetingName: 'Hop Temple team', body: LETTER, subtype: 'ACQ-FIRST', eventDate: '2026-12-04', landsOn: '2026-11-24',
  consent: { basis: 'conspicuous_publication', publishedOnUrl: 'https://hoptemple.com.au/', noMarketingStatementChecked: true },
}
const withSecondLine = (body: string, line: string) => body.replace('team,\n\n', `team,\n\n${line}\n\n`)
const pleasantry = (r: string[]) => r.filter((x) => x.startsWith('stock pleasantry'))

// lifecycle_acq version 1, as written to production on 21 November 2026 (C:\dev\EVIDENCE\EL-21NOV\train-at\law49-plays-APPLY.sql).
const LIFECYCLE_ACQ_V1 = {
  channel: 'email' as const, purpose: 'cadence' as const, step: 1, subject: "[days] days to [event]: let's fill it",
  body: [
    'Hi [greeting],',
    "I hope you're well.",
    "I'm Lawal, founder of EventLinqs, the what's on guide for [city]. [event] is already listed with us: [event link]",
    'Over its last two weeks we put it in front of people looking for something to do in [city], on the [city] guide.',
    "If you'd like more from it, you can claim the listing for free, keep the details up to date yourself and sell tickets directly, with every attendee's details yours to keep.",
    'Would you like me to set that up for you?',
    'Kind regards,\n[signature]\n\n[unsubscribe]',
  ].join('\n\n'),
}

describe('the gate refuses a stock pleasantry, from the gateway\'s own standard', () => {
  it('the policy carries the standard\'s stock pleasantries, generated from standard.json with the rest', () => {
    expect(POLICY.standard.stockPleasantries?.length ?? 0).toBeGreaterThan(0)
    expect(() => readVoicePolicy({ ...POLICY, standard: { ...POLICY.standard, stockPleasantries: undefined } })).toThrow(/POLICY_UNAVAILABLE/)
  })

  it('(a) a letter whose second line is "I hope you\'re well." is refused, quoting the rule, in the gate and at send', () => {
    expect(voiceProblems(MSG, POLICY)).toEqual([])
    for (const line of ["I hope you're well.", "I hope you're all well.", 'Hope all is well.', 'I hope this email finds you well.', 'I trust you are well.', 'I hope the shows are going well.']) {
      const body = withSecondLine(LETTER, line)
      const gate = pleasantry(voiceProblems({ ...MSG, body }, POLICY))
      expect(gate, line).toHaveLength(1)
      expect(gate[0], line).toMatch(/^stock pleasantry ".+": straight to the purpose, no stock pleasantry \(the communication standard, Lawal 20:45 of 22 November 2026\)$/)
      expect(pleasantry(wordsProblems(body, POLICY)), line).toEqual(gate)
    }
  })

  it('(a) every category and every channel: a reply and a direct message with it are refused too', () => {
    const reply: VoiceMessage = { channel: 'email', category: 'reply', from: 'lawal@eventlinqs.com', to: ['sam@example.org'], subject: 'Re: Your festival', greetingName: 'Sam', threadRef: 'conv-1', body: "Hi Sam,\n\nI hope you're well.\n\nHere's your page on EventLinqs: https://www.eventlinqs.com.au/events/x\n\nKind regards,\n\nLawal Adams\nFounder, EventLinqs" }
    expect(pleasantry(voiceProblems(reply, POLICY))).toHaveLength(1)
    expect(pleasantry(voiceProblems({ ...MSG, channel: 'instagram', to: [], subject: null, body: withSecondLine(LETTER, "I hope you're well.") }, POLICY))).toHaveLength(1)
    // A thank you and a genuine wish for their night are not stock pleasantries.
    expect(voiceProblems({ ...reply, body: reply.body.replace("I hope you're well.", 'Thank you for writing back.') }, POLICY)).toEqual([])
    expect(pleasantry(voiceProblems({ ...reply, body: reply.body.replace("I hope you're well.", 'I hope Mountaingrass in Bright next month is a wonderful weekend.') }, POLICY))).toEqual([])
  })

  it('(b) the current templates pass: acq_first v2, source_ask v1, lifecycle_perm v2 and the twenty letters', () => {
    const standing = (JSON.parse(readFileSync('src/lib/outreach/standing-approvals.generated.json', 'utf8')) as { templates: { key: string; version: number; body: string }[] }).templates
    const acqFirstV2 = standing.find((t) => t.key === 'acq_first' && t.version === 2)
    const sourceAskV1 = standing.find((t) => t.key === 'source_ask' && t.version === 1)
    expect(acqFirstV2).toBeDefined()
    expect(sourceAskV1?.body).toBe(SOURCE_ASK_EMAIL.body)
    const bodies: [string, string][] = [
      ['acq_first v2', acqFirstV2?.body ?? ''],
      ['source_ask v1', SOURCE_ASK_EMAIL.body],
      ['lifecycle_perm v2', LIFECYCLE_PERM.body],
      ...TWENTY_LETTERS.map((t) => [`${t.key}`, t.body] as [string, string]),
    ]
    for (const [name, body] of bodies) expect(pleasantry(wordsProblems(body, POLICY)), name).toEqual([])
  })

  it('(c) lifecycle_acq version 1 is refused, as its template and as a letter drafted from it', () => {
    expect(pleasantry(wordsProblems(LIFECYCLE_ACQ_V1.body, POLICY))).toEqual([expect.stringContaining("\"I hope you're well\"")])
    const fields = { greeting: 'Geelong Gallery team', city: 'Geelong', event: 'Gallery Tots', 'event link': 'https://www.eventlinqs.com.au/events/gallery-tots', days: '17' }
    const drafted = renderTemplate(LIFECYCLE_ACQ_V1, fields, UNSUB)
    expect(pleasantry(wordsProblems(drafted.body, POLICY))).toHaveLength(1)
    const msg: VoiceMessage = { ...MSG, greetingName: 'Geelong Gallery team', to: ['info@geelonggallery.org.au'], subject: drafted.subject, body: drafted.body, eventDate: '2026-12-10', landsOn: '2026-11-24' }
    expect(pleasantry(voiceProblems(msg, POLICY))).toHaveLength(1)
  })
})
