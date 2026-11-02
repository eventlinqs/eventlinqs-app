// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { FOOT_BAR_VAR } from '@/components/layout/foot-bar-clearance'
import { VenueMobileStickyBar } from '@/components/features/venues/venue-mobile-sticky-bar'
import { OrganiserMobileStickyBar } from '@/components/features/organisers/organiser-mobile-sticky-bar'
import { MobileStickyBar } from '@/components/features/city/mobile-sticky-bar'

/*
 * ROUND 2, ITEM 8 (Lawal, 2 November 2026, 12:05: 'Confirm the bottom navigation never covers content'), AND ITS CLASS.
 * The mobile nav is 64px and every page reserves 64px for it (MainContentFrame, the footer's -mb-16 pb-16). A page that
 * adds its own 60px bar ABOVE the nav (bottom-16) covered the footer's last row at the foot of the page: the footer keeps
 * only 24px of air above the reserved strip. Each such bar now tells the footer its height while it is mounted, and this
 * file fails if a new bar above the nav is written without doing so.
 */
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []
  })
const root = () => document.documentElement.style.getPropertyValue(FOOT_BAR_VAR)

afterEach(cleanup)

describe('a bar above the mobile nav never covers the foot of the page', () => {
  it.each([
    ['the venue bar', () => <VenueMobileStickyBar venueName="Costa Hall" />],
    ['the organiser bar', () => <OrganiserMobileStickyBar organiserName="Geelong Arts Centre" />],
    ['the city bar', () => <MobileStickyBar cityName="Geelong" weekendCount={3} />],
  ])('%s reserves its 60px at the foot while mounted, and gives it back when gone', (_name, el) => {
    const { unmount } = render(el())
    expect(root()).toBe('60px')
    unmount()
    expect(root()).toBe('')
  })

  it('the footer adds the reserved height under its last row on a phone, and nothing at md and up', () => {
    const footer = read('src/components/layout/site-footer.tsx')
    expect(footer).toMatch(/className="-mb-16 [^"]*pb-\[calc\(4rem\+var\(--el-foot-bar,0px\)\)\][^"]*md:pb-0/)
  })

  it('every bar fixed above the nav (bottom-16, full width) uses the clearance hook: the class cannot return', () => {
    const bars = walk(join(process.cwd(), 'src')).filter((f) => /fixed inset-x-0 bottom-16/.test(read(f.slice(process.cwd().length + 1))))
    expect(bars.length).toBeGreaterThanOrEqual(3)
    for (const f of bars) expect(read(f.slice(process.cwd().length + 1)), f).toMatch(/useFootBarClearance\(60\)/)
  })
})
