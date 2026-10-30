import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE HOME HERO'S HEADLINE AND BUTTON ARE IN THE FIRST PAINT ON A PHONE (Lawal's mobile rule of 12:38 on 30 October 2026;
 * the project manager's 12:40, seen at 390 x 844 on production: "the first paint shows only the 'EVENTLINQS' eyebrow over
 * the photo; the headline and the button appear about 3 to 4 seconds later").
 *
 * The hero text is server-rendered in the first bytes of the page. What hid it was the entrance stagger: under
 * html[data-motion="1"] every child of .hero-enter ran 'fade-rise' with fill 'both', so each line STARTED at opacity 0
 * and stayed there until the browser started the animation, which on a phone still running the page's JavaScript can
 * be seconds. The stagger may move the text; it may never make it invisible.
 */
const css = readFileSync('src/app/globals.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function keyframes(name: string): string {
  const at = css.search(new RegExp(`@keyframes\\s+${name}\\s*\\{`))
  if (at < 0) throw new Error(`no @keyframes ${name} in globals.css`)
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  throw new Error(`@keyframes ${name} is not closed`)
}

describe('the hero entrance never hides its text', () => {
  it('the .hero-enter stagger runs an animation that never sets opacity below 1', () => {
    const rule = /html\[data-motion="1"\]\s*\.hero-enter\s*>\s*\*\s*\{([^}]*)\}/.exec(css)
    expect(rule, 'the .hero-enter stagger rule').not.toBeNull()
    const name = /animation:\s*([a-z0-9-]+)/i.exec(rule![1])?.[1]
    expect(name, 'the stagger names its animation').toBeTruthy()
    const frames = keyframes(name!)
    const opacities = [...frames.matchAll(/opacity:\s*([0-9.]+)/g)].map((m) => Number(m[1]))
    expect(opacities.filter((o) => o < 1), `@keyframes ${name} sets opacity below 1`).toEqual([])
  })

  it('no rule starts .hero-enter children, or the active hero slide, at opacity 0', () => {
    expect(css).not.toMatch(/\.hero-enter\s*>\s*\*[^{]*\{[^}]*opacity:\s*0[;\s}]/)
    expect(css).toMatch(/html\[data-motion="1"\]\s*\.hero-slide-content\.is-active\s*\{[^}]*opacity:\s*1/)
  })
})
