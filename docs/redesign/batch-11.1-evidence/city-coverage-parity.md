# Batch 11.1 D3.1 - City coverage parity

Date: 2026-05-15
Source script: `scripts/batch-11.1-au-launch-readiness.mjs`
Raw data: `docs/redesign/batch-11.1-evidence/city-coverage-parity.json`

## Coverage

For every AU city slug in `public.cities`:

1. Present in `LAUNCH_TARGET_CITIES` allowlist
2. Present in the picker AU section (live Playwright DOM trace)
3. Searchable in the picker by full city name
4. Searchable in the picker by slug
5. `/events/browse/[city]` returns HTTP 200
6. `/city/[slug]` returns HTTP 200
7. Appears in `/sitemap.xml`

## Result

**20 / 20 AU cities PASS on all 7 dimensions.**

```
Step 1: 20 AU cities in DB cities table
Step 2: 20 slugs in LAUNCH_TARGET_CITIES
Step 3: 20 unique city slugs in /sitemap.xml
Step 4: 20 cities in picker AU section

PASS adelaide           Adelaide
PASS albury             Albury
PASS ballarat           Ballarat
PASS bendigo            Bendigo
PASS brisbane           Brisbane
PASS cairns             Cairns
PASS canberra           Canberra
PASS darwin             Darwin
PASS geelong            Geelong
PASS gold-coast         Gold Coast
PASS hobart             Hobart
PASS launceston         Launceston
PASS melbourne          Melbourne
PASS newcastle          Newcastle
PASS perth              Perth
PASS sunshine-coast     Sunshine Coast
PASS sydney             Sydney
PASS toowoomba          Toowoomba
PASS townsville         Townsville
PASS wollongong         Wollongong
```

End.
