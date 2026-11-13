/*
 * THE HERO FIRST (the speed causes of 13 November 2026, cause 1; C:\dev\START-16OCT\EL-SPEED-CAUSES-13NOV.md). On production
 * that day the home page preloaded two images: its hero, the largest paint, and the first Big nights card's photo, which
 * on a phone sits below the fold and took the hero's bandwidth. The card asks for priority now only when the page above the
 * guide shows no hero photo, when it may itself be the largest paint.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const GUIDE = read('src/components/features/city-guide/city-guide.tsx')
const SCREEN = read('src/components/features/city-guide/city-guide-screen.tsx')

describe('the hero is the one image asked for first', () => {
  test('the first card of a rail that opens the guide follows the same rule, at every rail', () => {
    expect(GUIDE.match(/priorityFirst=\{leadPriority\(at\)\}/g)?.length).toBe(3)
    expect(GUIDE).not.toMatch(/priorityFirst=\{at === 0\}/)
  })
  test('the first Big nights card asks for priority only when the page shows no hero photo', () => {
    expect(GUIDE).toContain('const leadPriority = (at: number) => !heroPhoto && at === 0')
    expect(GUIDE).toContain('<BigCard e={e} priority={leadPriority(at) && i === 0} />')
    expect(GUIDE).toContain('heroPhoto = false,')
  })
  test('the guide screen says whether its hero shows a photo', () => {
    expect(SCREEN).toContain('heroPhoto={!!photo}')
    expect(SCREEN).toMatch(/const photo = /)
  })
})
