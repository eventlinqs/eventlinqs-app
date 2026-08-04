import lexicon from './copy-tells.json'

/**
 * The anti-tell gate, layer 2 (C3). One lexicon, one source of truth
 * (copy-tells.json), consumed here for generated copy at runtime and by
 * scripts/copy-tell-gate.mjs for the repo's own copy in CI.
 *
 * Layer 1 (enforceCopyLaws in sanitise.ts) mechanically strips what can be
 * stripped safely: dashes and exclamation marks. Everything else here is a
 * vocabulary problem a strip would mangle, so a hit fails the draft and
 * triggers ONE named-violation regeneration; a second failure blanks the
 * offending field and flags it, so a tell can never ship.
 */

export type CopyTell = { name: string; source: string }

type Lexicon = {
  phrases: CopyTell[]
  generatedOnlyWords: CopyTell[]
  hard: CopyTell[]
}

const { phrases, generatedOnlyWords, hard } = lexicon as unknown as Lexicon

/** Every pattern that must never appear in GENERATED copy. */
export const GENERATED_COPY_TELLS: readonly CopyTell[] = [
  ...phrases,
  ...generatedOnlyWords,
  ...hard,
]

/** The subset the repo CI gate enforces on the platform's own copy strings. */
export const REPO_COPY_TELLS: readonly CopyTell[] = [...phrases]

/**
 * Names of every tell present in the text, in lexicon order. Empty means the
 * text is clean. Case-insensitive throughout.
 */
export function findCopyTells(text: string): string[] {
  if (!text) return []
  const hits: string[] = []
  for (const tell of GENERATED_COPY_TELLS) {
    if (new RegExp(tell.source, 'iu').test(text)) hits.push(tell.name)
  }
  return hits
}
