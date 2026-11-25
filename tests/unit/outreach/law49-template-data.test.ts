import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIFECYCLE_PERM_FOLLOW_UP } from '@/lib/outreach/perm-follow-up'
import { LIFECYCLE_ACQ_FOLLOW_UP } from '@/lib/outreach/acq-follow-up'
import { REPLY_SIGNATURE, renderTemplate } from '@/lib/outreach/rules'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'

/*
 * LAW 49'S TWO FOLLOW UPS AS STORED (the PM's 14:15 of 25 November 2026, item D): the template rows written to
 * production come from scripts/ops/data/outreach-templates-25nov-law49.json, and say word for word what the code's
 * approved letters say (src/lib/outreach/perm-follow-up.ts, acq-follow-up.ts), with the signature as its field, which is
 * the reply signature at step 2. So what is tested is what is sent.
 */
const DATA = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/data/outreach-templates-25nov-law49.json'), 'utf8')) as {
  templates: { key: string; channel: string; purpose: string; step: number; subject: string; body: string }[]
}

describe("law 49's two follow ups, as stored", () => {
  it('are the two keys, each with its class', () => {
    expect(DATA.templates.map((t) => t.key)).toEqual(['lifecycle_perm_follow_up', 'lifecycle_acq_follow_up'])
    expect(TEMPLATE_CLASS.lifecycle_perm_follow_up).toEqual({ category: 'PERM', subtype: 'PERM-REMINDER' })
    expect(TEMPLATE_CLASS.lifecycle_acq_follow_up).toEqual({ category: 'ACQ', subtype: 'ACQ-FOLLOWUP' })
  })
  for (const letter of [LIFECYCLE_PERM_FOLLOW_UP, LIFECYCLE_ACQ_FOLLOW_UP]) {
    it(`${letter.key} is the code's letter word for word, the signature as its field`, () => {
      const row = DATA.templates.find((t) => t.key === letter.key)
      expect(row).toBeDefined()
      expect(row).toMatchObject({ channel: letter.channel, purpose: letter.purpose, step: letter.step, subject: letter.subject })
      expect(row?.body).toBe(letter.body.replace(REPLY_SIGNATURE, '[signature]'))
      // Rendered, the stored row and the code's letter are the same message.
      const fields = { greeting: 'Sam', event: 'A Night', 'event day': 'Saturday 12 December', 'event link': 'https://www.eventlinqs.com.au/events/a-night', 'approval link': 'https://www.eventlinqs.com.au/p/x', 'thread subject': 'Promoting A Night on EventLinqs' }
      const stored = renderTemplate({ channel: 'email', purpose: 'cadence', step: 2, subject: row?.subject ?? '', body: row?.body ?? '' }, fields, 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=x')
      const code = renderTemplate(letter, fields, 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=x')
      expect(stored.subject).toBe(code.subject)
      expect(stored.body).toBe(code.body)
    })
  }
})
