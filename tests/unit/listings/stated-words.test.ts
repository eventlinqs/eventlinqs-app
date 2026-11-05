import { describe, expect, it } from 'vitest'
import { statedInWords, statedWeekly } from '@/lib/listings/stated-words'

/*
 * THE CASE (engine verifier run of 5 November 2026, 19:24): North Central Goldfields Regional Library's storytimes page
 * (https://ncgrl.vic.gov.au/storytimes, read politely that evening, C:\dev\EVIDENCE\ENGINE-P0\source-reads\) states its
 * sessions as a weekly timetable inside school terms, not as dated nights. The verifier matched dates that belong to the
 * outreach playgroups lower on the page ('Tuesday 10 November') and found no time beside them, so it left five library
 * nights NOT JUDGED and five more 'not stated', though the page states every one of them. The excerpt below is the page's
 * own structure and lines, facts only.
 */
const PAGE = `
<p>Our regular storytime sessions are scheduled each week during school terms, with breaks for the school holidays.</p>
<ul><li>Term 1: Monday 2 February &#8211; Thursday 2 April</li>
<li>Term 2: Monday 20 April &#8211; Friday 26 June</li>
<li>Term 3: Monday 13 July &#8211; Friday 18 September</li>
<li>Term 4: Monday 5 October &#8211; Friday 11 December</li></ul>
<h2 class="wp-block-heading">Regular session times</h2>
<p class="wp-block-paragraph">Download Storytime cards:</p>
<ul><li>Bendigo, Eaglehawk, Heathcote and Kangaroo Flat libraries</li></ul>
<h3 class="wp-block-heading">Baby Rhyme Time</h3>
<p>Simple stories, songs and rhymes for babies up to one-year-old.</p>
<ul><li><strong>Bendigo Library</strong>: Friday, 10.30-11am</li>
<li><strong>Kangaroo Flat Library</strong>: Tuesday, 10.30-11am</li>
<li><strong>Kyneton Library</strong>: Tuesday, 10-10.30am</li></ul>
<h3 class="wp-block-heading">Toddler Time</h3>
<p>Stories, songs and rhymes for toddlers aged 1-3 years.</p>
<ul><li><strong>Bendigo Library</strong>: Tuesday &amp; Thursday, 10.30-11am</li>
<li><strong>Eaglehawk Library</strong>: Friday, 10.30-11am</li>
<li><strong>Kangaroo Flat Library</strong>: Wednesday, 10.30-11am</li></ul>
<h3 class="wp-block-heading">Storytime</h3>
<p>Stories, songs and rhymes for preschoolers aged 2-5 years.</p>
<ul><li><strong>Bendigo Library</strong>: Monday &amp; Wednesday, 10.30-11.15am</li>
<li><strong>Heathcote Library</strong>: Friday, 9.45-10.30am (0-5 years)</li>
<li><strong>Kangaroo Flat Library</strong>: Friday, 10.30-11.15am (0-5 years)</li></ul>
<h3 class="wp-block-heading">Saturday Storytime</h3>
<ul><li><strong>Woodend Library</strong>: First Saturday of the month, 10.30-11am</li></ul>
<h3 class="wp-block-heading">Library Agency Storytimes</h3>
<p>Pyramid Hill Playgroup, 10.30-11am</p><p>Tuesday 10 November</p><p>Friday 13 November</p>
`
const Z = 'Australia/Melbourne'
/** A local wall clock in Melbourne (AEDT, +11:00, from October to April) as the instant the row stores. */
const at = (local: string) => new Date(`${local}:00+11:00`).toISOString()

describe('a weekly timetable states its sessions (statedWeekly)', () => {
  it.each([
    ['Baby Rhyme Time', 'Bendigo Library', '2026-12-11T10:30', 'its Friday line, on the last day of term'],
    ['Baby Rhyme Time', 'Kangaroo Flat Library', '2026-11-10T10:30', 'its Tuesday line'],
    ['Toddler Time', 'Kangaroo Flat Library', '2026-12-02T10:30', 'its Wednesday line, not Storytime\'s Friday one'],
    ['Toddler Time', 'Bendigo Library', '2026-11-12T10:30', 'the Thursday of "Tuesday & Thursday"'],
    ['Storytime', 'Kangaroo Flat Library', '2026-11-06T10:30', 'its own section, not "Download Storytime cards"'],
    ['Storytime', 'Heathcote Library', '2026-11-06T09:45', 'a 9.45 start written with a dot'],
    ['Storytime', 'Bendigo Library', '2026-11-09T10:30', 'the Monday of "Monday & Wednesday"'],
  ])('%s at %s on %s: %s', (title, venue, local) => {
    expect(statedWeekly(PAGE, title, venue, at(local), Z)).toBe('weekly')
  })

  it('takes a venue line only from inside the title\'s own section', () => {
    // Kangaroo Flat's Tuesday 10.30 line is Baby Rhyme Time's; Storytime there is on a Friday.
    expect(statedWeekly(PAGE, 'Storytime', 'Kangaroo Flat Library', at('2026-11-10T10:30'), Z)).toBeNull()
  })

  it('never reads a longer heading that merely contains the title', () => {
    expect(statedWeekly(PAGE, 'Storytime', 'Woodend Library', at('2026-11-07T10:30'), Z)).toBeNull()
  })

  it('refuses another start time on the right day', () => {
    expect(statedWeekly(PAGE, 'Baby Rhyme Time', 'Bendigo Library', at('2026-11-13T11:30'), Z)).toBeNull()
  })

  it('names a night after the term the page states, rather than passing it', () => {
    expect(statedWeekly(PAGE, 'Storytime', 'Bendigo Library', at('2026-12-14T10:30'), Z)).toBe('outside_term')
  })

  it('reads nothing on a page with no heading for the title', () => {
    expect(statedWeekly(PAGE, 'Rhyme and Play', 'Bendigo Library', at('2026-11-13T10:30'), Z)).toBeNull()
  })
})

describe('a dated page states a night in its own words (statedInWords)', () => {
  it('reads a time written with a dot, as Australian pages write it', () => {
    const html = '<p>Thursday 26 November</p><p>Doors 7.30pm</p>'
    expect(statedInWords(html, at('2026-11-26T19:30'), Z)).toBe('both')
  })

  it('reads a day written with a leading zero, as tour sites write it', () => {
    // Red Hot Summer Tour's Ballarat page, read 5 November 2026: '07 NOVEMBER 2026' and '12:30pm ═ GATES'.
    expect(statedInWords('<p>Ballarat, VIC</p><p>07 NOVEMBER 2026</p><p>12:30pm ═ GATES</p>', at('2026-11-07T12:30'), Z)).toBe('both')
    expect(statedInWords('<p>SAT 07 NOV</p>', at('2026-11-07T12:30'), Z)).toBe('date')
  })

  it('still answers date only when no time stands near the date', () => {
    expect(statedInWords('<p>Thursday 26 November</p>', at('2026-11-26T19:30'), Z)).toBe('date')
  })
})
