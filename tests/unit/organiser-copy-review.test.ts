import { describe, it, expect } from 'vitest'
import { writeProofArtefact } from '../helpers/proof-artefact'
import fs from 'node:fs'
import path from 'node:path'
import { buildDeterministicDraft, type MagicStartDraft } from '@/lib/ai/magic-start'
import { findCopyTells } from '@/lib/ai/copy-tells'

/**
 * OUTPUT REVIEW, the organiser-copy half. Founder ruling 3.
 *
 * WHY THIS EXISTS, in the predecessor's own words: "Reading real output found
 * six defects this session that tests did not: three in the digest email, three
 * in the harness itself. Every single one passed its tests."
 *
 * That is the whole argument. A test asserts what somebody thought to assert.
 * It cannot tell you that the summary reads like a machine wrote it, that the
 * title is the organiser's sentence cut mid-clause, that the tags are three
 * spellings of one word, or that a field the organiser now has to fill in by
 * hand was silently left empty. Only a human reading the output catches those,
 * and a human will only read it if it is put in front of them.
 *
 * The digest half already exists (`/api/cron/weekly-digest?preview_to=` renders
 * the mail and sends nothing, and it found three defects). This is the half
 * that was missing.
 *
 * IT LIVES IN THE TEST SUITE ON PURPOSE. The ruling says the copy should be
 * dumped "on every run". A standalone script only runs when somebody remembers;
 * this runs on every `npm test` and rewrites
 * docs/roast/organiser-copy/OUTPUT.md, so the current output is always sitting
 * in the repo to be read and always shows up in a diff when it changes.
 * (`server-only` is a build-time marker with no package behind it, which is
 * exactly why this cannot be a plain node script.)
 *
 * WHAT IT COVERS. The DETERMINISTIC floor, which is what every organiser
 * actually gets whenever the model is unconfigured, over budget, or fails. That
 * is the path least likely to be looked at and most likely to be shipped. The
 * model path stays BLOCKED on ANTHROPIC_API_KEY (R5 and F6 in the ledger).
 *
 * The assertions below are the machine-checkable FLOOR and are deliberately
 * modest. They are not the point. The point is OUTPUT.md.
 */

const CATEGORY_NAMES = [
  'Music', 'Sports', 'Arts & Community', 'Food & Drink', 'Business & Networking',
  'Education', 'Charity', 'Nightlife', 'Family', 'Technology', 'Religion',
  'Fashion', 'Health & Wellness', 'Community', 'Festival', 'Film', 'Comedy', 'Other',
]
const COMMUNITY_SLUGS = [
  'aboriginal-torres-strait-islander', 'african', 'caribbean', 'chinese', 'filipino',
  'greek', 'indian', 'indonesian', 'italian', 'japanese', 'korean', 'latin-american',
  'lebanese', 'maori', 'nepalese', 'pacific-pasifika', 'south-sudanese', 'sri-lankan',
  'turkish', 'vietnamese', 'irish',
]

/**
 * Realistic organiser inputs, written the way organisers really type.
 *
 * The awkward ones are the point. A fixture set of clean, complete paragraphs
 * would print beautifully and prove nothing, because the failure modes live in
 * the messy inputs: one line, no date, no price, a wall of text, a weekday that
 * disagrees with its own date, and copy already written in the exact voice the
 * anti-tell gate exists to reject.
 */
const INPUTS: { label: string; text: string }[] = [
  {
    label: 'Complete and well written (the easy case)',
    text: "Naarm Soul Sessions returns to Northcote Town Hall on Saturday 14 March 2026 at 8pm. A six-piece live band, two DJs and a late set from Melbourne's own Kaiit. Tickets are $45 general admission, $75 for the front-bar table. Doors 7:30pm, 18+. Capacity 400.",
  },
  {
    label: 'One line, almost no facts (the common case)',
    text: 'comedy night at the pub',
  },
  {
    label: 'No date and no price stated',
    text: 'A Sunday afternoon of Afrobeats and Amapiano in the park with food trucks, face painting for the kids and a lineup of Melbourne DJs. Family friendly, everyone welcome.',
  },
  {
    label: 'A wall of text with the facts buried',
    text: "So we have been running this thing for about four years now and every time it gets bigger which is amazing honestly. This year we are back at the Wool Exchange in Geelong on Friday 20 February 2026 doors at 7 and the first act is on at 8. We have three bands confirmed plus a DJ til late. Early bird is $28 and then it goes to $35 on the door. Last year sold out so get in early. There will be food, the bar is open all night, and it is over 18s only sorry. Capacity is 300.",
  },
  {
    label: 'Free community event with a heritage signal',
    text: 'Free Diwali celebration at Federation Square on 8 November 2026, 5pm to 10pm. Rangoli, dance performances, a food market and fireworks at 9. All ages, no ticket needed, just turn up.',
  },
  {
    label: 'A workshop, a format with no tag anywhere in the catalogue',
    text: 'Introduction to screen printing, a hands-on three hour workshop at our Brunswick studio on 5 April 2026 from 10am. All materials included, maximum 12 people, $120 per person.',
  },
  {
    label: 'Sport, with a weekday that disagrees with the date',
    text: 'Grand final day at Kardinia Park on Monday 26 September 2026. Gates open 11am, bounce at 2:30pm. Reserved seating from $55, general admission $30.',
  },
  {
    label: 'Written in marketing language (the anti-tell trap)',
    text: 'Unlock an unforgettable evening and dive into a curated journey through sound. Join us as we elevate the night and celebrate community at the heart of it all.',
  },
]

