import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { presenterIn, PRESENTER_MAX } from '@/lib/listings/presenter'
import { pageRuleFor } from '@/lib/listings/page-rules'
import { collectionStore } from '@/lib/listings/collect-store'
import type { CandidateRow } from '@/lib/listings/collect-run'

/*
 * EACH CAPTURED NIGHT CARRIES ITS ORGANISER, WHERE ITS OWN PAGE NAMES ONE (the PM's 09:05 (3) of 13 November 2026). Read
 * that morning through the polite reader: none of 15 live sources' event pages carries a schema.org organizer; Geelong
 * Arts Centre states its hirer in a span after the title, Melbourne Recital Centre its company in a line above it. The
 * pages below are built by hand in the same shape, never copied from theirs.
 */

const GAC_URL = 'https://geelongartscentre.org.au/whats-on/all-events/bp-proof-concert/'
const gacPage = (presented: string | null) => `<!doctype html><html><body><main><div><h1 class="x">Bp Proof School: Annual Concert</h1>${
  presented === null ? '' : `<span class="y">${presented}</span>`
}</div><p>The event promoter will be in contact with VIP holders.</p></main>
<aside><div><p>Performances:</p><p><span>Sat, 21 Nov 2026</span><span><span>06:30pm</span></span></p></div>
<div><p>Ticket Prices:</p><p><span>Adult</span><span>$30</span></p></div>
<div><p>Venue:</p><p>Costa Hall</p><p>1 Gheringhap St</p><a>Venue Info</a></div></aside>
<script>self.__next_f.push([1,"{\\"entrySubTitle\\":\\"Presented by Someone Else\\"}"])</script></body></html>`

const MRC_URL = 'https://www.melbournerecital.com.au/whats-on/current-productions/bp-proof-recital/'
const mrcData = JSON.stringify({ props: { page: { address: '31 Sturt St Southbank 3006', performances: [{ contentType: 'tessituraPerformance', name: '2027-02-22 19:00 (25624)' }] } } })
const mrcPage = (company: string | null) =>
  `<html><body><div id="page-heading">${company === null ? '' : `<p class="performance-company-title m-0">${company}</p>`}<h1 class="page-title">Bp Proof Recital</h1></div><script id="__NEXT_DATA__" type="application/json">${mrcData}</script></body></html>`

describe('presenterIn: only a line of its own that says who presents the night', () => {
  it('reads the name from an element whose whole text is "Presented by <name>"', () => {
    expect(presenterIn(gacPage('Presented by Bp Proof Calisthenic College'))).toBe('Bp Proof Calisthenic College')
    expect(presenterIn(mrcPage('Presented by Melbourne Recital Centre'))).toBe('Melbourne Recital Centre')
  })

  it('decodes the page\'s own entities and spacing', () => {
    expect(presenterIn('<span>Presented by&nbsp;Bp Proof &amp; Sons   Theatre Co.</span>')).toBe('Bp Proof & Sons Theatre Co')
  })

  it('names no one where the page names no one: a sentence about "the event promoter", a script\'s data, a style', () => {
    expect(presenterIn(gacPage(null))).toBeNull()
    expect(presenterIn('<p>No video unless stated otherwise by the promoter.</p>')).toBeNull()
    expect(presenterIn('<script>{"performanceCompany":"Presented by Hidden"}</script><style>.a::after{content:"Presented by X"}</style>')).toBeNull()
    expect(presenterIn('<p>This show is presented by friends of ours, and more words follow.</p>')).toBeNull()
  })

  it('keeps a name, never a paragraph', () => {
    expect(presenterIn(`<span>Presented by ${'A'.repeat(PRESENTER_MAX + 1)}</span>`)).toBeNull()
    expect(presenterIn('<span>Presented by X</span>')).toBeNull()
  })
})

describe('the two rules carry the presenter on every night they find', () => {
  it('Geelong Arts Centre: the hirer named after the title', () => {
    const found = pageRuleFor(GAC_URL)!.read(gacPage('Presented by Bp Proof Calisthenic College'), GAC_URL)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ title: 'Bp Proof School: Annual Concert', presentedBy: 'Bp Proof Calisthenic College' })
  })

  it('Geelong Arts Centre: null where the page names no one, never the hidden data', () => {
    expect(pageRuleFor(GAC_URL)!.read(gacPage(null), GAC_URL)[0].presentedBy).toBeNull()
  })

  it('Melbourne Recital Centre: its company line above the title', () => {
    const found = pageRuleFor(MRC_URL)!.read(mrcPage('Presented by Bp Proof Chamber Players'), MRC_URL)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ title: 'Bp Proof Recital', presentedBy: 'Bp Proof Chamber Players' })
    expect(pageRuleFor(MRC_URL)!.read(mrcPage(null), MRC_URL)[0].presentedBy).toBeNull()
  })
})

describe('the store keeps the presenter, and never loses a night before the column exists', () => {
  const row = (presentedBy: string | null): CandidateRow => ({
    sourceId: 's1', foundAt: '2026-11-13T00:00:00Z', kind: 'new', eventId: null, change: null, title: 'Bp Proof Recital',
    startsAt: '2027-02-22T08:00:00.000Z', endsAt: null, venueName: 'Melbourne Recital Centre', venueAddress: null,
    pageUrl: MRC_URL, imageUrl: null, description: null, links: [], confidence: 'high', reasons: [], decidedBy: 'person', presentedBy,
  })
  function db(columnExists: boolean) {
    const writes: Record<string, unknown>[] = []
    const client = {
      from: () => ({
        upsert: (obj: Record<string, unknown>) => {
          writes.push(obj)
          return {
            select: async () =>
              !columnExists && 'presented_by' in obj
                ? { data: null, error: { message: "Could not find the 'presented_by' column of 'listing_candidates' in the schema cache" } }
                : { data: [{ id: 'c1' }], error: null },
          }
        },
      }),
    }
    return { client: client as unknown as SupabaseClient, writes }
  }

  it('writes presented_by with the row', async () => {
    const { client, writes } = db(true)
    expect(await collectionStore(client).land(row('Bp Proof Chamber Players'))).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ presented_by: 'Bp Proof Chamber Players', title: 'Bp Proof Recital' })
  })

  it('writes no presented_by field when the page names no one', async () => {
    const { client, writes } = db(true)
    await collectionStore(client).land(row(null))
    expect('presented_by' in writes[0]).toBe(false)
  })

  it('before the migration: the night still lands, without the presenter', async () => {
    const { client, writes } = db(false)
    expect(await collectionStore(client).land(row('Bp Proof Chamber Players'))).toBe(true)
    expect(writes).toHaveLength(2)
    expect('presented_by' in writes[1]).toBe(false)
  })
})
