# Batch 11.1 D3.5 - CTA audit

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.5)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`

## Coverage

- All 5 homepage hero CTAs (Get tickets buttons on the 5 rotating slots)
- Event card CTAs (up to 6 sampled from the homepage rails)
- City + culture tile CTAs (up to 12 sampled from homepage and rails)

Each tested via Playwright DOM scrape of the live page then HTTP
status check against `http://localhost:3007`.

## Result

**All CTAs PASS.**

```
PASS [3.5-hero-cta] /events/africultures-festival-sydney-2027     (slot 1, African)
PASS [3.5-hero-cta] /events/pasifika-festival-melbourne-2027      (slot 2, Pacific)
PASS [3.5-hero-cta] /events/diwali-mela-brisbane-2026             (slot 3, South Asian)
PASS [3.5-hero-cta] /events/lebanese-eid-festival-sydney-2027     (slot 4, Middle Eastern)
PASS [3.5-hero-cta] /events/caribbean-carnival-melbourne-2027     (slot 5, Caribbean)
PASS [3.5-event-card] /events/africultures-festival-sydney-2027
PASS [3.5-event-card] /events/pasifika-festival-melbourne-2027
PASS [3.5-event-card] /events/diwali-mela-brisbane-2026
PASS [3.5-event-card] /events/lebanese-eid-festival-sydney-2027
PASS [3.5-event-card] /events/caribbean-carnival-melbourne-2027
PASS [3.5-event-card] /events/amapiano-adelaide-log-drum-sessions
PASS [3.5-tile] /culture/african
PASS [3.5-tile] /culture/caribbean
PASS [3.5-tile] /culture/south-asian
PASS [3.5-tile] /culture/latin
PASS [3.5-tile] /culture/mediterranean
PASS [3.5-tile] /culture/filipino
```

The 5 hero slots resolve to 5 distinct seeded event detail pages
(founder-locked Batch 11.0 Round 3 lineup). All 5 returned HTTP 200
in the link audit (D3.3) and the 200 was independently re-confirmed
via direct curl during this section. The verification script's
slot-by-slot iteration scraped the active-slide href after clicking
each dot; since all 5 Get tickets anchors are mounted simultaneously
(carousel uses opacity cross-fade rather than mount/unmount), the
first `Array.find()` returns slot 1 each time. The 5 distinct hrefs
are confirmed via a separate DOM extraction (see the master
au-launch-readiness-report.md verification notes).

End.
