import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISSION_WORDS, scopeFromPermission } from '@/lib/listings/submission'

/*
 * A SELF-LISTED PHOTOGRAPH TAKES THE SCOPE ITS ORGANISER'S OWN WORDS GRANT (the PM's 01:21 of 22 November 2026). The form
 * asks for "listings and social posts", and every self-listed photograph was registered for the listing alone, so the social
 * planner never saw two organisers' photographs they had given for posts (Kyivska Perepichka, A Moment of Sanity, read on
 * production that night). The writer now takes the scope from the words, and one migration corrects the rows already kept.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

describe("a self-listed photograph's scope is its organiser's words", () => {
  it("the form's words grant the listing and social posts; any other wording, the listing alone", () => {
    expect(scopeFromPermission(PERMISSION_WORDS)).toBe('both')
    expect(scopeFromPermission('Yes, use it on the listing.')).toBe('site')
    expect(scopeFromPermission(`${PERMISSION_WORDS} `)).toBe('site')
  })

  it('the self-listing run hands the scope from the words to the one writer, which writes it', () => {
    const run = read('src/lib/listings/self-listing-run.ts')
    expect(run).toMatch(/scope: scopeFromPermission\(sub\.permission_words\)/)
    const store = read('src/lib/social/store.ts')
    const writer = store.slice(store.indexOf('export async function addSelfListedPhoto('), store.indexOf('export async function pendingAssetId('))
    expect(writer).toMatch(/scope: input\.scope,/)
    expect(writer).not.toMatch(/scope: 'site',/)
  })

  it("the correction matches exactly the form's words, as kept on the rows", () => {
    const sql = read('supabase/migrations/20261122013001_self_listed_photo_takes_its_words.sql')
    const asStored = `'"${PERMISSION_WORDS.replace(/'/g, "''")}" given by %'`
    expect(sql.split(asStored).length - 1).toBe(2)
    expect(sql).toMatch(/set scope = 'both'/)
    expect(sql).toMatch(/raise exception/)
  })
})
