# Post-launch findings: integration/launch

Non-blocking observations found while merging the five launch branches and
clearing the guard failures, 12 August 2026. One line each, by founder
instruction. Nothing here is fixed; nothing here blocks. Fix only on a ruling.

| # | Finding |
|---|---|
| 1 | `CLAUDE.md:1150` and `:1152` carry two em dashes, inherited by automatic merge from `fix/security-hardening`, inside a block the file itself says `next dev` regenerates, so deleting them re-creates them. |
| 2 | No gate scans `CLAUDE.md`: `scripts/copy-tell-gate.mjs` is wired in CI at `ci.yml:65` and its `DASH_RE` is real, but its walk is rooted at `src` only, so finding 1 will not fail any gate. |
| 3 | `.githooks/commit-msg` is mode `100644`, not `100755`, on both original variants and therefore on the union. It runs on Windows through Git's shell, but a POSIX checkout will not execute a non-executable hook, so Law 8's first line of defence is silently absent there. |
| 4 | There is no `.gitattributes` and `core.autocrlf=true`, so `.githooks/commit-msg` is CRLF in a Windows working tree. The committed blob is LF and both original variants had the same exposure. |
| 5 | `tests/unit/media/image-pipeline.test.ts` carries TWO describe blocks covering the downscale, one from each line of work, testing the founder's 3625 x 4961 case, the within-bounds pass-through and the no-upscale rule twice over. Harmless duplication, worth collapsing. |
| 6 | `tests/unit/security/image-pipeline-format.test.ts` covers the format fix only, which is correct rather than a gap because the downscale assertions live in `tests/unit/media/image-pipeline.test.ts`, but the split is not obvious from either filename. |
| 7 | The merged `image-pipeline.ts` header still describes the pipeline as SPEC 1.5 while three branches have since rewritten the block. Accurate, no longer complete. |
| 8 | The merge order and PR mapping in `docs/roast/HANDOVER-INTEGRATION-2026-08-12.md` section 3 is authoritative, confirmed by founder ruling: `#113` is `feat/public-composer` and `#117` is `fix/production-sweep`. |
| 9 | Per-merge verification of markers, symbol presence and overlap cannot see a cross-file type break. `business-name-mismatch.tsx` was left uncompilable by merge 3 and surfaced only at the typecheck after merge 5. A typecheck belongs after every merge. |
| 10 | A grep sweep by CONSTANT NAME misses assertions written as bare numbers. Stale `4000` expectations survived a sweep for `MAX_STORED_IMAGE_DIMENSION` and were caught only by reading the file. Sweep by value as well as by name. |
| 11 | This machine has no Node version manager and its only system Node is 24. The pinned Node 20.20.2 used for a CI-equivalent run is a portable extract at `C:\node20`, added to PATH per shell. It is not on PATH by default, so a future session will silently run Node 24 again unless it repeats the step. |
| 12 | `lighthouse@13.1.0` declares `node >=22.19` while `.nvmrc` pins 20, so `npm ci` on the pinned runtime emits EBADENGINE for it. The install succeeds and the CI jobs that run Lighthouse pin 20 explicitly in `lighthouse.yml`, so this is a latent inconsistency rather than a live break. |
| 13 | `scripts/security/entrypoint-authz-audit.mjs` fails the build only on `RED-NO-AUTH`. It currently prints **6 `RED-IDOR-RISK`** entry points, all authenticated but privileged with no ownership check, and passes them. The gate's own worst category does not block. |
| 14 | The drive-account password appears in clear text in two committed COMMENTS that `no-plaintext-credential` cannot see, because it only matches an assignment: `tests/unit/auth/no-native-submit.test.ts:12` and `src/lib/hooks/use-hydrated.ts:17`, both quoting the leaking URL that motivated the fix. |
| 15 | `mintKitCode` draws `randomBytes(n)` and takes `% 31`, which is a slight modulo bias (256 is not a multiple of 31, so 8 of the 31 symbols are marginally likelier). Irrelevant at 2^59 of headroom, worth knowing before the alphabet or length is ever changed. |
| 16 | `.env.test` carries 11 variables and does not include `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, so `check-public-env` warns on it locally. Non-blocking for a local build; the maps surface will not render from this worktree. |
