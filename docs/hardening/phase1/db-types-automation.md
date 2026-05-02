# Database type generation automation - Phase 1 deliverable D

Status: PARTIAL - scripts and migration plan landed, SHARED package.json change and remote generation pending founder action
Owner: hardening session
Estimated time: 5 minutes founder + 1 SHARED commit + ~2 hours migration work (later phase)

## The problem

`src/types/database.ts` is 553 lines of hand-written TypeScript that mirrors the Supabase schema. Every migration risks the hand-written file silently drifting from the database. The current state shows ~50 import sites consuming named exports like `Event`, `Organisation`, `EventStatus` directly.

Hand-written types are wrong by default. The risk is not "we forgot to update the type" - it is "we updated the column, the type compiled fine, and a runtime read corrupted because nullability flipped."

## The end state we want

1. `src/types/database.generated.ts` is auto-generated from the linked Supabase project. It is the source of truth for table row shapes, enum unions, and rpc signatures. Never hand-edited.
2. `src/types/database.ts` is a curated, hand-written re-export layer: it re-exports the named types the codebase already imports (`Event`, `Organisation`, `EventStatus`, etc.) by aliasing the generated types. This preserves all 50+ existing import sites without touching them.
3. `npm run db:types` regenerates `database.generated.ts` from the linked project.
4. `npm run db:types:check` is run in CI: fails the build if migrations have landed but generated types are stale.

## What landed in this session (non-SHARED)

| File | Purpose |
| --- | --- |
| `scripts/gen-db-types.mjs` | Wraps `supabase gen types typescript --linked --schema public`, writes to `src/types/database.generated.ts` with a do-not-edit banner. |
| `scripts/db-types-drift-check.mjs` | Generates fresh types, compares to checked-in file, exits non-zero on drift. Used in CI. |
| `docs/hardening/phase1/db-types-automation.md` | This file. |

These do not require [SHARED] coordination because they touch only `scripts/` and `docs/`.

## What is pending (SHARED)

`package.json` is on the SHARED files list per CLAUDE.md. Adding the two npm scripts is a [SHARED] commit:

```diff
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint",
     "test": "vitest run",
     "test:watch": "vitest",
+    "db:types": "node scripts/gen-db-types.mjs",
+    "db:types:check": "node scripts/db-types-drift-check.mjs"
   },
```

This will land as: `[SHARED] chore: add db:types and db:types:check npm scripts`.

The session pauses on D until partner Claude (project manager) confirms no conflict with concurrent work.

## Founder action required

The Supabase CLI must be linked to the production project. This is the same founder action already documented for deliverable E:

```powershell
npx supabase login
npx supabase link --project-ref gndnldyfudbytbboxesk
```

Linking requires the production database password. After link, this session runs `npm run db:types` to populate `src/types/database.generated.ts` for the first time.

## Migration plan (later phase, not Phase 1)

Once `database.generated.ts` exists and CI is green:

1. Audit `src/types/database.ts` to identify which named exports are actually consumed (grep for `from '@/types/database'`).
2. For each consumed name, add a re-export aliasing the generated equivalent. Example:
   ```ts
   import type { Database } from './database.generated'

   export type Event = Database['public']['Tables']['events']['Row']
   export type EventInsert = Database['public']['Tables']['events']['Insert']
   export type EventUpdate = Database['public']['Tables']['events']['Update']

   export type EventStatus = Database['public']['Enums']['event_status']
   ```
3. Delete the hand-written interface bodies that are now superseded by aliases.
4. Run `npx tsc --noEmit` to verify no call sites broke.
5. Spot-check a handful of consumers - particularly checkout actions and webhook handlers - that the runtime shape still matches the inferred type.

This is non-trivial. The hand-written types contain editorial decisions (Profile.metadata typed as `Record<string, unknown>`, FeePassType as a string union not pulled from a Postgres enum) that need case-by-case reconciliation. It is too large to ship in Phase 1; it is queued for Phase 2 or a dedicated chore PR.

## Phase 1 closure scope

For Phase 1, D closes when:

- ✅ Generation script landed (`scripts/gen-db-types.mjs`)
- ✅ Drift-check script landed (`scripts/db-types-drift-check.mjs`)
- ✅ Migration plan documented
- ⏸ SHARED package.json commit - pending project-manager coordination
- ⏸ First-run generation against the linked project - pending founder link
- ⏸ Re-export refactor of `src/types/database.ts` - explicitly out of Phase 1 scope, queued for a later PR

The actual cutover from hand-written to re-exported types is not Phase 1. Phase 1 ships the rails: scripts, drift detection, and a documented migration path.

## CI integration (queued, not yet wired)

Once the npm scripts land, add to the existing CI workflow:

```yaml
- name: Verify generated DB types are not stale
  run: npm run db:types:check
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

Requires `SUPABASE_ACCESS_TOKEN` to be set as a GitHub secret. That is a separate founder action (token creation at https://supabase.com/dashboard/account/tokens).

## Verification gates

When all pieces are in place:

- `npm run db:types` writes a non-empty `src/types/database.generated.ts`.
- `npm run db:types:check` exits 0 against a clean tree, exits 1 after a deliberate schema change.
- The generated file's banner is preserved across regeneration.
- `npx tsc --noEmit` passes both before and after the re-export refactor.
