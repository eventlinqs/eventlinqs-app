/**
 * THE ONE REGISTRY OF WHAT THE PREBUILD CHAIN READS UNDER docs/.
 *
 * Two guards consume it and they must never disagree about the list:
 *   - vercelignore-covers-guard-reads.mjs judges it statically, against the
 *     .vercelignore rules and against the docs/ literals in every build-time
 *     script.
 *   - tolerant-guards-survive-the-upload.mjs EXECUTES every TOLERANT entry in a
 *     materialised upload, because on 8 September 2026 one of these rationales
 *     was wrong and blocked a deployment while the local gate stayed green.
 *
 * Both lists are printed on every run by their consumers, so neither can rot
 * quietly into an unexamined allowlist.
 */

/**
 * docs/ files the prebuild chain reads and cannot do without. The reason names
 * the reader. Adding a docs/ read to a guard means adding it here AND walking it
 * down in .vercelignore; the static guard fails until both are done.
 */
export const REQUIRED_READS = {
  'docs/PRICING.md':
    'src/lib/health/pricing-lock.mjs (scripts/check-pricing-lock.mjs in prebuild) parses every locked fee figure from it',
  'docs/scope/community-layer-approved.json':
    'scripts/guards/community-layer-protected.mjs judges the source and the database against it (close-out C18 FINAL)',
}

/**
 * Build-time scripts that name docs/ paths but are correct when docs/ is
 * stripped. Every one of these is RUN in a materialised upload by
 * tolerant-guards-survive-the-upload.mjs, so the reason below is a description
 * of behaviour that is tested, not a promise about it.
 */
export const TOLERANT_FILES = {
  'scripts/guards/one-fee-copy.mjs':
    'names docs/ directories to skip and authority documents to exclude from the copy scan; it walks what exists',
  'scripts/guards/positioning-lock.mjs':
    'the sibling of one-fee-copy: it names docs/marketing as a scan root and five docs/ directories to exclude as dated records, and walks what exists (its walk() returns empty on ENOENT and it reports the file count it scanned)',
  'scripts/guards/no-plaintext-credential.mjs':
    'names docs/ files only inside its reviewed-redaction allowlist, as reasons; an absent file is simply not scanned',
  'scripts/guards/sourced-specifications.mjs':
    'names a docs/ file only inside its reviewed baseline; the baseline is reported, never required to match',
  'scripts/guards/tolerant-guards-survive-the-upload.mjs':
    'the executor itself. It names docs/verification only in its own skip test, the same two-fact test its subject uses, and it builds the stripped tree rather than reading anything out of docs/',
  'scripts/guards/launch-readiness-honest.mjs':
    'reads docs/verification/LAUNCH-READINESS.md and the artefacts beside it, and SKIPS by name on the two facts that identify the build host: the tree is not a git checkout AND docs/verification holds no file at any depth. It used to test for an ABSENT directory, which is not what the upload looks like (Vercel removes the files and leaves the directories), and that mistake blocked the deployment of 7564b40 on 8 September 2026',
}
