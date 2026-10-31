import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A DIALOG THE VISITOR OPENED STANDS ABOVE THE CONSENT QUESTION. On live at 390, 1 November 2026, the Remind me sheet
 * opened under the consent strip with its email box and button hidden until the banner was answered
 * (C:\dev\EVIDENCE\JOURNEYS-1NOV\remind-03h46\before-390.png). The strip is not drawn while an open modal dialog is
 * on the page; a closed dialog that stays mounted is aria-hidden and does not count.
 *
 * The rule must also stay OUT of the two patterns scripts/guards/the-consent-banner-is-in-the-first-paint.mjs reads,
 * or that guard's drills (which delete the default-hidden rule and the reveal rule to prove the gate fires) would be
 * satisfied by this rule instead and stop firing.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\r\n/g, '\n')
const RULE = "body:has([aria-modal='true']:not([aria-hidden='true'])) #el-consent-shell[id] { display: none; }"

describe('the consent strip stands aside for an open dialog', () => {
  test('one rule hides it while an open, not aria-hidden, modal dialog is on the page', () => {
    expect(css).toContain(RULE)
  })

  test("the guard's drills still fire: without the two guarded rules, its patterns find nothing", () => {
    const without = css
      .replace('#el-consent-shell { display: none; }', '')
      .replace("html[data-consent='ask'] #el-consent-shell { display: block; }", '')
    expect(/#el-consent-shell\s*\{[^}]*display:\s*none/.test(without)).toBe(false)
    expect(/html\[data-consent=["']ask["']\][^{]*#el-consent-shell/.test(without)).toBe(false)
  })

  test('the drawer and the menu, mounted while closed, carry aria-hidden so they never hide the strip', () => {
    const strip = readFileSync(join(process.cwd(), 'src/components/features/events/events-filter-strip.tsx'), 'utf8')
    const menu = readFileSync(join(process.cwd(), 'src/components/layout/site-header-client.tsx'), 'utf8')
    expect(strip).toMatch(/aria-hidden=\{!drawerOpen\}/)
    expect(menu).toMatch(/aria-hidden=\{isOpen \? undefined : true\}/)
  })
})
