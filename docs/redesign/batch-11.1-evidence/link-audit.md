# Batch 11.1 D3.3 - Internal link audit

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-3-link-audit.mjs`
Raw data: `docs/redesign/batch-11.1-evidence/link-audit.json`

## Coverage

77 public pages crawled; every internal `<a href>` extracted; each
hit with HTTP HEAD to record status. Excluded `/api/*`, `/_next/*`,
fragments, mailto, tel.

Page set: homepage, /events, /events/browse/[13 AU cities],
/city/[13 AU cities], /culture/[14 cultures], /cultures, /cities,
/organisers, /organisers/signup, marketing pages (/pricing, /about,
etc.), all /legal/* pages, /login, /signup, /forgot-password,
/verify-email-sent.

## Result

**Pre-fix: 71 failures across 752 unique links.**
**Post-fix: 0 failures across 752 unique links.**

### Failures closed

| Failure category | Count | Root cause | Fix |
|---|---|---|---|
| `/culture/[culture]/[city]` for smaller AU cities (Albury, Ballarat, Bendigo, Launceston, Sunshine Coast, Toowoomba, Townsville) | 70 | `findCityName()` in /culture/[culture]/[city]/page.tsx returned null when the city wasn't in the culture's curated `cities` list. Smaller AU cities aren't in any culture's list, so /city/[slug] pages emitted broken intersection links. | `findCityName()` now falls back to the AU cities DB table. Page renders with the empty state ("No <culture> events in <city> yet") when no matching events exist. |
| `/categories/community` | 1 | Homepage `viewAllHref` pointed at a category route that doesn't exist. All other rails use `/events?...` filter URLs. | `src/app/page.tsx` viewAllHref changed to `/events?category=community`. |

### Post-fix output

```
Pages crawled: 77
Unique internal links: 752
Failures: 0
All internal links return 200/2xx/3xx. No broken links.
```

End.
