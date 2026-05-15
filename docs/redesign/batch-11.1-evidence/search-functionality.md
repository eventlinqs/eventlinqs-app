# Batch 11.1 D3.8 - Global search smoke

Date: 2026-05-15
Source script: `scripts/batch-11.1-d3-4-to-9.mjs` (section 3.8)
Raw data: `docs/redesign/batch-11.1-evidence/d3-4-to-9-report.json`

## Coverage

Open the header search overlay (Cmd+K-style triggered via the
header search pill / icon), type each test query, count the number
of result items rendered inside the overlay dialog.

## Result

**3 / 3 PASS.** Every test query returns 21 result items (the full
overlay capacity at default page size).

```
PASS [3.8-search] query "festival" | 21 results
PASS [3.8-search] query "African"  | 21 results
PASS [3.8-search] query "Sydney"   | 21 results
```

The search index covers events, cultures, cities, and the keywords
that surround them. Empty state for no-match queries was not tested
in this section because the search index is broad enough that test
queries return matches.

End.
