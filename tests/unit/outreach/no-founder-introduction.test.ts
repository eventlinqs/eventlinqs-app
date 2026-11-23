import { describe, expect, it } from 'vitest'
import { LIFECYCLE_ACQ, lifecycleFields, type LifecycleFacts } from '@/lib/outreach/lifecycle-letters'
import { renderTemplate } from '@/lib/outreach/rules'
import { readVoicePolicy, voiceProblems, wordsProblems, type VoiceMessage } from '@/lib/outreach/voice-gate'

/*
 * THE FOUNDER SENTENCE IN ALL ITS FORMS, IN THE GATE AND AT SEND (Lawal, 11:31 of 18 November 2026: "The founder sentence
 * ('I'm Lawal Adams, and I'm building EventLinqs ... builds a community around every event it lists') is removed from
 * EVERY template, in every category: it is founder focused and an unproved claim", C:\dev\EVIDENCE\EL-18NOV\acq\
 * ACQ-TEMPLATE-V2-PM-1145.md; the PM's 23:16 of 23 November 2026, item 2: "the founder sentence stays OUT").
 *
 * THE CASE. The gate refused two wordings only (standard.json founder_sentence: "builds a community around every event"
 * and "I'm building EventLinqs"), so law 49's free promotion letter in the code, which opened "I'm Lawal, founder of
 * EventLinqs, the what's on guide for [city].", passed it, in the gate and at send. Every first-person introduction of the
 * founder is refused now (standard.json founder_introduction, read by gateway.py and carried into the generated policy),
 * in the message's own words before its closing, so the signature block and a DM's sign-off still pass; and the letter's
 * version 2 opens on the night, straight to the purpose.
 */
const POLICY = readVoicePolicy()
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-4000-8000-000000000006`
const SIG = ['Lawal Adams', 'Founder, EventLinqs', 'eventlinqs.com.au', 'ABN 30 837 447 587', 'Geelong, VIC, Australia']
const LETTER = [
  'Hi Hop Temple team,',
  "We'll help people in Ballarat discover Hop Temple Country Night on Friday 4 December, prepare its listing at no cost to you, and direct interested visitors to your existing booking page.",
  'Would you like us to list Hop Temple Country Night? Just reply yes, and we will send you the listing to check before it goes live.',
  'Kind regards,\n' + SIG.join('\n'),
  `If you'd rather I didn't write again, just reply and say so, or unsubscribe here: ${UNSUB}`,
].join('\n\n')
const MSG: VoiceMessage = {
  channel: 'email', category: 'first_contact', from: 'lawal@eventlinqs.com', to: ['info@hoptemple.com.au'], subject: "Hop Temple Country Night on Friday 4 December: let's fill it",
  greetingName: 'Hop Temple team', body: LETTER, subtype: 'ACQ-FIRST', eventDate: '2026-12-04', landsOn: '2026-11-24',
  consent: { basis: 'conspicuous_publication', publishedOnUrl: 'https://hoptemple.com.au/', noMarketingStatementChecked: true },
}
const founder = (r: string[]) => r.filter((x) => x.startsWith('the founder sentence is out of every message (Lawal, 11:31)'))
const withSecondLine = (line: string) => LETTER.replace('team,\n\n', `team,\n\n${line}\n\n`)

const TOTS: LifecycleFacts = {
  organiserName: 'Geelong Gallery',
  personName: null,
  websiteUrl: 'https://www.geelonggallery.org.au',
  night: { title: 'Gallery Tots', slug: 'gallery-tots-geelong-gallery-2026-12-11', startDate: '2026-12-10T23:00:00Z', timezone: 'Australia/Melbourne', citySlug: 'geelong', bookingUrl: 'https://events.humanitix.com/gallery-tots-december' },
  photoLink: null,
  approvalLink: null,
  origin: ORIGIN,
}

describe('(1) the founder sentence in all its forms is refused, in the gate and at send', () => {
  it('the policy carries the first-person introductions from standard.json, or it is refused', () => {
    expect(POLICY.standard.founderIntroduction?.length ?? 0).toBeGreaterThan(0)
    expect(() => readVoicePolicy({ ...POLICY, standard: { ...POLICY.standard, founderIntroduction: undefined } })).toThrow(/POLICY_UNAVAILABLE/)
  })

  it("law 49's opening of the code before this change, \"I'm Lawal, founder of EventLinqs\", and every other form are refused", () => {
    for (const line of [
      "I'm Lawal, founder of EventLinqs, the what's on guide for Ballarat. Hop Temple Country Night is already listed with us.",
      "I'm Lawal Adams, and I'm building EventLinqs.",
      'My name is Lawal, and I run EventLinqs.',
      "I'm the founder of EventLinqs.",
      'Lawal here, from EventLinqs.',
      'This is Lawal from EventLinqs.',
      'I\u2019m Lawal, founder of EventLinqs.',
    ]) {
      const body = withSecondLine(line)
      expect(founder(voiceProblems({ ...MSG, body }, POLICY)).length, line).toBeGreaterThan(0)
      expect(founder(wordsProblems(body, POLICY)).length, line).toBeGreaterThan(0)
    }
  })

  it('the signature block, a reply signature and a DM sign-off are not introductions and pass', () => {
    expect(voiceProblems(MSG, POLICY)).toEqual([])
    expect(founder(wordsProblems(LETTER, POLICY))).toEqual([])
    const dm: VoiceMessage = { ...MSG, channel: 'instagram', to: [], subject: null, body: `${LETTER.split('\n\nKind regards,')[0]}\n\nLawal, EventLinqs (reply stop and I won't message again)` }
    expect(founder(voiceProblems(dm, POLICY))).toEqual([])
    const reply: VoiceMessage = { channel: 'email', category: 'reply', from: 'lawal@eventlinqs.com', to: ['sam@example.org'], subject: 'Re: Your festival', greetingName: 'Sam', threadRef: 'conv-1', body: "Hi Sam,\n\nHere's your page on EventLinqs: https://www.eventlinqs.com.au/events/x\n\nKind regards,\n\nLawal Adams\nFounder, EventLinqs" }
    expect(voiceProblems(reply, POLICY)).toEqual([])
  })
})

