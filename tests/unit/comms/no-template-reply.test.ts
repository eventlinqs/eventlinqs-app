import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { greetingNameFor, proposalFor } from '@/lib/comms/decisions'
import { personNameFrom } from '@/lib/outreach/replies'

/*
 * HE MUST NEVER SEE THAT PAGE STATE AGAIN (Lawal, 25 November 2026, 07:08: "the engine should never fucking make this
 * error ... Don't ever make me go to my admin page and see that message, ever."; the PM's 07:09 item 2: "no item may ever
 * show an empty or template reply ('Thank you for your reply.', a greeting with no body) or a greeting to a team when the
 * sender gave a first name; the build fails if one can"). At 06:58 Stage 29 Studios' item showed the blank template and
 * greeted "Stage 29 Studios team", though Jennifer Turner had signed her own mail.
 */

const SIGNATURE = ['Kind regards,', 'Lawal Adams', 'Founder, EventLinqs']

describe('a held reply shows the drafted answer or nothing, never a blank template', () => {
  test('no draft, an empty draft, or a greeting with only a thank you for the reply: nothing is proposed', () => {
    expect(proposalFor(null)).toBeNull()
    expect(proposalFor('   ')).toBeNull()
    expect(proposalFor(['Hi Jennifer,', '', ...SIGNATURE].join('\n'))).toBeNull()
    for (const thanks of ['Thank you for your reply.', 'Thanks for your email', 'Thank you so much for your message.']) {
      expect(proposalFor(['Hi Jennifer,', '', thanks, '', '', ...SIGNATURE].join('\n'))).toBeNull()
    }
  })
  test('a drafted answer with words of its own is shown whole', () => {
    const drafted = ['Hi Jennifer,', 'Nothing. Listing and featuring are free.', '', ...SIGNATURE].join('\r\n')
    expect(proposalFor(drafted)).toBe(drafted.replace(/\r\n/g, '\n'))
  })
  test('no source file can write the blank template again', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(name) && /['"`]Thank you for your reply\.?['"`]/.test(readFileSync(path, 'utf8'))) found.push(path)
      }
    }
    walk('src')
    expect(found).toEqual([])
  })
})

describe('a sender who gave their own name is greeted by it, never as a team', () => {
  test("Jennifer Turner, writing from Stage 29 Studios' info address, is Jennifer", () => {
    const name = personNameFrom('Jennifer Turner', 'Stage 29 Studios')
    expect(name).toBe('Jennifer Turner')
    expect(greetingNameFor(name, 'Stage 29 Studios')).toBe('Jennifer')
  })
  test.each([
    ['Stage 29 Studios', 'Stage 29 Studios'],
    ['Info', 'Stage 29 Studios'],
    ['FI Inc.', 'Festival Indonesia'],
    ['Bookings Team', 'The JazzLab'],
    ['Festival Indonesia', 'Festival Indonesia'],
    ['info@stage29studios.com.au', 'Stage 29 Studios'],
    ['Jazzlab Events', 'The JazzLab'],
  ])('%s, for %s, is no person: the greeting is left to the record', (display, organiser) => {
    expect(personNameFrom(display, organiser)).toBeNull()
  })
})
