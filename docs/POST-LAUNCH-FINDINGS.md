# Post-launch findings

Noticed, **not fixed**, deliberately. One line each. Opened 26 August 2026 so
that things seen during the launch run are recorded as known debt rather than
rediscovered later as gaps.

Nothing in this file is a blocker. Anything that was a blocker was fixed.

---

## Known debt

- **Six exemption lists carry justifications nobody has re-verified.**
  `scripts/check-client-barrel-imports.mjs`, `scripts/guards/canonical-host.mjs`,
  `scripts/guards/no-control-characters.mjs`,
  `scripts/guards/no-inherited-git-env.mjs`,
  `scripts/guards/one-db-connection-source.mjs`,
  `scripts/guards/one-refund-path.mjs` and
  `scripts/guards/one-sellability-source.mjs`. Each entry states a reason that was
  true when written; none is staleness-checked. This is the same class as the
  exemption in `copy-tell-gate.mjs` that excused `captions.ts` on the grounds that
  a database row still carried a slug it no longer carried, which kept a dead
  comparison alive for months. The fix is the one already applied to three lists:
  report entries that no longer match anything and treat them as failures. See
  `docs/verification/BANNED-WORD-SWEEP-2026-08-26.md` section 4.

- **`src/lib/images/spine.ts` still generates the retired storage path.** Line 180
  carries `key: 'arts-cult` + `ure'`, so `buildUrl` emits
  `stock/categories/<retired>/theatre-interior-evening-1440.avif`. One line. It is
  exempted in `no-banned-word-anywhere.mjs` with that reason. The storage copy in
  the founder runbook is the safe first half; this line is the second half and is
  NOT done, so nothing switches on the next deploy.

- **`/events` grid heading spacing vs the sticky filter bar.** `scroll-mt-40`
  clears it for anchors and restored scroll positions. Not measured against every
  filter-bar height at every breakpoint; a taller bar could still overlap.

- **1024 rail peek sits at 21%** where every other width reads as a deliberate
  slice. Ruled to stay, 26 August 2026: unfixable without a per-breakpoint card
  width, and card size is locked. Arithmetic recorded in the sweep document.

- **De-duplication on a thin catalogue is unbuilt and deliberately so.** Proposal:
  cap any event at two sections per page, hero counting as one. Deferred until the
  catalogue fills; competitor behaviour on a thin catalogue is not observable from
  outside and is marked UNSOURCED rather than invented.

- **`captions.ts` arts register was mis-mapped for the life of the rename.** Fixed
  26 August 2026, but no test asserts the mapping against the live taxonomy, so
  the next category rename can break it the same way.

- **The homepage zero-event rail behaviour differs from `/events`.** `/events`
  rails fill with invitation cards when empty; `EventRailSection` on the homepage
  still returns null. Deliberate, by the instruction to leave the homepage alone.
  The two surfaces now answer "empty rail" differently.
