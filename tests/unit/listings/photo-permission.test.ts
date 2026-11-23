import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DECLARATION_VERSION,
  ONE_TICK_USES,
  ONE_TICK_WORDS,
  POSTER_KEPT_WHOLE,
  grantWording,
  mediaDecision,
  permittedUsesWords,
  restrictionFor,
  type PhotoUses,
} from '@/lib/listings/photo-permission-math'
import { POLICIES } from '@/lib/rate-limit/policies'

/*
 * AN ORGANISER'S PHOTO PAGE (Lawal, 12 November 2026, 12:01, item 2; Release 2, item 6, media permissions): their yes is
 * kept in the words the page showed them; the page opens only for its own secure link; every image goes through the
 * register's one writer. ONE TICK, ONE CHECKBOX (Lawal, 13:49 of 23 November 2026: "One tick, they read through
 * everything ... One tick, one checkbox ... We are just promoting the event"): the page asks once, and the tick is the
 * whole grant.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')

describe('one tick, one checkbox', () => {
  const page = read('src', 'app', 'photos', '[contact]', '[proof]', 'page.tsx')
  it('the page offers exactly one checkbox, whose words say what was ruled, read once', () => {
    expect(page.match(/type="checkbox"/g)).toHaveLength(1)
    expect(page).toMatch(/<input type="checkbox" name="rights" value="yes" required [^>]*\/>\s*<span data-one-tick>\{ONE_TICK_WORDS\}<\/span>/)
    expect(page).not.toMatch(/name="on_page"|name="in_posts"|Where EventLinqs may use them/)
    expect(ONE_TICK_WORDS).toBe(
      'I took these or have the right to share them, and anyone identifiable in them has agreed. EventLinqs may use them to promote this event and our future events on EventLinqs, in its social posts and in its emails, resized, cropped or placed inside EventLinqs designs. Not paid advertising, and never sold.',
    )
    // Plain words: no dash of any kind and no exclamation mark (Copy and banned content).
    expect(ONE_TICK_WORDS).not.toMatch(/[\u2013\u2014!]| - /)
    // Read once: nothing else on the page restates the grant or offers a choice of uses.
    expect(page).not.toMatch(/only where you tick|for that night only|this night only/)
  })

  it('the tick is the whole grant: the recorded yes and the permitted uses carry all of it, the scope the site, cards and posts', () => {
    expect(ONE_TICK_USES).toBe('both')
    expect(permittedUsesWords()).toBe(
      "To promote this night and the organiser's future events on EventLinqs (its pages and event cards), in EventLinqs' social posts and in its emails, resized, cropped or placed inside EventLinqs designs, as the organiser agreed with one tick on their EventLinqs photo page; not paid advertising, and never sold.",
    )
    const lib = read('src', 'lib', 'listings', 'photo-permission.ts')
    expect(lib).toMatch(/scope: ONE_TICK_USES,/)
    expect(lib).toMatch(/permittedUses: permittedUsesWords\(\),/)
    expect(lib).toMatch(/mediaDecision\(\{ grant: \{ uses: ONE_TICK_USES \}, placement: 'site' \}\)/)
    const action = read('src', 'app', 'photos', '[contact]', '[proof]', 'actions.ts')
    expect(action).toMatch(/if \(formData\.get\('rights'\) !== 'yes'\) back\('problem'/)
    expect(action).not.toMatch(/on_page|in_posts/)
  })

  it('a yes already given keeps working: each old scope still reads as promotion of that night, where it was given', () => {
    const where: Record<PhotoUses, readonly ('site' | 'social')[]> = { site: ['site'], social: ['social'], both: ['site', 'social'] }
    for (const uses of ['site', 'social', 'both'] as const) {
      for (const placement of where[uses]) expect(mediaDecision({ grant: { uses }, placement }), `${uses} on ${placement}`).toEqual({ state: 'approved' })
    }
  })
})

describe('their yes, in their words', () => {
  it('names who gave it, for whom, the night, the images and everything the one tick grants, dated', () => {
    expect(grantWording({ givenBy: ' Iryna Koval ', organiserName: 'Ukrainian Sounds', nightTitle: 'Kyivska Perepichka', count: 3 })).toBe(
      'Iryna Koval, for Ukrainian Sounds: I took the 3 images I added for Kyivska Perepichka, or have the right to share them, and anyone identifiable in them has agreed. EventLinqs may use them to promote Kyivska Perepichka and our future events on EventLinqs, in its social posts and in its emails, resized, cropped or placed inside EventLinqs designs. Not paid advertising, and never sold (declaration of 23 November 2026).',
    )
    expect(grantWording({ givenBy: 'Iryna', organiserName: 'U', nightTitle: 'K', count: 1 })).toContain('I took the image I added for K, or have the right to share it, and anyone identifiable in it has agreed. EventLinqs may use it to promote K')
    expect(DECLARATION_VERSION).toBe('23 November 2026')
  })
  it("the words name their future events, but the yes is logged for this night: a host keyed future yes would cover other organisers at a hired venue", () => {
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
  it("every image goes through the register's one writer after the yes, and is applied by the register's one decider", () => {
    expect(lib).toMatch(/await addAsset\(db, \{/)
    expect(lib).not.toMatch(/from\('social_assets'\)/)
    expect(lib.indexOf("db.rpc('social_log_organiser_yes'")).toBeLessThan(lib.indexOf('await addAsset('))
    // Every photo stored and checked BEFORE the yes, and nothing kept means no yes (the PM's 15:02 of 20 November 2026).
    expect(lib.indexOf('await storeImage(')).toBeLessThan(lib.indexOf("db.rpc('social_log_organiser_yes'"))
    expect(lib).toMatch(/if \(kept\.length === 0\) return \{ state: 'done', added: 0, refused/)
    expect(lib).toMatch(/await deps\.remove\(\[stored\.path\]\)/)
    // Lawal, 18 November 2026, 13:46: "If they ticked it, if they approve it, good": approved at once, no review queue.
    expect(lib.indexOf('await addAsset(')).toBeLessThan(lib.indexOf('await decideAsset('))
    expect(lib).toMatch(/decision: 'approved'/)
  })

  it('the page names no person and promises no review (Lawal, 13:46)', () => {
    for (const text of [page, action, lib]) {
      expect(text).not.toMatch(/Lawal (looks|has looked|and he)|until Lawal|Reply to Lawal/)
    }
    expect(page).toContain('subtitle="One tick and EventLinqs can promote your night with them."')
    expect(action).toContain('now on your event.')
  })

  it('a photo for the event page becomes the cover only where the night has no photo of the organiser\'s own', () => {
    expect(lib).toMatch(/OWN_PHOTO_RIGHTS = new Set\(\['organiser_authorised', 'separately_licensed'\]\)/)
    expect(lib).toMatch(/if \(applied\.length > 0\) \{/)
    expect(lib).toMatch(/stored\.width < POSTS_MIN_WIDTH/)
  })
})

/*
 * NO INVENTED RESTRICTION (Lawal, 13:49 of 23 November 2026): a photograph an organiser gives may be resized, cropped or
 * placed inside an EventLinqs design, as the one tick says, so the register records no restriction for it; only their
 * finished design (a flyer or poster, the register's 'artwork') is kept whole. The wording "Used whole, exactly as the
 * organiser supplied it", written once on 8 November by a script outside the repository, is in no source.
 */
describe('what an organiser image may not have done to it', () => {
  it('a photograph carries no restriction, and a flyer is kept whole', () => {
    expect(restrictionFor('photo')).toBeNull()
    expect(restrictionFor('artwork')).toBe(POSTER_KEPT_WHOLE)
    expect(POSTER_KEPT_WHOLE).toMatch(/^Kept whole: /)
    expect(POSTER_KEPT_WHOLE).not.toMatch(/[\u2013\u2014]| - /)
  })
  it('the register writer records the restriction from the asset type: a photo none, a flyer kept whole', () => {
    const lib = read('src', 'lib', 'listings', 'photo-permission.ts')
    expect(lib).toMatch(/const assetType = input\.kind === 'flyer' \? 'artwork' : 'photo'/)
    expect(lib).toMatch(/restrictions: restrictionFor\(assetType\),/)
  })
  it('no source writes the 8 November wording "Used whole, exactly as the organiser supplied it" any more', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|mjs|js|sql)$/.test(name) && readFileSync(path, 'utf8').includes('Used whole, exactly as the organiser supplied it')) found.push(path)
      }
    }
    for (const top of ['src', 'scripts']) walk(join(process.cwd(), top))
    expect(found).toEqual([])
  })
})
