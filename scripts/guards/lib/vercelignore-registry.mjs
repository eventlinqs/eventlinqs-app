/**
 * WHAT THE PREBUILD CHAIN READS UNDER docs/ AND CANNOT DO WITHOUT.
 *
 * This file used to hold TWO lists. The second, TOLERANT_FILES, named scripts
 * "reviewed as correct when docs/ is stripped", each with a written reason, and
 * close-out F1.9.1 is the record of what that cost: the reason written for
 * launch-readiness-honest.mjs was wrong, nothing ever executed it, and the guard
 * built after the third lost deployment watched the fourth go past. A rationale
 * does not run.
 *
 * IT IS GONE. Close-out F1.9.2 PART TWO: "Then DELETE the TOLERANT review list.
 * Any script that genuinely tolerates absence proves it by executing." Nothing is
 * reviewed as tolerant any more. Every build-time script that names a docs/ path
 * is RUN inside a materialised upload by
 * scripts/guards/excluded-reads-survive-the-upload.mjs, which derives its own
 * subject list from the same scan, so there is no list for the two halves to
 * disagree about.
 *
 * What remains is a DECLARATION, not a review: these paths must arrive on the
 * build host. The guard checks each one exists, is still named by a build-time
 * script (so an entry cannot outlive its reader), and is not excluded by
 * .vercelignore, and it prints the exact lines to add when one is.
 */

/**
 * docs/ paths the prebuild chain reads and cannot do without. A key ending in
 * `/` is a DIRECTORY: its contents arrive whole, which is how a dated artefact
 * can be added without editing .vercelignore.
 */
export const REQUIRED_READS = {
  'docs/PRICING.md':
    'src/lib/health/pricing-lock.mjs (scripts/check-pricing-lock.mjs in prebuild) parses every locked fee figure from it',
  'docs/scope/community-layer-approved.json':
    'scripts/guards/community-layer-protected.mjs judges the source and the database against it (close-out C18 FINAL)',
  'docs/verification/LAUNCH-READINESS.md':
    'scripts/guards/launch-readiness-honest.mjs re-renders it from the adjudication and compares byte for byte (close-out L5, and the deployment it cost on 8 September 2026 is close-out F1.9)',
  'docs/verification/launch-readiness/':
    'the evidence every PASS row in that report cites. A DIRECTORY rather than four dated filenames, deliberately: it holds nothing but those artefacts, it is about 7 KB, and re-including it by name would mean editing .vercelignore every time the report is driven again. The 382 MB of screenshots elsewhere under docs/verification stay excluded',
}
