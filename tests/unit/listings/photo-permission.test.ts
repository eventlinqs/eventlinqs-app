import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { grantWording, permittedUsesWords, usesFrom } from '@/lib/listings/photo-permission-math'
import { POLICIES } from '@/lib/rate-limit/policies'

/*
 * AN ORGANISER'S PHOTO PAGE (Lawal, 12 November 2026, 12:01, item 2; Release 2, item 6, media permissions): their yes is
 * kept in the words the page showed them, for one night only, with the uses they ticked; the page opens only for its
 * own secure link; every image goes through the register's one writer, pending Lawal's look.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')

describe('the uses they choose', () => {
  it('two boxes give the register its scope; neither is no permission', () => {
    expect(usesFrom(true, true)).toBe('both')
    expect(usesFrom(true, false)).toBe('site')
    expect(usesFrom(false, true)).toBe('social')
    expect(usesFrom(false, false)).toBeNull()
  })
  it('the permitted uses say where, for this night only, and never paid advertising', () => {
    expect(permittedUsesWords('social')).toBe("In EventLinqs' social posts about this night, as the organiser chose on their EventLinqs photo page; this night only, not paid advertising.")
    expect(permittedUsesWords('both')).toContain("night's own page and cards on EventLinqs and in EventLinqs' social posts")
  })
})

describe('their yes, in their words', () => {
  it('names who gave it, for whom, the night, the images and the uses', () => {
    expect(grantWording({ givenBy: ' Iryna Koval ', organiserName: 'Ukrainian Sounds', nightTitle: 'Kyivska Perepichka', uses: 'site', count: 3 })).toBe(
      "Iryna Koval, for Ukrainian Sounds: I took the 3 images I added for Kyivska Perepichka, or have the right to share them, and EventLinqs may use them on this night's own page and cards on EventLinqs.",
    )
    expect(grantWording({ givenBy: 'Iryna', organiserName: 'U', nightTitle: 'K', uses: 'social', count: 1 })).toContain('I took the image I added for K, or have the right to share it')
  })
  it('never says future: a yes for future nights is keyed to the host and would cover other organisers at a hired venue', () => {
    for (const uses of ['site', 'social', 'both'] as const) expect(grantWording({ givenBy: 'A', organiserName: 'B', nightTitle: 'C', uses, count: 2 })).not.toMatch(/future/i)
    expect(read('src', 'lib', 'listings', 'photo-permission.ts')).toMatch(/p_scope: 'this_event'/)
  })
})

describe('the page and its press', () => {
  const page = read('src', 'app', 'photos', '[contact]', '[proof]', 'page.tsx')
  const action = read('src', 'app', 'photos', '[contact]', '[proof]', 'actions.ts')
  const lib = read('src', 'lib', 'listings', 'photo-permission.ts')
  it('opens only for its own secure link and is never indexed', () => {
    expect(page).toMatch(/if \(page\.state !== 'found'\) notFound\(\)/)
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/)
    expect(lib).toMatch(/proofMatches\(proof, /)
  })
  it('the press is limited by its own bucket, checks the link again and records nothing for a stranger', () => {
    expect(POLICIES['photo-permission']).toMatchObject({ keyPrefix: 'photo-perm', limit: 5, windowSec: 600 })
    expect(action.indexOf("POLICIES['photo-permission']")).toBeLessThan(action.indexOf('readPhotoPage('))
    expect(action.indexOf('readPhotoPage(')).toBeLessThan(action.indexOf('givePhotos('))
  })
  it("every image goes through the register's one writer, pending, after the yes", () => {
    expect(lib).toMatch(/await addAsset\(db, \{/)
    expect(lib).not.toMatch(/from\('social_assets'\)/)
    expect(lib.indexOf("db.rpc('social_log_organiser_yes'")).toBeLessThan(lib.indexOf('await addAsset('))
    expect(lib).toMatch(/await deps\.remove\(\[stored\.path\]\)/)
  })
})
