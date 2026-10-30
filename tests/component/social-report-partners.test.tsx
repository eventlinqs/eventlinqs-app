/**
 * D6 ON THE WEEKLY SOCIAL REPORT (the DemandOS directive of 30 October 2026, section 6): each partner's kits on one
 * screen, sent apart from used, a press out apart from an order, and plain words where no kit exists yet.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { buildSocialReport, type PieceRow } from '@/lib/growth/social-report-math'
import { SocialReportView } from '@/app/admin/(authed)/growth/social-report/report-view'

const C = { id: 'c1', weekStart: '2026-10-26' }
const kit: PieceRow = {
  id: 'k1', campaignId: 'c1', kind: 'partner_kit', city: 'melbourne', audience: 'partners', objective: 'audience_growth',
  outcome: 'Visits through Corner Hotel own link', link: 'https://www.eventlinqs.com.au/e/abc', partnerName: 'Corner Hotel',
  postedAt: '2026-10-27T08:00:00.000Z', postUrl: null, countedLinkId: 'K1',
}
const draw = (pieces: PieceRow[]) => {
  const report = buildSocialReport({
    campaignId: 'c1', campaigns: [C], pieces, figures: [], orders: new Map(), counted: new Map(), now: new Date('2026-11-02T00:00:00.000Z'),
    linkEvents: [{ linkId: 'K1', kind: 'click', orderId: null, occurredAt: '2026-10-27T09:00:00.000Z' }, { linkId: 'K1', kind: 'outbound', orderId: null, occurredAt: '2026-10-27T09:01:00.000Z' }],
  })
  const noop = async () => {}
  return renderToStaticMarkup(createElement(SocialReportView, { page: { campaigns: [C], report, decisions: [] }, said: null, readAtDefault: '2026-11-02T09:00', enterFigure: noop, decide: noop }))
}

describe('the partner kits section', () => {
  it('draws one row per partner with sent, used, visits, presses out and orders, each in its own cell', () => {
    const html = draw([kit])
    expect(html).toContain('data-section="partners"')
    expect(html).toMatch(/data-partner="Corner Hotel"/)
    for (const h of ['Partner', 'Kits made', 'Sent', 'Used', 'Visits', 'Presses out', 'Orders on EventLinqs', 'Tickets']) expect(html).toContain(`>${h}<`)
    expect(html).toMatch(/never a sale/)
  })

  it('says plainly when no partner kit exists', () => {
    const html = draw([{ ...kit, kind: 'week_ahead', partnerName: null, countedLinkId: null }])
    expect(html).toContain('No partner kit made yet')
    expect(html).not.toMatch(/data-partner=/)
  })
})
