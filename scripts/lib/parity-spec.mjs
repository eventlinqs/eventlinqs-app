/**
 * THE TABLE STAKES, AS A SPECIFICATION THE MACHINE CHECKS, NOT A DOCUMENT
 * SOMEBODY REMEMBERS.
 *
 * ============================================================================
 * WHY THIS EXISTS (close-out PARITY1)
 * ============================================================================
 *
 * "The structured data gap, the noindex discovery layer and the undisclosed
 * buyer total were all found because the owner asked a question, not because the
 * build noticed. That is a process failure and an apology does not fix a
 * process. This item makes the check automatic."
 *
 * All three had one thing in common: they were visible in what PRODUCTION
 * SERVED, to anybody who looked, and nothing looked. Every line below is
 * therefore judged against a real production page, and the one thing this file
 * may never do is judge the repository instead. A spec that reads source would
 * have passed all three of those defects, because in every case the code was
 * fine and the served page was not.
 *
 * ============================================================================
 * THE THREE STATES, AND WHY THERE ARE THREE RATHER THAN TWO
 * ============================================================================
 *
 *   pass   observed, and correct.
 *   fail   observed, and wrong. This is a P1 with the exact page and the exact
 *          observation, which is what the item asks for.
 *   blind  NOT OBSERVED, with the reason. A sold-out state cannot be seen on a
 *          catalogue that contains no sold-out event; saying so is honest and
 *          saying "pass" would be a lie that compounds.
 *
 * A `blind` is REPORTED, loudly, and is never counted as a pass. It is the
 * shape that keeps this spec from quietly degrading into a row of green ticks
 * as production changes underneath it.
 *
 * ============================================================================
 * EVERY CHECK IS PURE
 * ============================================================================
 *
 * A check takes a SNAPSHOT (what production served, already fetched) and
 * returns a verdict. It performs no I/O. That is what makes acceptance line 2
 * possible: "A test proves the check fails when a known good page is altered to
 * violate one line, once per line." A test builds a good snapshot, breaks one
 * thing, and asserts that exactly that line goes red. An impure check could
 * only be tested against the live internet, which is to say not tested at all.
 *
 * The fetching lives in `scripts/ops/parity-check.mjs`.
 */

/**
 * THE SNAPSHOT SHAPE, written down because two files and a test all build one.
 *
 * @typedef {{ src: string, alt: string|null, width: number, height: number, ariaHidden: boolean }} SnapImage
 * @typedef {{
 *   status: number,
 *   url: string,
 *   title: string|null,
 *   canonical: string|null,
 *   metaRobots: string|null,
 *   h1s: string[],
 *   text: string,
 *   html: string,
 *   jsonLd: object[],
 *   images: SnapImage[],
 *   hasAddToCalendar: boolean,
 *   hasAccessibilitySection: boolean,
 *   error?: string,
 * }} SnapPage
 * @typedef {{
 *   site: string,
 *   at: string,
 *   sitemap: { status: number, urls: string[], error?: string },
 *   pages: Record<string, SnapPage>,
 *   probes: Record<string, number>,
 *   leafEventUrl: string|null,
 *   soldOutEventUrl: string|null,
 *   pastEventUrl: string|null,
 * }} Snapshot
 */

const pass = (observation, page) => ({ state: 'pass', observation, page: page ?? null })
const fail = (observation, page) => ({ state: 'fail', observation, page: page ?? null })
const blind = (observation, page) => ({ state: 'blind', observation, page: page ?? null })

/** The page record, or null when the run never fetched it. */
function page(snap, url) {
  return url ? (snap.pages?.[url] ?? null) : null
}

/** The leaf event page every buyer-facing line is judged on. */
function leaf(snap) {
  return page(snap, snap.leafEventUrl)
}

/**
 * THE FIFTEEN LINES, IN THE OWNER'S OWN ORDER AND HIS OWN WORDS.
 *
 * `line` is quoted verbatim from close-out PARITY1 step 1.
 *
 * THE GUARD DOES NOT READ THE CLOSE-OUT, and that is a decision rather than an
 * oversight. `CLOSE-OUT.md` lives outside the repository, so a build-time script
 * that read it would be the fifth deployment lost to exactly that mistake
 * (`.vercelignore` records the first four). `scripts/guards/parity-spec-complete.mjs`
 * reads THIS list instead and requires every entry to carry a real check.
 *
 * Which makes this list, and not a document, the record of what the platform has
 * promised itself. PARITY1's reversal condition says so: "the job can be
 * disabled by configuration but the specification cannot be deleted, because the
 * specification is the record of what the platform has promised itself."
 */
