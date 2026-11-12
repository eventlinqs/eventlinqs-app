import { describe, expect, it } from 'vitest'
import { renderTemplate, ruleFailures } from '@/lib/outreach/rules'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'
import { touchVoiceMessage } from '@/lib/outreach/touch-voice'
import { FOUNDING_INITIAL_MONTHS_WORD } from '@/lib/payments/founding-waiver'
import { dayWords, letterFields, letterFor, OFFER_WORDS, TWENTY_ADVICE, TWENTY_OFFER } from '@/lib/outreach/twenty-letters'
import { writtenBefore } from '@/lib/outreach/written-before'

/*
 * TOMORROW'S TWENTY IN LAWAL'S OCTOBER FORMAT, WITHOUT THE API (the PM's 11:58 of 12 November 2026): filled from verified
 * rows only, and every letter passes the CRM's rules (rules.ts) AND the communication gateway (voice-gate.ts) exactly as
 * it will be stored, so Copy and Sent are never refused for the words.
 */
const UNSUBSCRIBE = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=0123456789abcdef'
const night = { title: 'Kyivska Perepichka', startDate: '2026-12-05T08:00:00Z', timezone: 'Australia/Melbourne', venueName: 'The Wheeler Centre', isFree: false }

function judged(letter: typeof TWENTY_ADVICE, personName: string | null, organiserName = 'Ukrainian Sounds') {
  const rendered = renderTemplate(letter, letterFields({ organiserName, personName, night }), UNSUBSCRIBE)
  const voice = voiceProblems(
    touchVoiceMessage({
      channel: 'email',
      purpose: 'cadence',
      step: 1,
      address: 'bookings@ukrainiansounds.example.com.au',
      subject: rendered.subject,
      body: rendered.body,
      personName,
      organiserName,
      firstTouchId: null,
    } as Parameters<typeof touchVoiceMessage>[0]),
    readVoicePolicy(),
  )
  return { rendered, voice }
}

describe('the two letters', () => {
  for (const letter of [TWENTY_ADVICE, TWENTY_OFFER]) {
    it(`${letter.key}: every rule and the gateway pass, to a named person and to a team`, () => {
      for (const person of ['Iryna Koval', null]) {
        const { rendered, voice } = judged(letter, person)
        expect(rendered.heldBecause, rendered.body).toEqual([])
        expect(ruleFailures(rendered)).toEqual([])
        expect(voice, rendered.body).toEqual([])
      }
    })
  }
  it('stays under the word limit with a long title, a long place and a long organisation name', () => {
    const long = { ...night, title: 'African Music and Community Festival 2026 Grand Opening Weekend', venueName: 'Federation Square Main Stage and Atrium' }
    for (const letter of [TWENTY_ADVICE, TWENTY_OFFER]) {
      const r = renderTemplate(letter, letterFields({ organiserName: 'The Victorian Folk Music Club Incorporated', personName: null, night: long }), UNSUBSCRIBE)
      expect(r.heldBecause, `${letter.key}: ${r.content}`).toEqual([])
    }
  })

  it('greets the first name, or the organisation team, and names their own night, day and place', () => {
    expect(judged(TWENTY_ADVICE, 'Iryna Koval').rendered.content.split('\n')[0]).toBe('Hi Iryna,')
    const team = judged(TWENTY_ADVICE, null).rendered
    expect(team.content.split('\n')[0]).toBe('Hi Ukrainian Sounds team,')
    expect(team.subject).toBe('Kyivska Perepichka, could I ask your advice?')
    expect(team.content).toContain('Kyivska Perepichka on Saturday 5 December at The Wheeler Centre is already listed on EventLinqs.')
  })
  it('a missing fact leaves the draft held with the field named, never a stand in', () => {
    const r = renderTemplate(TWENTY_ADVICE, letterFields({ organiserName: 'X', personName: null, night: { ...night, venueName: null } }), UNSUBSCRIBE)
    expect(r.heldBecause.join(' ')).toContain('[event place]')
  })
  it("the offer's months come from the one offer module", () => {
    expect(OFFER_WORDS).toContain(`${FOUNDING_INITIAL_MONTHS_WORD} months`)
    expect(TWENTY_OFFER.body).toContain('[offer]')
    expect(TWENTY_OFFER.body).not.toMatch(/\b(six|6) months\b/)
  })
  it('a conversion ask carries the offer only for a night sold by ticket', () => {
    expect(letterFor('conversion', night).key).toBe('twenty_offer')
    expect(letterFor('conversion', { ...night, isFree: true }).key).toBe('twenty_advice')
    expect(letterFor('conversion', { ...night, isFree: null }).key).toBe('twenty_advice')
    expect(letterFor('first_contact', night).key).toBe('twenty_advice')
  })
  it('names the day in the night\'s own time zone', () => {
    expect(dayWords('2026-11-20T00:00:00Z', 'Australia/Melbourne')).toBe('Friday 20 November')
    expect(dayWords('2026-11-20T00:00:00Z', null)).toBe('Friday 20 November')
  })
})

describe('organisers already written to', () => {
  it("an organisation's own domain on the list is caught at any of its addresses; a free mail domain never is", () => {
    expect(writtenBefore('bookings@amcf.org.au')).toBe(true)
    expect(writtenBefore('  Someone@AMCF.org.au ')).toBe(true)
    expect(writtenBefore('somebody-new@gmail.com')).toBe(false)
    expect(writtenBefore('info@a-venue-never-written-to.com.au')).toBe(false)
  })
})
