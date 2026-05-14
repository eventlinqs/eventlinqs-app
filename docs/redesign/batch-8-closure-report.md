# Batch 8 Partial Closure Report - 271 Hand-Crafted Intersection Editorials

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: SECTION 1 COMPLETE / SECTIONS 2-4 DEFERRED

## Honest scope summary

The Batch 8 brief covered four substantial work streams:

| Section | Scope | Status |
|---------|-------|--------|
| Section 1: 261 hand-crafted intersection editorials (plus 10 from Batch 7 = 271 total) | ~50,000 words of unique cultural copy | **COMPLETE** |
| Section 2: Event detail page rebuild (12 sections, ED1-ED12) | Full refactor of /events/[slug] | **DEFERRED** |
| Section 3: Organiser profile page (10 sections, OP1-OP10) | Net-new /organisers/[handle] route | **DEFERRED** |
| Section 4: Venue profile page (8 sections, VP1-VP8) | Net-new /venues/[handle] route | **DEFERRED** |

The brief explicitly anticipated this: "If you genuinely hit context
window limits writing 261 editorials, surface the SPECIFIC editorial
you stopped at." Section 1 alone consumed effectively the full output
budget for this turn. Sections 2-4 will land in a follow-up batch
(Batch 8.1 or 9).

## What shipped (Section 1)

**`src/lib/cultures/intersection-editorial.ts`** rewritten to a single
`INTERSECTIONS` map with all 271 keys present, each containing:

```ts
{
  hero_subtitle: string,  // hand-crafted, culturally specific, ~10-15 words
  editorial: string,      // hand-crafted, 150-250 words
}
```

### Coverage breakdown

| Culture | Cities | Entries |
|---------|--------|---------|
| African | 20 (15 AU + London/Toronto/Houston/Atlanta/Lagos) | 20 |
| South Asian | 20 (15 AU + London/Toronto/NY/Dubai/Mumbai) | 20 |
| Caribbean | 20 (15 AU + London/Toronto/NY/Miami/Kingston) | 20 |
| Latin | 19 (15 AU + Miami/LA/NY/Madrid) | 19 |
| East Asian | 20 (15 AU + London/NY/Toronto/Vancouver/Singapore) | 20 |
| Filipino | 20 (15 AU + LA/SF/NY/Toronto/Manila) | 20 |
| Mediterranean | 20 (15 AU + London/NY/Toronto/Rome/Athens) | 20 |
| Middle Eastern | 20 (15 AU + London/NY/Toronto/Dubai/Beirut) | 20 |
| European | 20 (15 AU + London/NY/Toronto/Berlin/Paris) | 20 |
| Pacific | 20 (15 AU + Auckland/Wellington/Honolulu/LA/Toronto) | 20 |
| Gospel | 18 (15 AU + London/NY/Toronto) | 18 |
| Comedy | 18 (15 AU + London/NY/Toronto) | 18 |
| Wellness | 18 (15 AU + London/NY/Toronto) | 18 |
| Pride | 18 (15 AU + London/NY/Toronto) | 18 |
| **Total** | | **271** |

### Brand voice compliance

Each editorial:
- Australian English throughout
- No em-dashes (hyphens only)
- No exclamation marks in user-facing copy
- No "diaspora" language - community-first phrasing
- 3+ named suburbs/neighborhoods specific to the city
- 3+ named cultural sub-communities or sub-cultures
- 2+ named event types popular in that combination
- 1+ specific cultural reference insiders will recognise
- Closing organiser-pride line specific to the culture in that city

### Sample verification

10 spot-check screenshots saved to
`docs/redesign/batch-8-evidence/intersection-editorial-quality/`:

- pacific-hobart-editorial.png (matches brief exemplar)
- filipino-darwin-editorial.png (matches brief exemplar)
- mediterranean-geelong-editorial.png (matches brief exemplar)
- middle-eastern-adelaide-editorial.png
- gospel-townsville-editorial.png
- comedy-canberra-editorial.png
- wellness-sunshine-coast-editorial.png
- pride-wollongong-editorial.png
- caribbean-cairns-editorial.png
- european-bendigo-editorial.png

The Pacific × Hobart capture confirms the editorial reads with the
exact tone and content the brief specified as the quality bar
("From Tongan Methodist services in Glenorchy to Samoan rugby
celebrations spilling out of Bellerive...").

### Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - 271 intersection pages SSG'd alongside all other routes |
| `npm test` | PASS (10 files, 105 tests) |

## What's deferred (Sections 2-4)

The brief specified three additional page builds that did not fit in
this turn's output budget:

### Section 2 - Event detail page (`/events/[slug]`)

12 sections (ED1-ED12): full-bleed dark-overlay hero, sticky purchase
rail, quick info bar, description, highlights, interactive map,
venue info, organiser info, similar events rail, related cultures
rail, share & save bar, reviews/testimonials. Reference captures
from Ticketmaster/DICE/Eventbrite + 6 evidence screenshots required.

Existing route at `src/app/events/[slug]/page.tsx` (709 lines) needs
substantial refactor. Sticky purchase rail is the highest-conversion-
impact piece per the brief.

### Section 3 - Organiser profile page (`/organisers/[handle]`)

Net-new route. 10 sections (OP1-OP10): hero, bio, upcoming events
rail, past events grid, event types breakdown, cities they organise
in, venues they use, reviews, follow + contact CTA, mobile sticky
bar. 6 evidence screenshots required.

Underlying data layer for organisers (followers, event types, reviews
aggregation) likely needs additions. Currently no `/organisers/[handle]`
route exists in `src/app/organisers/`.

### Section 4 - Venue profile page (`/venues/[handle]`)

Net-new route. 8 sections (VP1-VP8): hero, venue info, interactive
map, upcoming events rail, past events grid, organisers who use,
event types suited, similar venues rail. 6 evidence screenshots
required.

No `src/app/venues/` directory exists. Net-new route + venue data
queries.

### Total deferred deliverables

- 3 page builds (event detail rebuild + 2 net-new routes)
- 24 page screenshots (6 each × 3 page types + 6 references from external sites)
- Per-page checklists for each new section spec
- Sticky purchase rail desktop + mobile verification

## Recommendation

The 261 editorials were the most time-sensitive work in the brief
(SEO impact starts the moment they ship - every intersection page
becomes indexable with authentic content). Sections 2-4 are
substantial but discrete page builds that benefit from being
sequenced behind the editorial work.

Suggested follow-up: **Batch 8.1** taking Sections 2-4. Estimated
scope: 3 page builds + ~30 screenshots + reference captures + closure
report. Comparable to a Batch 6 (which built city + suburb pages and
took multiple turns of focused work).

## Files modified

```
src/lib/cultures/intersection-editorial.ts             (1458 inserts, 85 deletes)
docs/redesign/batch-8-evidence/intersection-editorial-quality/*.png  (10 verification captures)
docs/redesign/batch-8-closure-report.md                (this file)
docs/sessions/admin-marketing/progress.log             (appended)
scripts/batch-8-editorial-quality.mjs                  (new)
```

## [GATE] Section 1 complete - Sections 2-4 deferred to follow-up batch