const NOW_ISO = '2026-02-01T09:00:00.000Z'

function draftFor(text: string): MagicStartDraft {
  return buildDeterministicDraft({
    description: text,
    categoryNames: CATEGORY_NAMES,
    communitySlugs: COMMUNITY_SLUGS,
    nowIso: NOW_ISO,
  })
}

/**
 * The machine-checkable floor. Never the point, never optional either.
 *
 * WHAT COUNTS AS THE TOOL'S FAULT, which the first version of this got wrong
 * in both directions and had to be corrected by reading its own output:
 *
 *   - `description` is the ORGANISER'S OWN TEXT passed through. A marketing
 *     word in it is their writing, not ours, and flagging it is crying wolf.
 *     `title` is different: the tool CHOOSES it (the opening clause), so a tell
 *     surviving there is the tool publishing that voice as its own.
 *   - an empty `summary` is a genuine C2 breach ONLY when the tool has not
 *     said so. The tool refuses to author a summary that carries a tell and
 *     names the gap in `unresolved`, which is the right call on a collision
 *     between "never empty" and "never that voice": the organiser is told.
 *     Declared is not the same as silently blank.
 *   - the same for a tag shortfall. A thin description does not contain four
 *     traceable tags and padding it would invent public discovery metadata.
 */
function lawViolations(draft: MagicStartDraft): string[] {
  const problems: string[] = []
  const authored = [draft.title, draft.summary].filter(Boolean).join('\n')
  const everything = [draft.title, draft.summary, draft.description].filter(Boolean).join('\n')

  const tells = findCopyTells(authored)
  if (tells.length) problems.push(`the tool's OWN copy carries tells: ${tells.join(', ')}`)
  if (/[—–]/.test(everything)) problems.push('contains an em-dash or en-dash')
  if (/!/.test(everything)) problems.push('contains an exclamation mark')
  if (/\bcultur/i.test(everything)) problems.push('contains the banned word')

  if (!draft.title.trim() && !draft.unresolved.includes('Title')) {
    problems.push('title is empty and NOT declared in unresolved')
  }
  if (!draft.summary.trim() && !draft.unresolved.includes('Short summary')) {
    problems.push('summary is empty and NOT declared in unresolved (founder ruling C2)')
  }
  if (!draft.category.trim()) problems.push('category is empty (founder ruling C3)')
  if (draft.tags.length > 8) problems.push(`tags above the 8 cap (${draft.tags.length}) (founder ruling C4)`)
  if (draft.tags.length < 4 && !draft.unresolved.includes('Discovery tags')) {
    problems.push(`only ${draft.tags.length} tags and NOT declared in unresolved (founder ruling C4)`)
  }
  if (draft.tags.some((t) => findCopyTells(t).length > 0)) {
    problems.push('a discovery tag is one of the banned marketing words')
  }
  if (draft.summary.length > 200) problems.push(`summary is ${draft.summary.length} chars, over the 200 cap`)
  if (draft.summary && draft.description.startsWith(draft.summary)) {
    problems.push('summary is a prefix of the description, so it is a truncation and not its own line')
  }
  if (new Set(draft.tags).size !== draft.tags.length) problems.push('tags contain a duplicate')
  return problems
}

