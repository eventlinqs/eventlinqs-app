import { describe, expect, test } from 'vitest'
import { classifyInbound, DECISION_CLASSES } from '@/lib/outreach/replies'

/*
 * THE DECISION CLASSES (law 30, the CRM directive's section 4). Aria's reply of 19 November 2026 is the fixed case: it
 * attached three photographs, gave permission to share them, and asked for a venue correction, and it was read as
 * 'referred' at 0.6 because her signature names a place. Her words, quoted exactly from the message
 * (C:\dev\EVIDENCE\EL-19NOV\asia-oasis\email-19nov-0919.txt).
 */
const ARIA = [
  'Hi Lawal,',
  '',
  "I tried uploading our festival photos through your website, but unfortunately I wasn't able to. I've attached three",
  "images from our first weekend and would be grateful if you could upload one to each day's listing on our behalf.",
  "We're also happy for EventLinqs to share these images on your social media to help promote the festival.",
  'Just one small correction, if possible. Could you please update the venue across all three listings to Alexandra',
  'Gardens, Melbourne, rather than "Asia Oasis, 3 Boathouse Drive"?',
  '',
  'Kind regards,',
  'Aria',
  'The Asia Oasis Team',
  'Alexandra Gardens, 13-22 NOV 2026',
].join('\n')

const read = (text: string, hasAttachments: boolean) =>
  classifyInbound({ subject: 'Re: Helping more people find Colours of Asia: Garden of Wonders on 21 November', fromAddress: 'info@asiaoasis.com.au', text, headers: {}, hasAttachments })

describe("Aria's reply, the fixed case", () => {
  test('with its three photographs attached it is photographs, never referred', () => {
    expect(read(ARIA, true)).toEqual({ kind: 'reply', outcome: 'photographs', confidence: 0.95, answerKey: null })
  })
  test('the same words with no attachment are the correction she asked for', () => {
    expect(read(ARIA, false)).toMatchObject({ kind: 'reply', outcome: 'correction' })
  })
  test('each class waits for Lawal', () => {
    expect([...DECISION_CLASSES].sort()).toEqual(['correction', 'permission', 'photographs'])
  })
})

describe('each class alone', () => {
  test('a permission given', () => {
    expect(read('Hi Lawal,\n\nYou can use the photos on our page for the listing.\n\nThanks, Jo', false)).toMatchObject({ outcome: 'permission' })
  })
  test('a correction to the date', () => {
    expect(read('Hi Lawal,\n\nThe date is wrong, it should be Saturday the 22nd.\n\nJo', false)).toMatchObject({ outcome: 'correction' })
  })
  test('photographs need both the attachment and the words: an attachment alone, a signature logo, is not photographs', () => {
    expect(read('Hi Lawal,\n\nYes please, list it.\n\nJo', true)).toMatchObject({ outcome: 'yes' })
  })
  test('a stop still wins over everything', () => {
    expect(read("Hi,\n\nPlease stop emailing us. I've attached our photos anyway.", true)).toMatchObject({ outcome: 'stop' })
  })
})
