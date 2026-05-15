# Batch 11.1 D3.2 - Culture coverage parity

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-2-culture-parity.mjs`
Raw data: `docs/redesign/batch-11.1-evidence/culture-coverage-parity.json`

## Coverage

For every culture slug in `src/lib/cultures/data.ts` `CultureSlug`:

1. `/culture/[slug]` returns HTTP 200
2. At least one `/culture/[slug]/[city]` intersection returns 200
3. Slug appears in `/cultures` index page HTML
4. Slug appears in `/sitemap.xml`

## Result

**14 / 14 cultures PASS on all 4 dimensions.**

```
Cultures total: 14, /cultures index status: 200
PASS african            | intersection via /sydney
PASS south-asian        | intersection via /sydney
PASS caribbean          | intersection via /sydney
PASS latin              | intersection via /sydney
PASS east-asian         | intersection via /sydney
PASS filipino           | intersection via /sydney
PASS mediterranean      | intersection via /sydney
PASS middle-eastern     | intersection via /sydney
PASS european           | intersection via /sydney
PASS pacific            | intersection via /sydney
PASS gospel             | intersection via /sydney
PASS comedy             | intersection via /sydney
PASS wellness           | intersection via /sydney
PASS pride              | intersection via /sydney
```

End.
