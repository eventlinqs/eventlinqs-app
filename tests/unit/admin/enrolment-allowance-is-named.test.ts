import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AUTH-03 (30 October 2026): the enrolment allowance, getAdminSession({ forEnrolment: true }), may be asked
 * for in exactly four named places, and every admin page asks for the strict session itself.
 *
 * The (authed) layout admits an un-enrolled admin only so the enrolment page beneath it can render. That is
 * safe only while every page under it checks the strict session on its own, so this holds both halves.
 */

const AUTHED = 'src/app/admin/(authed)'
const ALLOWED = new Set([
  'src/app/admin/(authed)/layout.tsx',
  'src/app/admin/(authed)/enrol-2fa/page.tsx',
  'src/app/admin/actions.ts',
])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name).replace(/\\/g, '/')
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('AUTH-03: the enrolment allowance is named, and every admin page checks the strict session', () => {
  it('only the layout, the enrolment page and the two enrolment actions ask for forEnrolment', () => {
    const askers = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'src/lib/admin/auth.ts' && readFileSync(f, 'utf8').includes('forEnrolment'))
    expect(askers.sort()).toEqual([...ALLOWED].sort())
    const actions = readFileSync('src/app/admin/actions.ts', 'utf8')
    expect(actions.match(/forEnrolment: true/g)?.length).toBe(2)
    for (const fn of ['prepareTotpEnrolmentAction', 'confirmTotpEnrolmentAction']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`))
      const next = body.indexOf('export async function', 10)
      expect(body.slice(0, next > 0 ? next : undefined)).toContain('forEnrolment: true')
    }
  })

  it('every page under (authed) except enrolment checks the strict session itself', () => {
    const pages = walk(AUTHED).filter((f) => f.endsWith('/page.tsx') && !f.includes('/enrol-2fa/'))
    expect(pages.length).toBeGreaterThan(40)
    const unchecked = pages.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return !/(getAdminSession|requireAdminSession|requireAdminCapability)\(/.test(src) || src.includes('forEnrolment')
    })
    expect(unchecked).toEqual([])
  })
})
