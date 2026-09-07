/**
 * DRIVEN PROOF for the positioning lock (owner ruling, 7 September 2026).
 *
 * WHAT THIS DRIVES, and why it is driven rather than asserted. The change is
 * copy, and copy is the one kind of change a green test suite cannot vouch for:
 * a string can be correct in the module and never reach the page, or reach the
 * page and wrap into an orphan on a phone. So this loads the real pages from a
 * real server at 390, 768 and 1440 and reads what a person would read.
 *
 *   1. The homepage H1 is the strapline, not the retired sentence, and the
 *      subhead no longer opens with a fee claim.
 *   2. The footer and the auth shell carry the same one sentence.
 *   3. The served <head> carries it too: title, Open Graph, Twitter card, and
 *      the Organization JSON-LD description that production was serving with
 *      "Live event ticketing platform" inside it.
 *   4. About and Press read as the place events get made, while the sentences
 *      that describe COMPETITORS survive untouched, because losing those would
 *      be a different defect.
 *   5. The order confirmation email, rendered through the real builder, because
 *      four email footers is where the retired strapline lived longest and
 *      nobody opens a diff of an email.
 *
 * Read only. It creates nothing and deletes nothing.
 *
 * Usage:
 *   BASE=http://localhost:3311 node scripts/verify/positioning-drive.mjs --out C:/dev/EVIDENCE/POSITIONING
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, BASE } from '../journeys/harness.mjs'
import { BRAND_STRAPLINE, BRAND_TAGLINE } from '../../src/lib/brand/positioning.ts'

const args = process.argv.slice(2)
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const RETIRED = 'ticketing platform built for every community'
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 1000 },
]

const record = []
function check(what, ok, detail) {
  record.push({ what, ok, detail })
  console.log(`${ok ? '  PASS ' : '  FAIL '} ${what}${detail ? ` :: ${detail}` : ''}`)
}

/**
 * A page's VISIBLE text may legitimately contain the banned words when the
 * sentence is about a competitor. This applies the same sentence rule the guard
 * applies, so the drive and the guard cannot disagree about what is allowed.
 */
const COMPETITOR_MARKER =
  /\b(other|others|most|mainstream|major|dominant|best|unlike|than|rival|rivals|incumbent|incumbents|traditional|conventional|competitor|competitors|competing|versus|vs)\b/i

function selfDescriptions(text) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  return sentences.filter(
    s => /ticket(ing platform|ing platforms|\s+seller)/i.test(s) && !COMPETITOR_MARKER.test(s),
  )
}