describe('organiser copy: the output review', () => {
  it('writes the generated copy out for a human to read', () => {
    const lines: string[] = []
    const out = (s = '') => lines.push(s)

    out('# ORGANISER COPY, as generated. Read it.')
    out('')
    out('Regenerated by `tests/unit/organiser-copy-review.test.ts` on every test run,')
    out('so the current output is always in the repo and always shows up in a diff')
    out('when it changes.')
    out('')
    out('This is the DETERMINISTIC floor: what an organiser actually receives')
    out('whenever the model is unconfigured, over budget, or fails. The model path')
    out('is BLOCKED on ANTHROPIC_API_KEY (R5 and F6).')
    out('')
    out('The inputs are written the way organisers really type. The awkward ones are')
    out('the point: clean paragraphs would print beautifully and prove nothing.')
    out('')
    out('---')

    let violations = 0
    for (const input of INPUTS) {
      const draft = draftFor(input.text)
      out('')
      out(`## ${input.label}`)
      out('')
      out('**The organiser typed:**')
      out('')
      out('> ' + input.text.replace(/\n/g, '\n> '))
      out('')
      out('**The tool produced:**')
      out('')
      out(`- **title**       ${JSON.stringify(draft.title)}`)
      out(`- **summary**     ${JSON.stringify(draft.summary)}`)
      out(`- **category**    ${JSON.stringify(draft.category)}`)
      out(`- **tags**        ${JSON.stringify(draft.tags)}`)
      out(`- **communities** ${JSON.stringify(draft.communities)}`)
      out(`- **start_date**  ${JSON.stringify(draft.start_date)}`)
      out(`- **end_date**    ${JSON.stringify(draft.end_date)}`)
      out(`- **venue_name**  ${JSON.stringify(draft.venue_name)}`)
      out(`- **venue_city**  ${JSON.stringify(draft.venue_city)}`)
      out(`- **is_free**     ${draft.is_free}`)
      out(`- **tiers**       ${JSON.stringify(draft.ticket_tiers)}`)
      out(`- **unresolved**  ${JSON.stringify(draft.unresolved)}`)
      out('')
      const problems = lawViolations(draft)
      violations += problems.length
      if (problems.length) {
        out(`**LAW VIOLATIONS (${problems.length}):**`)
        out('')
        for (const p of problems) out(`- ${p}`)
      } else {
        out('_No machine-checkable law broken. Whether it READS well is the question_')
        out('_this file exists to put in front of you._')
      }
      out('')
      out('---')
    }

    out('')
    out(`${INPUTS.length} inputs, ${violations} machine-checkable violation(s).`)
    out('')
    out('THE POINT IS NOT THE VIOLATION COUNT. Zero here means the copy broke no')
    out('rule anybody thought to write down. It does not mean the copy is good, and')
    out('the defects worth finding are the ones no rule covers: a title cut')
    out('mid-clause, a summary that says nothing, tags that are three spellings of')
    out('one word, a field left empty that the organiser now has to fill by hand.')

    const dir = path.join(process.cwd(), 'docs/roast/organiser-copy')
    writeProofArtefact(path.join(dir, 'OUTPUT.md'), lines.join('\n') + '\n')

    /*
     * ASSERT THE REVIEW, NOT THE FILE. This used to assert that OUTPUT.md
     * exists, which was true on every run for the wrong reason: the file is
     * tracked, so it exists whether or not this test wrote it. Now that the
     * write is gated behind WRITE_PROOF_ARTEFACTS the old assertion would have
     * been checking git rather than the code. Assert what the test produces.
     */
    expect(lines.length).toBeGreaterThan(0)
  })

  describe('the machine-checkable floor, per input', () => {
    it.each(INPUTS.map((i) => [i.label, i.text]))('%s', (_label, text) => {
      const problems = lawViolations(draftFor(text))
      expect(problems, problems.join('; ')).toEqual([])
    })
  })

  it('never turns a banned marketing word into a public discovery tag', () => {
    // Found by reading real output. The last-resort word pass produced
    // ["unlock","unforgettable","evening","curated","journey","through"] for an
    // organiser who wrote in marketing language: junk as discovery metadata,
    // and the exact voice the platform rejects, published as though the
    // platform had chosen it. Tags are permanent and public; this one matters.
    const draft = draftFor(INPUTS[INPUTS.length - 1].text)
    const offending = draft.tags.filter((t) => findCopyTells(t).length > 0)
    expect(offending, `tags: ${JSON.stringify(draft.tags)}`).toEqual([])
  })

  it('files a comedy night under Comedy, now that R1 has given it a category', () => {
    // The rule used to send every comedy night to the performing arts category,
    // with a comment saying that was "the honest best fit until that migration
    // lands". Migration 20260808000004 landed it.
    expect(draftFor('comedy night at the pub').category).toBe('Comedy')
    expect(draftFor('stand up showcase with five comedians').category).toBe('Comedy')
  })

  it('declares a shortfall instead of padding it with words nobody wrote', () => {
    // "comedy night at the pub" does not contain four traceable tags. Inventing
    // them would put the event in front of the wrong people, so the gap is
    // named for the organiser rather than filled.
    const draft = draftFor('comedy night at the pub')
    expect(draft.tags.length).toBeLessThan(4)
    expect(draft.unresolved).toContain('Discovery tags')
    for (const tag of draft.tags) {
      expect('comedy night at the pub'.includes(tag) || tag === 'comedy').toBe(true)
    }
  })
})
