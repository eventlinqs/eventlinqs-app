import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE PAGE READ WITHOUT AN ADMIN VISIT (the PM's 00:25 of 18 November 2026, item 3; Lawal's 00:12, section 11 step 7:
 * "Verify the actual Instagram and Facebook destinations"). The Blotato key lives only in Vercel, so the read runs on
 * production: the health battery the sentinel runs reads the Facebook Page and the Instagram account through the one
 * reader /admin/social uses (readBlotatoTargets), and its line goes to production's own logs. Read only.
 */
describe('the health battery reads where the week posts', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/health/checks.ts'), 'utf8')

  it('runAllChecks runs the social destinations check', () => {
    const body = src.slice(src.indexOf('export async function runAllChecks('))
    expect(body).toMatch(/timed\('social_destinations', \(\) => checkSocialDestinations\(\)\)/)
  })

  it('the check reads through the one Blotato reader, never a second', () => {
    const body = src.slice(src.indexOf('async function checkSocialDestinations('), src.indexOf('export async function runAllChecks('))
    expect(body).toMatch(/readBlotatoTargets\(process\.env\)/)
    expect(body).not.toMatch(/backend\.blotato\.com/)
  })
})
