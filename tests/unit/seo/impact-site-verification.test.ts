/**
 * IMPACT'S SITE OWNERSHIP CHECK (the CONTROLLER's 23:50 of 3 November 2026, Lawal's Ticketmaster affiliate application
 * on Impact): the root layout's <head>, so every public page of www.eventlinqs.com.au, carries EXACTLY
 *   <meta name="impact-site-verification" value="4c53e093-10be-4e4a-9e29-f256cbd89af8" />
 * with `value` (Impact's own attribute), never Next's metadata `other`, which would write `content`. A public value, not
 * a secret. acceptance-live reads it on live after the car.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { IMPACT_SITE_VERIFICATION } from '@/lib/seo/impact-site-verification'

describe("Impact's site verification tag", () => {
  it('renders exactly the tag Impact asked for, with its value attribute', () => {
    const html = renderToStaticMarkup(createElement('meta', IMPACT_SITE_VERIFICATION))
    expect(html).toBe('<meta name="impact-site-verification" value="4c53e093-10be-4e4a-9e29-f256cbd89af8"/>')
  })

  it("sits in the root layout's head, so every page carries it", () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/<head>\s*<meta \{\.\.\.IMPACT_SITE_VERIFICATION\} \/>/)
  })
})
