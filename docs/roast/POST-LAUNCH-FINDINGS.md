# Post-launch findings: integration/launch

Non-blocking observations found while merging the five launch branches on
12 August 2026. One line each, by founder instruction. Nothing here is fixed;
nothing here blocks. Fix only on an explicit ruling.

Two entries that first appeared here were ruled BLOCKING and fixed in the
integrity commit instead: the image ceiling proof asserting a superseded value,
and the Law 8 guard's window fail-open. They are recorded in that commit, not
here.

| # | Finding |
|---|---|
| 1 | `CLAUDE.md:1150` and `:1152` carry two em dashes, inherited by automatic merge from `fix/security-hardening`, inside a block the file itself says `next dev` regenerates, so deleting them re-creates them. |
| 2 | No gate scans `CLAUDE.md`: `scripts/copy-tell-gate.mjs` is wired in CI at `ci.yml:65` and its `DASH_RE` is real, but its walk is rooted at `src` only (lines 208 and 273), so finding 1 will not fail any gate. |
| 3 | `.githooks/commit-msg` is mode `100644`, not `100755`, on both original variants and therefore on the union. It runs on Windows through Git's shell, but a POSIX checkout will not execute a non-executable hook, so Law 8's first line of defence is silently absent there. |
| 4 | There is no `.gitattributes` and `core.autocrlf=true`, so `.githooks/commit-msg` is CRLF in a Windows working tree. The committed blob is LF and both original variants had the same exposure. |
| 5 | `tests/unit/media/image-pipeline.test.ts` now carries TWO describe blocks covering the downscale, one from each line of work, testing the founder's 3625 x 4961 case, the within-bounds pass-through and the no-upscale rule twice over. Harmless duplication, worth collapsing when someone is next in the file. |
| 6 | `tests/unit/security/image-pipeline-format.test.ts` covers the format fix only. That is now correct rather than a gap, because the downscale and bomb-guard assertions live in `tests/unit/media/image-pipeline.test.ts`, but the split is not obvious from either filename. |
| 7 | The merged `image-pipeline.ts` header comment still describes the pipeline as SPEC 1.5 while three branches have since rewritten the block. The comment is accurate but no longer complete. |
| 8 | The merge order and PR mapping in `docs/roast/HANDOVER-INTEGRATION-2026-08-12.md` section 3 is authoritative and was confirmed by founder ruling on 12 August: `#113` is `feat/public-composer` and `#117` is `fix/production-sweep`. |
| 9 | Per-merge verification of markers, symbol presence and overlap cannot see a cross-file type break. `business-name-mismatch.tsx` was left uncompilable by merge 3 and was only surfaced by the typecheck after merge 5. A typecheck belongs after every merge, not only at the end. |
| 10 | A grep sweep by CONSTANT NAME misses assertions written as bare numbers. The stale `4000` expectations in `tests/unit/media/image-pipeline.test.ts` survived a sweep for `MAX_STORED_IMAGE_DIMENSION` and `4000 x 4000` and were only caught by reading the file. Sweep by value as well as by name. |