/**
 * The Event JSON-LD offers on a page, or an empty list.
 *
 * One reader, so a line that needs a PRICE asks the structured data rather than
 * the prose. The block is guaranteed on a published leaf event page by
 * close-out SEO1 v2 and its guard, and its prices resolve to database values.
 */
export function eventOffers(page) {
  for (const block of page?.jsonLd ?? []) {
    if (!block || block['@type'] !== 'Event') continue
    const offers = block.offers
    if (Array.isArray(offers)) return offers
    if (offers && typeof offers === 'object') return [offers]
  }
  return []
}

export const PARITY_LINES = [
  {
    id: 'structured-data-on-a-leaf-url',
    line: 'correct structured data on a leaf URL',
    why: 'This is the exact defect the owner found on 13 September. Google reads the leaf, not the listing.',
    check(snap) {
      const p = leaf(snap)
      if (!p) return blind('no leaf event URL was found in the sitemap to judge')
      const events = (p.jsonLd ?? []).filter(b => b['@type'] === 'Event' || b['@type']?.includes?.('Event'))
      if (events.length === 0) {
        return fail('the leaf event page emits no Schema.org Event block at all', p.url)
      }
      const e = events[0]
      const missing = ['name', 'startDate', 'location', 'offers'].filter(k => !e[k])
      if (missing.length > 0) {
        return fail(`the Event block is missing ${missing.join(', ')}`, p.url)
      }
      // An empty string is worse than an absent property: it is a claim that
      // the value is nothing. Google reports it as an error rather than a gap.
      const blanks = []
      const walk = (node, path) => {
        if (node === null || node === undefined) return
        if (typeof node === 'string') {
          if (node.trim() === '') blanks.push(path)
          return
        }
        if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`))
        if (typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
        }
      }
      walk(e, '')
      if (blanks.length > 0) {
        return fail(`the Event block carries empty string(s) at ${blanks.slice(0, 4).join(', ')}`, p.url)
      }
      return pass(`Event block complete: ${e.name}`, p.url)
    },
  },

  {
    id: 'sitemap-only-indexable',
    line: 'a live sitemap containing only indexable pages',
    why: 'A sitemap advertising a noindex page is a contradiction Search Console reports back as an exclusion.',
    check(snap) {
      if (!snap.sitemap || snap.sitemap.status !== 200) {
        return fail(`the sitemap answered ${snap.sitemap?.status ?? 'nothing'}`, `${snap.site}/sitemap.xml`)
      }
      if ((snap.sitemap.urls ?? []).length === 0) {
        return fail('the sitemap is empty', `${snap.site}/sitemap.xml`)
      }
      const judged = (snap.sitemap.urls ?? []).map(u => page(snap, u)).filter(Boolean)
      if (judged.length === 0) return blind('no sitemap URL was fetched to judge')
      const dead = judged.filter(p => p.status !== 200)
      if (dead.length > 0) {
        return fail(`${dead.length} sitemap URL(s) do not answer 200, first: ${dead[0].url} (${dead[0].status})`, dead[0].url)
      }
      const noindex = judged.filter(p => /noindex/i.test(p.metaRobots ?? ''))
      if (noindex.length > 0) {
        return fail(`${noindex.length} sitemap URL(s) carry noindex, first: ${noindex[0].url}`, noindex[0].url)
      }
      const queryStrings = (snap.sitemap.urls ?? []).filter(u => u.includes('?'))
      if (queryStrings.length > 0) {
        return fail(`${queryStrings.length} sitemap URL(s) are query strings, first: ${queryStrings[0]}`, queryStrings[0])
      }
      return pass(`${judged.length} of ${snap.sitemap.urls.length} sitemap URL(s) fetched, all 200 and all indexable`)
    },
  },

  {
    id: 'guest-checkout',
    line: 'guest checkout',
    why: 'A buyer forced to make an account before they can pay is a buyer a competitor keeps.',
    check(snap) {
      const p = leaf(snap)
      if (!p) return blind('no leaf event URL was found to judge')
      // What is observable anonymously is whether the ticket panel offers a
      // purchase or demands an account first. Completing a purchase on
      // production is not something this check will ever do.
      if (/sign in to buy|log in to buy|create an account to (buy|book)/i.test(p.text)) {
        return fail('the event page demands an account before a buyer can pay', p.url)
      }
      if (!/checkout|get tickets|join the waitlist|register|tickets not yet on sale|sold out/i.test(p.text)) {
        return blind('the event page offers no ticket control to judge, so the sale path cannot be seen', p.url)
      }
      return pass('the event page offers a ticket control and demands no account first', p.url)
    },
  },

  {
    id: 'wallet-payment-methods',
    line: 'Apple Pay and Google Pay',
    why: 'Humanitix enables both by default; Eventbrite does not document Apple Pay at all. Two click payment is the cheapest conversion on the list.',
    check(snap) {
      const p = leaf(snap)
      if (!p) return blind('no leaf event URL was found to judge')
      // Read out of the page TEXT rather than a marked-up element. The
      // question this line asks is "does the page NAME these to a buyer", and a
      // testid added to the component for a checker's convenience would be a
      // second thing to keep in step for no extra truth.
      const text = (p.text ?? '').toLowerCase()
      const apple = text.includes('apple pay')
      const google = text.includes('google pay')
      if (apple && google) return pass('the event page names Apple Pay and Google Pay', p.url)
      const absent = [!apple && 'Apple Pay', !google && 'Google Pay'].filter(Boolean)
      return fail(`the event page does not name ${absent.join(' or ')}`, p.url)
    },
  },

  {
    id: 'wallet-pass',
    line: 'wallet pass',
    why: 'A ticket that cannot go into the phone wallet is a ticket somebody has to find an email for at the door.',
    check(snap) {
      // Judged by probing for a route that serves one. `/tickets` is called the
      // wallet in this product's own copy and is a LIST OF TICKETS, not a pass.
      const probes = Object.entries(snap.probes ?? {}).filter(([path]) => /pkpass|wallet/i.test(path))
      if (probes.length === 0) return blind('no wallet-pass route was probed')
      const served = probes.filter(([, status]) => status === 200)
      if (served.length === 0) {
        return fail(
          `no wallet pass exists: ${probes.map(([p, s]) => `${p} answered ${s}`).join(', ')}`,
          `${snap.site}/tickets`,
        )
      }
      return pass(`a wallet pass is served at ${served[0][0]}`)
    },
  },

  {
    id: 'all-in-pricing',
    line: 'all in pricing with a full breakdown',
    why: 'The Australian Consumer Law position on drip pricing, and the second defect the owner found on 13 September.',
    check(snap) {
      const p = leaf(snap)
      if (!p) return blind('no leaf event URL was found to judge')
      if (/sold out|tickets not yet on sale|this event has ended/i.test(p.text)) {
        return blind('the leaf event has no purchasable ticket, so there is no price to judge', p.url)
      }
      /*
       * A FREE EVENT HAS NOTHING TO BREAK DOWN, AND THIS LINE USED TO FAIL ON IT
       * FOR EVER.
       *
       * "Free events are free. $0, no fees, same as every competitor"
       * (CLAUDE.md, the locked fee structure), and the calculator short-circuits
       * a zero-subtotal cart before any fee is applied. So a free event's page
       * correctly shows no fee line, and demanding one is demanding the platform
       * say something untrue.
       *
       * Found on 14 September 2026 running this check against a tree whose only
       * leaf event was free: the line read "no ticket price on the page shows
       * its fee breakdown" and nothing the platform could do would clear it. A
       * line that is red for months on correct behaviour is a line somebody
       * stops reading, which costs the other fourteen.
       *
       * The signal is the Event JSON-LD offers rather than the page text,
       * because a price is a number and a word like "Free" appears on a page for
       * half a dozen unrelated reasons. SEO1 v2 guarantees the block is there
       * and that its prices come from the database.
       */
      const offers = eventOffers(p)
      if (offers.length > 0 && offers.every(o => Number(o.price) === 0)) {
        return blind('every ticket on the leaf event is free, so there is no fee to break down', p.url)
      }
      const hasBreakdown = /ticket plus .* fee|fee included in the ticket price/i.test(p.text)
      if (!hasBreakdown) {
        return fail('no ticket price on the page shows its fee breakdown', p.url)
      }
      return pass('every ticket price shows the total and its breakdown', p.url)
    },
  },

  {
    id: 'add-to-calendar',
    line: 'add to calendar',
    why: 'An event nobody has put in their calendar is an event a proportion of the room forgets.',
    check(snap) {
      const p = leaf(snap)
      if (!p) return blind('no leaf event URL was found to judge')
      if (!p.hasAddToCalendar) {
        return fail('the event page offers no way to add the event to a calendar', p.url)
      }
      return pass('the event page carries an add to calendar control', p.url)
    },
  },

  {
    id: 'sold-out-state',
    line: 'a deliberate sold out state',
    why: 'A sold-out event that still offers a buy control walks a buyer into a refusal.',
    check(snap) {
      const p = page(snap, snap.soldOutEventUrl)
      if (!p) return blind('no sold-out event exists on production to observe')
      if (!/sold out/i.test(p.text)) {
        return fail('a sold-out event does not say so on its page', p.url)
      }
      if (/^(buy|checkout|get tickets)/im.test(p.text)) {
        return fail('a sold-out event still offers a buy control', p.url)
      }
      return pass('the sold-out event says so and offers no buy control', p.url)
    },
  },

  {
    id: 'past-event-state',
    line: 'a deliberate past event state',
    why: 'A finished event whose URL answers 404 is a dead link on every share of it, and a customer-service question with nowhere to land.',
    check(snap) {
      const p = page(snap, snap.pastEventUrl)
      if (!p) return blind('no past event URL is reachable to observe')
      if (p.status !== 200) {
        return fail(`a past event's URL answers ${p.status}; docs/EVENT-LIFECYCLE.md says it is a full page with a past banner`, p.url)
      }
      if (!/this event has ended/i.test(p.text)) {
        return fail('a past event renders without an ended banner', p.url)
      }
      return pass('the past event answers 200 with an ended banner', p.url)
    },
  },

  {
    id: 'accessibility-published',
    line: 'accessibility fields',
    why: 'A disabled attendee needs the answer before they buy, and every incumbent publishes it.',
    check(snap) {
      const judged = Object.values(snap.pages ?? {}).filter(p => /\/events\/|\/venues\//.test(p.url))
      if (judged.length === 0) return blind('no event or venue page was fetched to judge')
      const withSection = judged.filter(p => p.hasAccessibilitySection)
      if (withSection.length === 0) {
        /*
         * SAID SO THAT IT IS READ CORRECTLY. The section is built and it renders
         * only when an organiser has filled the fields, deliberately: "show it
         * only when filled, a blank section is worse than none" (close-out SEO5
         * step 4). So this FAIL is about what a visitor can see today, never
         * about a missing capability, and the sentence has to carry that or the
         * owner reads a content gap as an unbuilt feature.
         */
        return fail(
          `no accessibility information is published on any of the ${judged.length} event or venue page(s) served; ` +
            'the section is built and appears once an organiser fills the fields, so this is an empty catalogue rather ' +
            'than a missing surface',
          judged[0].url,
        )
      }
      return pass(`${withSection.length} of ${judged.length} event or venue page(s) publish accessibility information`, withSection[0].url)
    },
  },

  {
    id: 'attendee-data-ownership',
    line: 'attendee data export',
    why: 'One of the two blades of the wedge. It is worth nothing as a capability nobody is told about.',
    check(snap) {
      // The EXPORT itself is behind an organiser login and this check never
      // signs in to production. What IS public, and what the constitution
      // requires to be public, is the promise: "an explicit, visible promise on
      // the organiser-facing pages and pitch, stated plainly".
      const candidates = Object.values(snap.pages ?? {}).filter(p =>
        /\/organisers$|\/pricing$|\/legal\/organiser-terms$/.test(p.url),
      )
      if (candidates.length === 0) return blind('no organiser-facing page was fetched to judge')
      const promise = candidates.find(p =>
        /(own|owns|ownership of).{0,40}(attendee|customer).{0,20}(data|relationship|list)|attendee data.{0,30}(yours|you own|export)|export .{0,20}attendee/i.test(
          p.text,
        ),
      )
      if (!promise) {
        return fail(
          `no organiser-facing page states the attendee data ownership promise (checked ${candidates.map(p => new URL(p.url).pathname).join(', ')})`,
          candidates[0].url,
        )
      }
      return pass('the attendee data ownership promise is published', promise.url)
    },
  },

  {
    id: 'published-payout-time',
    line: 'a published payout time',
    why: 'An organiser deciding where to sell asks when they get paid. A platform that will not say is a platform they do not pick.',
    check(snap) {
      const candidates = Object.values(snap.pages ?? {}).filter(p =>
        /\/legal\/organiser-terms$|\/organisers$|\/pricing$|\/help\//.test(p.url),
      )
      if (candidates.length === 0) return blind('no organiser-facing page was fetched to judge')
      const stated = candidates.find(p =>
        /\b\d+\s+(business\s+)?days?\b[^.]{0,60}(after|following)[^.]{0,40}event/i.test(p.text),
      )
      if (!stated) {
        return fail(
          `no public page states how long after an event an organiser is paid (checked ${candidates.map(p => new URL(p.url).pathname).join(', ')})`,
          candidates[0].url,
        )
      }
      return pass('the payout window is published', stated.url)
    },
  },

  {
    id: 'alt-text-on-content-images',
    line: 'alt text on every content image',
    why: 'A content image with no alt is invisible to a screen reader and to an image search.',
    check(snap) {
      const judged = Object.values(snap.pages ?? {}).filter(p => p.status === 200 && (p.images ?? []).length > 0)
      if (judged.length === 0) return blind('no page with a content image was fetched to judge')

      /*
       * A MISSING alt AND AN EMPTY alt ARE DIFFERENT THINGS, AND THE FIRST
       * VERSION OF THIS CHECK TREATED THEM AS ONE.
       *
       * It reported three failures on its very first production run. All three
       * were `alt=""`, which is the CORRECT markup for a decorative image and
       * is what a screen reader needs in order to skip it: every one was the
       * ken-burns AMBIENT LAYER that `HeroMedia` mounts on top of the hero
       * raster, and the raster underneath it carries the real alt text. The
       * check was wrong and the pages were right.
       *
       * Three invented P1s in a report of six would have cost this check its
       * credibility on the day it was introduced, which is worse than not
       * having it.
       *
       * So: a MISSING attribute fails, because a screen reader then announces
       * the filename. An EMPTY one is COUNTED AND REPORTED but never failed,
       * because nothing observable from outside distinguishes a correctly
       * decorative image from a content image somebody hid. Saying what it can
       * and cannot see is the whole design of this spec.
       */
      const missing = []
      let declaredDecorative = 0
      for (const p of judged) {
        for (const img of p.images) {
          if (img.ariaHidden) continue
          if (img.width < 24 || img.height < 24) continue
          if (img.alt === null || img.alt === undefined) missing.push({ url: p.url, src: img.src })
          else if (img.alt.trim() === '') declaredDecorative += 1
        }
      }
      if (missing.length > 0) {
        // THE PAGE COLUMN NAMES THE OFFENDER'S PAGE, not the first page that
        // happened to be judged. The first run of this check reported an image
        // on /organisers while pointing the reader at the homepage, which is
        // the shape of report that sends somebody to the wrong file.
        const first = missing[0]
        return fail(
          `${missing.length} content image(s) carry NO alt attribute at all, first: ${first.src.slice(0, 90)}`,
          first.url,
        )
      }
      const total = judged.reduce((n, p) => n + p.images.length, 0)
      const decorative = declaredDecorative > 0 ? `, ${declaredDecorative} declared decorative with alt=""` : ''
      return pass(`${total} image(s) across ${judged.length} page(s), every one carries an alt attribute${decorative}`)
    },
  },

  {
    id: 'unique-title-canonical-h1',
    line: 'unique title canonical and H1 per indexable page type',
    why: 'Two page types sharing a title is two pages competing for the same result, and Google picks neither.',
    check(snap) {
      const judged = Object.values(snap.pages ?? {}).filter(p => p.status === 200 && !/noindex/i.test(p.metaRobots ?? ''))
      if (judged.length < 2) return blind('fewer than two indexable pages were fetched, so uniqueness cannot be judged')

      const missing = judged.filter(p => !p.title || !p.canonical || (p.h1s ?? []).length === 0)
      if (missing.length > 0) {
        const p = missing[0]
        const what = [!p.title && 'title', !p.canonical && 'canonical', (p.h1s ?? []).length === 0 && 'h1'].filter(Boolean)
        return fail(`${missing.length} indexable page(s) are missing a ${what.join(', ')}, first: ${p.url}`, p.url)
      }
      const manyH1 = judged.filter(p => p.h1s.length > 1)
      if (manyH1.length > 0) {
        return fail(`${manyH1.length} page(s) carry more than one H1, first: ${manyH1[0].url}`, manyH1[0].url)
      }
      const seen = new Map()
      for (const p of judged) {
        const key = p.title.trim().toLowerCase()
        if (seen.has(key)) {
          return fail(`two indexable pages share the title "${p.title}": ${seen.get(key)} and ${p.url}`, p.url)
        }
        seen.set(key, p.url)
      }
      const selfCanonical = judged.filter(p => {
        try {
          return new URL(p.canonical, snap.site).pathname !== new URL(p.url).pathname
        } catch {
          return true
        }
      })
      if (selfCanonical.length > 0) {
        const p = selfCanonical[0]
        return fail(`${selfCanonical.length} page(s) canonicalise elsewhere, first: ${p.url} -> ${p.canonical}`, p.url)
      }
      return pass(`${judged.length} indexable page(s), every title unique and every canonical its own URL`)
    },
  },

  {
    id: 'no-query-string-only-discovery',
    line: 'no category or discovery page reachable only as a query string',
    why: 'A query string is not a page. Twenty-two categories existed only as a filter until close-out SEO3.',
    check(snap) {
      const probes = Object.entries(snap.probes ?? {}).filter(([path]) => path.startsWith('/categories/'))
      if (probes.length === 0) return blind('no category page was probed')
      const dead = probes.filter(([, status]) => status !== 200)
      if (dead.length > 0) {
        return fail(
          `${dead.length} category page(s) do not answer 200, first: ${dead[0][0]} (${dead[0][1]})`,
          `${snap.site}${dead[0][0]}`,
        )
      }
      const inSitemap = (snap.sitemap?.urls ?? []).filter(u => u.includes('?'))
      if (inSitemap.length > 0) {
        return fail(`the sitemap advertises ${inSitemap.length} query-string URL(s), first: ${inSitemap[0]}`, inSitemap[0])
      }
      return pass(`${probes.length} category page(s) are real pages, and no sitemap URL is a query string`)
    },
  },
]

/** Run every line against a snapshot. Pure, so a test can drive it. */
export function judgeParity(snapshot) {
  return PARITY_LINES.map(entry => {
    let verdict
    try {
      verdict = entry.check(snapshot)
    } catch (error) {
      // A check that throws is a BLIND, never a pass. A crash in one line must
      // not be able to report the platform as compliant on that line.
      verdict = blind(`the check threw: ${error.message}`)
    }
    return { id: entry.id, line: entry.line, why: entry.why, ...verdict }
  })
}

/** The one-line summary the owner digest carries. */
export function parityHeadline(results) {
  const passed = results.filter(r => r.state === 'pass').length
  const failed = results.filter(r => r.state === 'fail')
  const blinded = results.filter(r => r.state === 'blind').length
  const worst = failed[0]
  const parts = [`${passed} passed`, `${failed.length} failed`]
  if (blinded > 0) parts.push(`${blinded} not observed`)
  const head = `Parity: ${parts.join(', ')}`
  return worst ? `${head}. Worst: ${worst.line} - ${worst.observation}` : `${head}.`
}

/** The markdown block written to REVIEW-QUEUE-C.md. */
export function renderParityReport(results, { site, at }) {
  const failed = results.filter(r => r.state === 'fail')
  const blinded = results.filter(r => r.state === 'blind')
  const lines = []
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`## PARITY CHECK, ${at}. ${parityHeadline(results)}`)
  lines.push('')
  lines.push(`Run against **${site}**, which is production. Every verdict below is`)
  lines.push('an observation of what production actually served, never a reading of')
  lines.push('the repository: all three defects this check exists for had correct code')
  lines.push('and a wrong page.')
  lines.push('')
  lines.push('| Line | Verdict | Observation | Page |')
  lines.push('|---|---|---|---|')
  for (const r of results) {
    const mark = r.state === 'pass' ? 'PASS' : r.state === 'fail' ? '**FAIL**' : 'not observed'
    const page = r.page ? `\`${r.page}\`` : ''
    lines.push(`| ${r.line} | ${mark} | ${r.observation} | ${page} |`)
  }
  lines.push('')
  if (failed.length > 0) {
    lines.push(`### ${failed.length} P1 item(s), each with the exact page and the exact observation`)
    lines.push('')
    for (const r of failed) {
      lines.push(`**P1: ${r.line}.** ${r.observation}`)
      lines.push('')
      lines.push(`- Page: ${r.page ?? '(no single page)'}`)
      lines.push(`- Why it is table stakes: ${r.why}`)
      lines.push('')
    }
  } else {
    lines.push('No failures. Nothing to raise.')
    lines.push('')
  }
  if (blinded.length > 0) {
    lines.push(`### ${blinded.length} line(s) could not be observed, and that is reported rather than passed`)
    lines.push('')
    for (const r of blinded) lines.push(`- **${r.line}**: ${r.observation}`)
    lines.push('')
  }
  return lines.join('\n')
}
