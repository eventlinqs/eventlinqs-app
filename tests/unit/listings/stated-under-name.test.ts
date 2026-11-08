import { describe, expect, it } from 'vitest'
import { statedUnderName } from '@/lib/listings/stated-words'

/*
 * THE CONTROLLER's 18:30 (2): the library's own HTML pages first. Goldfields Libraries' 'Genealogy Groups at Goldfields
 * Libraries' (ncgrl.vic.gov.au/?p=964, read 7 November 2026 through the polite reader,
 * C:\dev\EVIDENCE\ENGINE-P0\readers-62\ncgrl-p_964.txt) names each group, then its address, site and email, then
 * 'Library assistance at the Bendigo Library', then its days and hours. Ours: 'Genealogy Research Help (Bendigo Family
 * History Group)' on Wednesdays and Saturdays 10:00, '(Bendigo Regional Genealogical Society)' on Mondays 11:00.
 */
const ZONE = 'Australia/Melbourne'
const PAGE = `<main><h1>Genealogy Groups at Goldfields Libraries</h1>
<p>There are three genealogy groups based at Goldfields Libraries.</p>
<h3>Bendigo Family History Group</h3><p>PO Box 145, Bendigo Victoria 3552</p><p>www.bendigofamilyhistory.org</p>
<p>bendigogen@familyhistoryconnections.org.au</p><p>Library assistance at the Bendigo Library</p><p>Wednesdays and Saturdays, 10am-2pm</p>
<h3>Bendigo Regional Genealogical Society</h3><p>PO Box 1049, Bendigo Victoria 3552</p><p>https://brgsbendigo.weebly.com/</p>
<p>brgs2@hotmail.com</p><p>Library assistance at the Bendigo Library</p><p>Monday 11am-3pm</p>
<h3>Gisborne Genealogical Group</h3><p>PO Box 818, Gisborne 3437</p><p>Library assistance at the Gisborne Library</p><p>Thursdays, 1-3pm.</p></main>`
const FHG = 'Genealogy Research Help (Bendigo Family History Group)'
const BRGS = 'Genealogy Research Help (Bendigo Regional Genealogical Society)'

describe('a group named in our title, its days and hours under its name', () => {
  it('reads the Family History Group on a Wednesday and a Saturday at 10 am', () => {
    expect(statedUnderName(PAGE, FHG, '2026-11-10T23:00:00Z', ZONE)).toBe(true) // Wednesday 11 November, 10 am
    expect(statedUnderName(PAGE, FHG, '2026-11-13T23:00:00Z', ZONE)).toBe(true) // Saturday 14 November, 10 am
  })
  it('reads the Regional Genealogical Society on a Monday at 11 am', () => {
    expect(statedUnderName(PAGE, BRGS, '2026-11-09T00:00:00Z', ZONE)).toBe(true) // Monday 9 November, 11 am
  })
  it("never reads another group's days, another weekday, or another time", () => {
    expect(statedUnderName(PAGE, FHG, '2026-11-09T00:00:00Z', ZONE)).toBe(false) // Monday 11 am is the Society's
    expect(statedUnderName(PAGE, BRGS, '2026-11-10T23:00:00Z', ZONE)).toBe(false) // Wednesday 10 am is the Group's
    expect(statedUnderName(PAGE, FHG, '2026-11-11T00:00:00Z', ZONE)).toBe(false) // Wednesday 11 am
  })
  it("a range's pm written once is its start's too (Gisborne: 'Thursdays, 1-3pm.')", () => {
    expect(statedUnderName(PAGE, 'Genealogy Research Help (Gisborne Genealogical Group)', '2026-11-12T02:00:00Z', ZONE)).toBe(true) // Thursday 1 pm
  })
})
