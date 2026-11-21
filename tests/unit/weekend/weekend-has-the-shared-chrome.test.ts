import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * /WEEKEND CARRIES THE SHARED HEADER AND FOOTER (the PM's 15:03 of 21 November 2026). Read on www at 14:56: /weekend held
 * no <header> and no <footer> while /events held one of each, so at 1440 a visitor had no way off the page; a sweep of 21
 * public routes found no other page without both. The page prerenders, so its header is the static safe one.
 */
describe('/weekend renders the shared chrome', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/weekend/page.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  it('the one header, static safe, and the one footer', () => {
    expect(src).toContain("import { SiteHeader } from '@/components/layout/site-header'")
    expect(src).toContain("import { SiteFooter } from '@/components/layout/site-footer'")
    expect(src).toContain('<SiteHeader staticSafe />')
    expect(src).toContain('<SiteFooter />')
  })
})
