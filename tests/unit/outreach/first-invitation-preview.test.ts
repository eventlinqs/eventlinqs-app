import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderTemplate, type TemplateRow } from '@/lib/outreach/rules'

/*
 * Message 1, version 2: the type-led poster of the organiser's own night as the preview in the first invitation (the
 * daily poster directive's correction 4, the PROJECT MANAGER's 00:21 of 30 October 2026). The text must pass every rule
 * of the messages file as version 1 does, and with no poster to show it is held on that field, never sent without it.
 */
const v1 = JSON.parse(readFileSync('scripts/ops/data/outreach-templates-28oct.json', 'utf8')).templates.find((t: { key: string }) => t.key === 'first_invitation')
const v2 = JSON.parse(readFileSync('scripts/ops/data/outreach-templates-30oct-v2.json', 'utf8')).templates.find((t: { key: string }) => t.key === 'first_invitation')
const row = (t: { channel: string; purpose: string; step: number; subject: string; body: string }): TemplateRow =>
  ({ channel: t.channel, purpose: t.purpose, step: t.step, subject: t.subject, body: t.body }) as TemplateRow

// The drive's real TEST facts for Bendigo Library (C:\dev\EVIDENCE\RELATIONSHIP-29OCT\outreach-drive-TEST-737eeb63.txt).
const facts = {
  'first name': 'Sam',
  venue: 'Bendigo Library',
  nights: 'Storytime sessions',
  city: 'Bendigo',
  'true line': 'Storytime at Bendigo Library, every Friday.',
  'claim link': 'https://www.eventlinqs.com.au/venues/bendigo-library/claim',
}
const unsubscribe = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=abc'
const preview = 'https://www.eventlinqs.com.au/kit/00000000-0000-4000-8000-000000000001/1'

describe('message 1, version 2, the poster preview', () => {
  it('carries the line exactly as ruled and changes nothing else of version 1', () => {
    expect(v2.body).toContain("Here's how we've featured your night. [poster preview] With your yes we'll use your own photos.")
    expect(v2.body.replace("Here's how we've featured your night. [poster preview] With your yes we'll use your own photos.\n", '')).toBe(v1.body)
    expect(v2.subject).toBe(v1.subject)
  })

  it('passes every rule of the messages file with the preview filled', () => {
    const r = renderTemplate(row(v2), { ...facts, 'poster preview': preview }, unsubscribe)
    expect(r.heldBecause).toEqual([])
    expect(r.body).toContain(preview)
  })

  it('is held on the preview when there is no poster of their night to show', () => {
    const r = renderTemplate(row(v2), facts, unsubscribe)
    expect(r.heldBecause).toEqual(['a field could not be filled from verified facts: [poster preview]'])
  })
})
