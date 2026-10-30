import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { SUBMISSION_PRIVACY_LINE } from '@/lib/listings/submission'

/*
 * Window 6's gap list of 30 October 2026, item 1 (mandate M43, specification s17): /submit-event asks for a name, an
 * email and a role and carried no collection notice, only the footer's Privacy link. The notice now sits where the
 * details are asked, says what they are used for, and links the Privacy Policy.
 */

const PAGE = 'src/app/submit-event/page.tsx'

describe('the submit form says what it collects and why, where it asks', () => {
  it('names each detail the form takes and each use the code makes of it', () => {
    for (const word of ['name', 'email', 'role', 'review', 'contact you', 'organiser']) {
      expect(SUBMISSION_PRIVACY_LINE).toContain(word)
    }
    expect(SUBMISSION_PRIVACY_LINE).not.toMatch(/[–—!]/)
  })

  it('prints the notice inside the "You" fieldset, before the name and email fields, with the Privacy Policy link', () => {
    const page = readFileSync(PAGE, 'utf8')
    const you = page.indexOf('>You</legend>')
    const notice = page.indexOf('{SUBMISSION_PRIVACY_LINE}')
    const nameField = page.indexOf('name="name"')
    const emailField = page.indexOf('name="email"')
    expect(you).toBeGreaterThan(-1)
    expect(notice).toBeGreaterThan(you)
    expect(notice).toBeLessThan(nameField)
    expect(notice).toBeLessThan(emailField)
    expect(page.slice(notice, notice + 400)).toContain('href="/legal/privacy"')
    expect(existsSync('src/app/legal/privacy/page.tsx')).toBe(true)
  })
})