describe('(2) lifecycle_acq version 2: no founder sentence, no pleasantry, straight to the purpose', () => {
  it('opens on the night, already listed on EventLinqs, the what\'s on guide for its city, with its link', () => {
    const paragraphs = LIFECYCLE_ACQ.body.split('\n\n')
    expect(paragraphs[0]).toBe('Hi [greeting],')
    expect(paragraphs[1]).toBe("[event] on [event day] is already listed on EventLinqs, the what's on guide for [city]: [event link]")
    expect(LIFECYCLE_ACQ.body).not.toMatch(/I'm Lawal|founder|I hope/i)
  })

  it('a letter drafted from it passes the gate whole, and nothing at send refuses it', () => {
    const r = renderTemplate(LIFECYCLE_ACQ, lifecycleFields(TOTS), UNSUB)
    expect(r.heldBecause).toEqual([])
    expect(r.body.startsWith("Hi Geelong Gallery team,\n\nGallery Tots on Friday 11 December is already listed on EventLinqs, the what's on guide for Geelong: https://www.eventlinqs.com.au/events/gallery-tots-geelong-gallery-2026-12-11")).toBe(true)
    const msg: VoiceMessage = { ...MSG, to: ['info@geelonggallery.org.au'], greetingName: 'Geelong Gallery team', subject: r.subject, body: r.body, eventDate: '2026-12-11', landsOn: '2026-11-24', consent: { basis: 'conspicuous_publication', publishedOnUrl: 'https://www.geelonggallery.org.au/contact', noMarketingStatementChecked: true } }
    expect(voiceProblems(msg, POLICY)).toEqual([])
    expect(wordsProblems(r.body, POLICY)).toEqual([])
  })
})
