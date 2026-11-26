import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FOUND_US, foundUsFromSrc, LIST_LINK_SOURCES, listLinkSource, sourceAnswersOf } from '@/lib/listings/source-capture'
import { GET } from '@/app/list/route'

/*
 * WHERE AN ORGANISER FOUND US (Lawal's rulings of 26 November 2026, 22:52 and 23:01; the PM's car K lean, item K1). Red on
 * main, where the form recorded no source and /list did not exist:
 *   1. the channel links /list?src=ig, fb, email, qr and ref open the form with "Where did you find us?" answered;
 *   2. the form records four answers, each optional, on the submission; anything off its list is left out;
 *   3. every organiser record carries its source channel (migration 20261126200001).
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

describe('the channel links', () => {
  it('know exactly the five codes the pilot carries', () => {
    expect(LIST_LINK_SOURCES).toEqual(['ig', 'fb', 'email', 'qr', 'ref'])
    expect(listLinkSource('IG')).toBe('ig')
    expect(listLinkSource('tiktok')).toBeNull()
    expect(listLinkSource(null)).toBeNull()
  })
  it('choose the form answer each one means', () => {
    expect(foundUsFromSrc('ig')).toBe('instagram')
    expect(foundUsFromSrc('fb')).toBe('facebook')
    expect(foundUsFromSrc('email')).toBe('email')
    expect(foundUsFromSrc('qr')).toBe('qr')
    expect(foundUsFromSrc('ref')).toBe('referral')
    expect(foundUsFromSrc('nope')).toBe('')
  })
  it.each(['ig', 'fb', 'email', 'qr', 'ref'])('/list?src=%s opens the form with its source', (code) => {
    const res = GET(new Request(`https://www.eventlinqs.com.au/list?src=${code}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`https://www.eventlinqs.com.au/submit-event?src=${code}#submit`)
  })
  it('an unknown or missing source opens the form with nothing chosen, never an error', () => {
    expect(GET(new Request('https://www.eventlinqs.com.au/list?src=<script>')).headers.get('location')).toBe('https://www.eventlinqs.com.au/submit-event#submit')
    expect(GET(new Request('https://www.eventlinqs.com.au/list')).headers.get('location')).toBe('https://www.eventlinqs.com.au/submit-event#submit')
  })
})

describe('the four answers', () => {
  const form = (o: Record<string, string>) => (name: string) => o[name] ?? ''
  it('are kept as given, each optional', () => {
    expect(sourceAnswersOf(form({ found_us: 'instagram', src: 'ig', also_listed_on: '  Humanitix,   our own site ', social_account: '@afrofusion.mel', event_frequency: 'monthly' }))).toEqual({
      found_us: 'instagram',
      found_us_src: 'ig',
      also_listed_on: 'Humanitix, our own site',
      social_account: '@afrofusion.mel',
      event_frequency: 'monthly',
    })
    expect(sourceAnswersOf(form({}))).toEqual({ found_us: null, found_us_src: null, also_listed_on: null, social_account: null, event_frequency: null })
  })
  it('leave out anything off their list, and cut a long answer to 200', () => {
    const a = sourceAnswersOf(form({ found_us: 'billboard', src: 'tiktok', event_frequency: 'daily', social_account: 'x'.repeat(300) }))
    expect(a.found_us).toBeNull()
    expect(a.found_us_src).toBeNull()
    expect(a.event_frequency).toBeNull()
    expect(a.social_account).toHaveLength(200)
  })
  it('match the database checks of migration 20261126200001', () => {
    const migration = read('supabase/migrations/20261126200001_where_an_organiser_came_from.sql')
    for (const f of FOUND_US) expect(migration).toContain(`'${f}'`)
    for (const c of LIST_LINK_SOURCES) expect(migration).toContain(`'${c}'`)
    for (const f of ['once', 'monthly', 'fortnightly', 'weekly', 'more_than_weekly']) expect(migration).toContain(`'${f}'`)
    expect(migration).toMatch(/alter table public\.organisers add column if not exists source_channel text not null default 'discovery'/)
  })
})

describe('the form and its action', () => {
  it('the form asks the four, the first chosen from the link, and carries the link code', () => {
    const page = read('src/app/submit-event/page.tsx')
    expect(page).toMatch(/name="found_us" className=\{SELECT\} defaultValue=\{foundDefault\}/)
    expect(page).toMatch(/\{linkSource \? <input type="hidden" name="src" value=\{linkSource\} \/> : null\}/)
    expect(page).toContain('name="also_listed_on"')
    expect(page).toContain('name="social_account"')
    expect(page).toContain('name="event_frequency"')
  })
  it('the action records the answers with the judged row', () => {
    expect(read('src/app/submit-event/actions.ts')).toMatch(/recordSubmission\(createAdminClient\(\), \{ \.\.\.judged\.row, \.\.\.sourceAnswersOf\(field\) \}, /)
  })
})
