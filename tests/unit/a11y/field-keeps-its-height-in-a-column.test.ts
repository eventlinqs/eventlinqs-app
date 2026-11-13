import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * A FIELD OR BUTTON KEEPS ITS HEIGHT IN A COLUMN (13 November 2026; law 4, the whole class). Seen on www at 320 and 390:
 * the weekly guide's email field was about 20 px tall beside a 44 px Subscribe button, under the 44 px tap target. It
 * carried 'flex-1' inside a form that is a column on phones ('flex flex-col ... sm:flex-row'); in a column, flex-1's zero
 * basis overrides its height. The rule: an element with a fixed or minimum height whose nearest flex parent is a column
 * grows only from the width where the parent becomes a row ('sm:flex-1'), never with a bare 'flex-1'.
 */
const HEIGHT = /(^|\s)(h-(9|10|11|12|13|14)|min-h-(11|12))(\s|$)/
const BARE_FLEX_1 = /(^|\s)flex-1(\s|$)/
const CLASS = /className=[{"`]+([^"`]*)/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : d.name.endsWith('.tsx') ? [join(dir, d.name)] : [],
  )
}

function collapsing(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const found: string[] = []
  lines.forEach((line, i) => {
    const cls = CLASS.exec(line)?.[1]
    if (!cls || !HEIGHT.test(cls) || !BARE_FLEX_1.test(cls)) return
    for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
      const parent = CLASS.exec(lines[j])?.[1]
      if (parent && /(^|\s)(flex|inline-flex)(\s|$)/.test(parent)) {
        if (/(^|\s)flex-col(-reverse)?(\s|$)/.test(parent)) found.push(`${file.split(/[\\/]/).join('/')}:${i + 1}`)
        return
      }
    }
  })
  return found
}

describe('a field or button keeps its height in a column', () => {
  it('no element with a fixed height carries a bare flex-1 inside a column', () => {
    expect(sources('src').flatMap(collapsing)).toEqual([])
  })

  it('the weekly guide sign-up field grows only in the row layout', () => {
    const src = readFileSync('src/components/features/city/city-newsletter-capture.tsx', 'utf8')
    expect(src).toMatch(/h-11 rounded-full border px-4 text-sm sm:flex-1/)
  })

  it('the check finds the shape it guards against', () => {
    const lines = ['<form className="flex flex-col gap-2 sm:flex-row">', '<input className="h-11 flex-1 px-4" />']
    const cls = CLASS.exec(lines[1])![1]
    const parent = CLASS.exec(lines[0])![1]
    expect(HEIGHT.test(cls) && BARE_FLEX_1.test(cls) && /(^|\s)flex-col(\s|$)/.test(parent)).toBe(true)
  })
})