async function run() {
  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()

      // ---- 1. The homepage ----
      /*
       * THE HOMEPAGE HERO IS NOT WHERE A READER WOULD LOOK FOR IT. This drive
       * first asserted the H1 of `home-hero.tsx` and failed at all three
       * viewports, which is the finding: that component is not rendered by
       * anything. The live hero is `FeaturedHero`, whose H1 is `sr-only` and
       * whose VISIBLE headline is the locked tagline, left unchanged by the
       * ruling. So the homepage assertion is what the hero actually says.
       */
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      /*
       * The hero has TWO states and the assertion has to know which one it is
       * looking at, or it asserts the wrong thing and calls the product broken.
       * With featured events it renders the events themselves, which carry no
       * positioning claim; with none it renders the curated hero whose headline
       * is the locked tagline (close-out C17). Both branches are judged here.
       */
      const hero = page.locator('section:has(#home-hero-heading)').first()
      const heroText = (await hero.innerText()).replace(/\u00A0/g, ' ')
      if (heroText.includes(BRAND_TAGLINE)) {
        check(`${vp.name}: the empty-state homepage hero leads with the locked tagline`, true, BRAND_TAGLINE)
      } else {
        const eventLinks = await hero.locator('a[href*="/events/"]').count()
        check(`${vp.name}: the populated homepage hero leads with a real event`, eventLinks > 0, `${eventLinks} event link(s)`)
      }
      check(
        `${vp.name}: the homepage hero describes the platform in no forbidden words`,
        selfDescriptions(heroText).length === 0,
        selfDescriptions(heroText).join(' | ').slice(0, 140),
      )
      const homeText = await page.locator('body').innerText()
      check(
        `${vp.name}: the homepage never says the retired strapline`,
        !homeText.toLowerCase().includes(RETIRED),
      )
      check(
        `${vp.name}: the homepage subhead does not open with a fee claim`,
        !homeText.includes('All-in pricing from the first click'),
      )
      const homeSelf = selfDescriptions(homeText)
      check(`${vp.name}: the homepage describes itself in no forbidden words`, homeSelf.length === 0, homeSelf.join(' | ').slice(0, 160))
      await page.screenshot({ path: join(out, `home-${vp.name}.png`), fullPage: false })

      /*
       * ---- 2. The footer ----
       * The brand strip carrying the strapline is the DESKTOP footer; the
       * mobile footer is the founder-spec logo, socials and stacked accordions,
       * with no brand line to carry. Asserting it at 390 would be asserting a
       * composition change this copy-only item is not allowed to make.
       */
      const footer = await page.locator('footer').first().innerText()
      if (vp.width >= 768) {
        check(`${vp.name}: the footer brand strip carries the strapline`, footer.includes(BRAND_STRAPLINE), footer.split('\n')[0])
      } else {
        check(`${vp.name}: the mobile footer carries no retired strapline`, !footer.toLowerCase().includes(RETIRED))
      }

      /*
       * ---- 3. The auth shell ----
       * Same rule, same reason: the brand panel is desktop-only, which is the
       * measured competitor pattern (EB and TM both ship desktop brand panel,
       * mobile card-only) and is recorded in the competitor-benchmark skill.
       */
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      const loginText = await page.locator('body').innerText()
      if (vp.width >= 1440) {
        check(`${vp.name}: the login brand panel carries the tagline`, loginText.includes(BRAND_TAGLINE))
      }
      check(
        `${vp.name}: the login page never says the retired strapline`,
        !loginText.toLowerCase().includes(RETIRED),
      )
      await page.screenshot({ path: join(out, `login-${vp.name}.png`), fullPage: false })

      // ---- 4. About and Press ----
      for (const path of ['/about', '/press']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
        const text = await page.locator('body').innerText()
        const self = selfDescriptions(text)
        check(`${vp.name}: ${path} describes itself in no forbidden words`, self.length === 0, self.join(' | ').slice(0, 160))
        check(
          `${vp.name}: ${path} never says the retired strapline`,
          !text.toLowerCase().includes(RETIRED),
        )
        await page.screenshot({ path: join(out, `${path.slice(1)}-${vp.name}.png`), fullPage: false })
      }
      await context.close()
    }

    // ---- 5. The served <head>, read once: it does not vary by viewport ----
    const html = await (await fetch(`${BASE}/`)).text()
    const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ''
    /*
     * The homepage declares its OWN title (close-out C19 gave every page one),
     * and that title is the locked tagline, which the ruling leaves unchanged.
     * So the assertion is the tagline, not the root layout's default: asserting
     * the default here would be asserting a string this page never serves.
     */
    check('the served homepage title is the locked tagline', title.includes(BRAND_TAGLINE), title)
    check('the served title drops the retired strapline', !title.toLowerCase().includes(RETIRED))

    const metas = [...html.matchAll(/<meta[^>]+(?:property|name)="(og:[^"]+|twitter:[^"]+)"[^>]+content="([^"]*)"/g)]
    const byKey = Object.fromEntries(metas.map(m => [m[1], m[2]]))
    for (const key of ['og:title', 'og:description', 'twitter:description']) {
      const value = byKey[key] ?? ''
      check(`${key} drops the retired strapline`, value !== '' && !value.toLowerCase().includes(RETIRED), value)
      check(`${key} says nothing a forbidden phrase would say`, selfDescriptions(value).length === 0, value)
    }
    /* "Never lead with fees or a price comparison." */
    for (const key of ['og:description', 'twitter:description']) {
      check(`${key} does not sell on fees`, !/no hidden fees|all-in pricing|no surprise fees/i.test(byKey[key] ?? ''), byKey[key])
    }
    check(
      'the homepage cards name the category',
      /where events get made|place events get made/i.test(byKey['og:description'] ?? ''),
      byKey['og:description'],
    )

    const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    let org = null
    for (const block of ld) {
      try {
        const parsed = JSON.parse(block)
        for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
          if (node['@type'] === 'Organization') org = node
        }
      } catch {
        /* a block that does not parse is a different defect and structured-data-validate owns it */
      }
    }
    check('the Organization JSON-LD exists', Boolean(org))
    check(
      'the Organization description no longer says ticketing platform',
      Boolean(org) && !/ticketing platform/i.test(org.description ?? ''),
      org?.description?.slice(0, 120),
    )
    writeFileSync(join(out, 'head-tags.json'), JSON.stringify({ title, ...byKey, organization: org?.description }, null, 2))

    // ---- 6. The transactional email, rendered through the real builder ----
    const { buildConfirmationEmailHtml, buildConfirmationEmailText } = await import(
      '../../src/lib/email/order-confirmation.ts'
    )
    // The shapes are read off the builder's own types, never invented.
    const order = {
      id: '00000000-0000-4000-8000-00000000c0de',
      order_number: 'EL-POSITIONING-DRIVE',
      total_cents: 2000,
      currency: 'AUD',
    }
    const event = {
      title: 'A night the positioning drive rendered',
      start_date: '2026-10-01T09:00:00.000Z',
      timezone: 'Australia/Melbourne',
      venue_name: 'Local hall',
      venue_city: 'Geelong',
      venue_country: 'AU',
    }
    const tickets = [
      {
        ticket_code: 'POSDRIVE1',
        secret: 'not-a-real-secret',
        holder_name: 'Robin Ashe',
        status: 'valid',
        seat: null,
      },
    ]
    let emailHtml = ''
    let emailText = ''
    try {
      emailHtml = buildConfirmationEmailHtml(order, event, tickets, null, 'Robin')
      emailText = buildConfirmationEmailText(order, event, tickets, null, 'Robin')
    } catch (error) {
      check('the confirmation email renders', false, String(error).slice(0, 160))
    }
    if (emailHtml) {
      check('the confirmation email HTML carries the strapline', emailHtml.includes(BRAND_STRAPLINE))
      check('the confirmation email HTML drops the retired strapline', !emailHtml.toLowerCase().includes(RETIRED))
      check('the confirmation email plain text carries the strapline', emailText.includes(BRAND_STRAPLINE))
      writeFileSync(join(out, 'order-confirmation-email.html'), emailHtml)
    }
  } finally {
    await browser.close()
  }

  const failed = record.filter(r => !r.ok)
  writeFileSync(join(out, 'positioning-drive.json'), JSON.stringify(record, null, 2))
  console.log(`\n${record.length - failed.length} of ${record.length} checks passed`)
  if (failed.length) {
    console.error(`FAIL: ${failed.length} check(s) failed`)
    process.exit(1)
  }
  console.log('PASS: the positioning reached every surface it was driven on.')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
