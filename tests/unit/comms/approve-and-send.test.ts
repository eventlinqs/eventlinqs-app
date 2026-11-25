import { describe, expect, it } from 'vitest'
import { replyHash, replyProblems, replySubject, replyText } from '@/lib/comms/approve-and-send'
import { greetingNameFor } from '@/lib/comms/decisions'
import { readVoicePolicy } from '@/lib/outreach/voice-gate'

/*
 * APPROVE AND SEND (law 30, the CRM directive's section 5): a reply held for Lawal is answered from /admin/comms, his
 * words checked by the gateway's own rules in the platform, his approval recorded by the hash of exactly those words,
 * and the reply sent in the organiser's thread. These are the rules the press runs before anything goes.
 */
const policy = readVoicePolicy()
const base = { from: 'hello@eventlinqs.com', to: 'info@asiaoasis.com.au', subject: 'Re: Helping more people find Colours of Asia: Garden of Wonders on 21 November', greetingName: 'Aria', threadRef: '<abc@asiaoasis.com.au>' }

describe('the reply the platform proposes', () => {
  it('greets the person on their record, else their organisation team', () => {
    expect(greetingNameFor('Aria Chen', 'Asia Oasis')).toBe('Aria')
    expect(greetingNameFor(null, 'Asia Oasis')).toBe('Asia Oasis team')
    expect(greetingNameFor('  ', null)).toBe('')
  })
  it('passes the gateway with an answer written into it', () => {
    const text = answer('Aria', 'Your three days are listed now, each with its own date and time.')
    expect(replyProblems({ ...base, text: replyText(text) }, policy)).toEqual([])
  })
})

/** A reply as a person writes one: the greeting, one answer, his closing and reply signature. */
function answer(name: string, line: string): string {
  return [`Hi ${name},`, '', line, '', 'Kind regards,', ...policy.replySignature].join('\n')
}

describe('the gateway refuses, and nothing goes', () => {
  it('a greeting that names someone else', () => {
    const text = replyText(answer('Maria', 'Your three days are listed now.'))
    expect(replyProblems({ ...base, text }, policy).join(' ')).toMatch(/greeting names "Maria" but the verified recipient is "Aria"/)
  })
  it('a dash, or a reply that lost its thread subject', () => {
    const dashed = replyText(answer('Aria', 'Your three days are listed now \u2013 truly.'))
    expect(replyProblems({ ...base, text: dashed }, policy).length).toBeGreaterThan(0)
    const text = replyText(answer('Aria', 'Your three days are listed now.'))
    expect(replyProblems({ ...base, subject: 'Your three days', text }, policy).join(' ')).toMatch(/keep the thread subject/)
  })
  it('a signature that is not his reply signature', () => {
    const text = replyText(['Hi Aria,', '', 'Thank you for your reply.', '', 'Kind regards,', 'The team'].join('\n'))
    expect(replyProblems({ ...base, text }, policy).join(' ')).toMatch(/signature must be/)
  })
})

describe('the words approved are the words sent', () => {
  it('the subject is the thread subject, prefixed once', () => {
    expect(replySubject('Helping more people find Colours of Asia')).toBe('Re: Helping more people find Colours of Asia')
    expect(replySubject('RE: re: Fwd: Helping')).toBe('Re: Helping')
    expect(replySubject('  ')).toBe('')
  })
  it('the text is normalised before it is hashed, so the hash names what Graph is given', () => {
    expect(replyText('Hi Aria,  \r\n\r\n\r\n\r\nThanks\r\n')).toBe('Hi Aria,\n\nThanks')
    expect(replyHash('Hi Aria,\n\nThanks')).toMatch(/^[0-9a-f]{64}$/)
    expect(replyHash('Hi Aria,\n\nThanks')).not.toBe(replyHash('Hi Aria,\n\nThanks.'))
  })
})
