import { describe, expect, test } from 'vitest'
import { DM_SIGN_OFF, LAWAL_SIGNATURE, composeBody, emailClosing, fillTemplate, ruleFailures, type Draft } from '@/lib/outreach/rules'

/**
 * THE MESSAGES FILE's RULES (C:\dev\START-16OCT\EVENTLINQS-ORGANISER-MESSAGES-28OCT.md), pinned against the file's own
 * texts: messages 1, 2, 3 and 4 as written must pass once their fields are filled, and each rule must fail on its own
 * breach. The texts are copied here as test data only; the product reads them from outreach_templates.
 */

const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?c=tok'

const MESSAGE_1 = [
  'Hi [first name],',
  "I hope you're all well. [true line]",
  "We'd love to help fill the room. Your [nights] are already on EventLinqs' [city] guide, and we'd like to feature them in our weekly picks on Instagram and Facebook, with every link going straight to your own page.",
  "Here's your listing: [claim link]. Claim it in two minutes and it's yours to update, with your own posters and photos. It's free, and you keep your own booking setup.",
  'Would that work for you?',
].join('\n')

const MESSAGE_3 = [
  'Hi [first name],',
  "If it's easier, just reply with your poster or a couple of photos from a [night] and I'll set the whole listing up for you. Nothing else needed.",
].join('\n')

const MESSAGE_4 = [
  'Hi [first name],',
  "I'll leave it here so I'm not filling your inbox. Your [nights] stay on our [city] guide either way, and if you ever want them featured, or anything changed, just reply to this email.",
  'All the best with the [gigs].',
].join('\n')

const MESSAGE_2_DM = "Hi [first name], [short true line]. Your [nights] are already on our [city] guide, and we'd like to feature them in this week's picks, linking to your page. OK if I send you the link to your listing?"

const FIELDS = {
  'first name': 'Sam',
  'true line': 'A live act in the brewpub every Saturday with free entry, right through to December, is exactly the kind of night that gets Ballarat out of the house.',
  'short true line': 'Saturday live acts in the brewpub, free entry',
  nights: 'Saturday live nights',
  night: 'Saturday live night',
  city: 'Ballarat',
  'claim link': 'https://www.eventlinqs.com.au/claim/abc',
  gigs: 'Saturday gigs',
}

function email(content: string, step: number | null, subject = "The Brewpub's Saturday live nights, could I ask you something?"): Draft {
  return { channel: 'email', purpose: 'cadence', step, subject, content: fillTemplate(content, FIELDS), closing: emailClosing('Kind regards,', UNSUB) }
}

describe("the file's own texts pass once filled", () => {
  test('message 1, the first invitation', () => {
    expect(ruleFailures(email(MESSAGE_1, 1))).toEqual([])
  })
  test('message 3, day 4, with no question', () => {
    expect(ruleFailures(email(MESSAGE_3, 2, 'Re: your Saturday live nights'))).toEqual([])
  })
  test('message 4, day 10, with no question', () => {
    expect(ruleFailures(email(MESSAGE_4, 3, 'Re: your Saturday live nights'))).toEqual([])
  })
  test('message 2, the first DM', () => {
    const draft: Draft = { channel: 'dm', purpose: 'cadence', step: 1, subject: null, content: fillTemplate(MESSAGE_2_DM, FIELDS), closing: DM_SIGN_OFF }
    expect(ruleFailures(draft)).toEqual([])
  })
})

describe('each rule fails on its own breach', () => {
  test('a field with no verified fact holds the draft and names it', () => {
    const draft = email(MESSAGE_1, 1)
    draft.content = fillTemplate(MESSAGE_1, { ...FIELDS, 'true line': null })
    expect(ruleFailures(draft)).toEqual(['a field could not be filled from verified facts: [true line]'])
  })
  test('no greeting', () => {
    const draft = email(MESSAGE_1, 1)
    draft.content = draft.content.replace('Hi Sam,', 'Hello Sam,')
    expect(ruleFailures(draft)).toContain('opens "Hi [first name]," or "Hi [venue] team,"')
  })
  test('we outnumbering you', () => {
    const draft = email('Hi Sam,\nWe built our guide and we think our picks are what we do best. Would that work?', 1)
    expect(ruleFailures(draft)).toContain('you and your outnumber we and our: found 0 to 5')
  })
  test('two questions on a first message', () => {
    const draft = email(MESSAGE_1.replace('Would that work for you?', 'Would that work for you? Is Friday better?'), 1)
    expect(ruleFailures(draft)).toContain('exactly one question: found 2')
  })
  test('no question on a first message', () => {
    expect(ruleFailures(email(MESSAGE_1.replace('Would that work for you?', 'Thanks for your time.'), 1))).toContain('exactly one question: found 0')
  })
  test('a promise of sales', () => {
    expect(ruleFailures(email(MESSAGE_1.replace('Would that work for you?', 'It will boost your sales. Would that work for you?'), 1))).toContain(
      'no ROI claims and no promises of sales or reach',
    )
  })
  test("I'm Lawal from, and we're new", () => {
    const failures = ruleFailures(email(MESSAGE_1.replace("I hope you're all well.", "I'm Lawal from EventLinqs and we're new."), 1))
    expect(failures).toContain('never "I\'m Lawal from"')
    expect(failures).toContain('never "we\'re new"')
  })
  test('rules for the recipient', () => {
    expect(ruleFailures(email(MESSAGE_1.replace('Would that work for you?', 'You must claim it this week. Would that work for you?'), 1))).toContain(
      'never rules for the recipient',
    )
  })
  test('too long', () => {
    const long = MESSAGE_1.replace('Would that work for you?', `${'Your night is great. '.repeat(15)}Would that work for you?`)
    expect(ruleFailures(email(long, 1)).some((f) => f.startsWith('an email is under 125 words'))).toBe(true)
  })
  test('no signature or unsubscribe line', () => {
    const draft = email(MESSAGE_1, 1)
    draft.closing = 'Kind regards, Lawal'
    expect(ruleFailures(draft)).toEqual(["Lawal's full signature on every email", 'an unsubscribe line on every email'])
  })
  test('a DM without the sign-off', () => {
    const draft: Draft = { channel: 'dm', purpose: 'cadence', step: 2, subject: null, content: "Hi Sam, happy to set it all up for you if that's easier, just say the word.", closing: '' }
    expect(ruleFailures(draft)).toEqual([`DMs end "${DM_SIGN_OFF}"`])
  })
  test('an em dash and an exclamation mark', () => {
    const failures = ruleFailures(email(MESSAGE_1.replace("It's free,", "It's free \u2014 really!"), 1))
    expect(failures).toContain('no em or en dashes')
    expect(failures).toContain('no exclamation marks')
  })
})

describe('the body as stored', () => {
  test('content, a blank line, then the closing with the signature and the unsubscribe line', () => {
    const body = composeBody({ content: 'Hi Sam,\nThanks.', closing: emailClosing('Kind regards,', UNSUB) })
    expect(body.startsWith('Hi Sam,\nThanks.\n\nKind regards,\n')).toBe(true)
    expect(body).toContain(LAWAL_SIGNATURE)
    expect(body.endsWith(UNSUB)).toBe(true)
  })
})
