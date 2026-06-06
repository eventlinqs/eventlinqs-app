# Dependency audit (2026-06-06)

`npm audit` before launch. Policy: fix criticals and highs with safe
(non-major) upgrades; document the rest; never take a major bump without
flagging it.

## Before

- Critical: 0
- High: 1
- Moderate: 7
- Total: 8

The single high:

- **next** - "Denial of Service with Server Components". Fix available at
  `next@16.2.7` (non-major, from 16.2.2).

## Action taken

- Upgraded `next` 16.2.2 -> **16.2.7** (non-major). This clears the high.
  Verified: production build passes, vitest 284/284, security headers still
  emit.

## After

- Critical: 0
- High: 0
- Moderate: 8
- Total: 8

## Remaining moderates (documented, not fixed)

These are all moderate severity and mostly transitive. None are
runtime-exploitable in this app's usage; they are left for a focused follow-up
so this launch PR carries a minimal, reviewable dependency change.

| Package | Issue (via) | Fix available | Notes |
|---|---|---|---|
| `brace-expansion` | ReDoS in range expansion | yes, non-major | Transitive (tooling). Safe to take in a follow-up `npm audit fix`. |
| `ws` | uninitialised memory disclosure | yes, non-major | Transitive. Safe follow-up. |
| `resend` -> `svix` -> `uuid` | uuid bounds check | partial | `resend`/`svix` have non-major fixes; the underlying `uuid` advisory only fully clears via a major in another tree (see below). |
| `svix` | via `uuid` | yes, non-major | Bumps with `resend`. |
| `uuid` | missing buffer bounds check (v3/v5/v6 with `buf`) | needs major elsewhere | The app does not call uuid with a user-supplied `buf`; not exploitable here. |
| `exceljs` -> `uuid` | via `uuid` | `exceljs@3.4.0` (MAJOR, and a downgrade) | Flagged: do NOT take. `exceljs` powers organiser XLSX export; a major/downgrade needs its own test pass. |
| `next` -> `postcss` | postcss CSS stringify XSS (build-time) | npm suggests `next@9.3.3` | Bogus suggestion (a 7-major downgrade). Build-time only, not a runtime risk. Ignore; revisit when Next ships a patched postcss. |

## Recommended follow-up (not blocking launch)

1. `npm audit fix` (no `--force`) to take the safe non-major fixes for
   `brace-expansion`, `ws`, `resend`/`svix`, then rebuild + test.
2. Leave `exceljs` and the `next`/`postcss` advisory until a real (non-downgrade)
   fix exists; both are non-exploitable in current usage.
