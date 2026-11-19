// A FAILURE IS NAMED WHERE IT IS READ (the PM's 05:38 of 20 November 2026, item 3): the hourly listings run failed the
// same eight nights every hour and said each one's series, date and reason only in its Vercel log, which not everyone can
// read. Its phase row (ops_phase_runs, read on /admin/today and from production) carries each failed night itself.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(process.cwd(), 'src/app/api/cron/listing-occurrences/route.ts'), 'utf8').replace(/\r\n/g, '\n')

describe("the listings run's phase row names each failed night", () => {
  it('its result carries each failure: its series, its date and its reason', () => {
    const at = route.indexOf('await recordPhaseRun(')
    expect(at).toBeGreaterThan(0)
    const record = route.slice(at, route.indexOf('})', at))
    expect(record).toContain('result.failed.slice(0, 12).map((f) =>')
    expect(record).toContain('series ${f.seriesId}')
    expect(record).toContain("${f.date ?? '(the night)'}")
    expect(record).toContain('${f.why')
  })
})
