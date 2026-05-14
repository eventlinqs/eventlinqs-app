# EventLinqs Imagery Manifest - Pre-launch Cover Backfill

Generated: 2026-05-09
Picsum events found: 14
Unique cities: 4

This manifest tracks every event whose cover image needs replacement
before public launch. The 14 (or however many) events currently in
status='draft' get auto-promoted to status='published' once their
covers are filled in - the apply script handles both columns
atomically.

## Founder workflow

1. Source each cover image from the Stocksy bundle or Adobe Stock
   free credits per docs/IMAGERY-STRATEGY.md.
2. Upload to Supabase Storage at
   `event-images/{slug}/cover-1200.jpg` and
   `event-images/{slug}/thumb-600.jpg` (the apply script reads both
   columns).
3. Fill in the COVER URL and THUMB URL columns below with the public
   URLs (use the branded URL pattern when available, e.g.
   `https://images.eventlinqs.com/event-images/{slug}/cover-1200.jpg`).
4. From PowerShell:
   ```powershell
   node --env-file=.env.local scripts/backfill-event-covers.mjs
   ```
5. The script reads this manifest, applies the URL updates, promotes
   draft events whose status_after column is "published", and reports
   any rows still needing fill-in.
6. After the apply reports `Skipped: 0`, founder runs the constraint
   validation migration:
   ```powershell
   npx supabase db push --linked
   ```
   which applies `20260509000010_validate_real_cover_constraint.sql`
   and locks the no-picsum gate permanently.

## Manifest

The columns `Cover URL` and `Thumb URL` are blank-by-default; founder
fills them in. `Status After` is `published` for draft events that
should be promoted on apply, and `unchanged` for already-published
events that just need the URL swap.

| # | Slug | Status | Visibility | City | Title | Cover URL | Thumb URL | Status After |
|---|------|--------|------------|------|-------|-----------|-----------|--------------|
| 1 | rainbow-family-picnic-adelaide | draft | public | Adelaide | Rainbow Family Picnic Adelaide | | | published |
| 2 | arab-music-night-brisbane | draft | public | Brisbane | Arab Music Night Brisbane | | | published |
| 3 | lgbtq-comedy-night-brisbane | draft | public | Brisbane | LGBTQ+ Comedy Night Brisbane | | | published |
| 4 | pacific-islander-comedy-brisbane | draft | public | Brisbane | Pacific Islander Comedy Brisbane | | | published |
| 5 | maori-cultural-night-melbourne | draft | public | Melbourne | Maori Cultural Night Melbourne | | | published |
| 6 | oktoberfest-melbourne | draft | public | Melbourne | Oktoberfest Melbourne | | | published |
| 7 | persian-new-year-melbourne | draft | public | Melbourne | Persian New Year Melbourne | | | published |
| 8 | pride-brunch-melbourne | draft | public | Melbourne | Pride Brunch Melbourne | | | published |
| 9 | eurovision-watch-party-sydney | draft | public | Sydney | Eurovision Watch Party Sydney | | | published |
| 10 | lebanese-mahrajan-sydney | draft | public | Sydney | Lebanese Mahrajan Sydney | | | published |
| 11 | pasifika-festival-sydney | draft | public | Sydney | Pasifika Festival Sydney | | | published |
| 12 | polish-folk-festival-sydney | draft | public | Sydney | Polish Folk Festival Sydney | | | published |
| 13 | sydney-mardi-gras-afterparty | draft | public | Sydney | Sydney Mardi Gras Afterparty | | | published |
| 14 | turkish-coffee-and-stories-sydney | draft | public | Sydney | Turkish Coffee and Stories Sydney | | | published |
