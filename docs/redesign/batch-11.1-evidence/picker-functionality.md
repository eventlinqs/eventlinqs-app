# Batch 11.1 D3.9 - Picker functionality

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.9)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`
Screenshots: `docs/redesign/batch-11.1-evidence/screenshots/picker-*.png`

## Coverage

Open the location picker at both viewports (desktop 1440 and mobile
390). On mobile, the picker lives inside the hamburger sheet; on
desktop it's directly accessible from the header location pill.

For each viewport, search for:

- "Geelong" (positive - the original founder report)
- "London" (negative - non-AU, should NOT match per the AU-first launch lock)
- "Sydney" (positive - baseline)
- "Toowoomba" (positive - one of the 7 cities surfaced by the D1 root-cause expansion)
- "Sunshine Coast" (positive - compound-name city; tests slug-normalised filter)

## Result

**10 / 10 PASS** (5 queries × 2 viewports).

```
PASS [3.9-picker] desktop-1440 search "Geelong"        | expected match, got match
PASS [3.9-picker] desktop-1440 search "London"         | expected no match, got no match
PASS [3.9-picker] desktop-1440 search "Sydney"         | expected match, got match
PASS [3.9-picker] desktop-1440 search "Toowoomba"     | expected match, got match
PASS [3.9-picker] desktop-1440 search "Sunshine Coast" | expected match, got match
PASS [3.9-picker] mobile-390  search "Geelong"         | expected match, got match
PASS [3.9-picker] mobile-390  search "London"          | expected no match, got no match
PASS [3.9-picker] mobile-390  search "Sydney"          | expected match, got match
PASS [3.9-picker] mobile-390  search "Toowoomba"      | expected match, got match
PASS [3.9-picker] mobile-390  search "Sunshine Coast"  | expected match, got match
```

Screenshots saved per viewport showing the picker dialog open.

## Picker hardening shipped this batch

`src/components/ui/location-picker.tsx` filter now matches against:

- `c.city.toLowerCase().includes(q)` (e.g. "Sydney" matches "Sydney")
- `c.country.toLowerCase().includes(q)` (e.g. "australia")
- `c.slug.toLowerCase().includes(q)` (e.g. "gold-coast" slug match)
- normalised form: both query and city/slug stripped of spaces and hyphens (e.g. "goldcoast" matches "Gold Coast" via slug "gold-coast" stripped to "goldcoast")

End.
