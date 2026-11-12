/**
 * THE WORDS OF AN ORGANISER'S PHOTO PERMISSION (./photo-permission.ts). Their yes is kept in the words the page showed
 * them, with who gave it and for which night, so the register's evidence reads as what they agreed to. Pure.
 */

/** Where EventLinqs may use the images: that night's own page and cards, its social posts about the night, or both. */
export type PhotoUses = 'site' | 'social' | 'both'

/** The page's two boxes as the register's scope; neither ticked is no permission at all. */
export function usesFrom(onPage: boolean, inPosts: boolean): PhotoUses | null {
  if (onPage && inPosts) return 'both'
  if (onPage) return 'site'
  if (inPosts) return 'social'
  return null
}

const USE_WORDS: Record<PhotoUses, string> = {
  site: "on this night's own page and cards on EventLinqs",
  social: "in EventLinqs' social posts about this night",
  both: "on this night's own page and cards on EventLinqs and in EventLinqs' social posts about it",
}

/** The register's permitted uses, in plain words. */
export function permittedUsesWords(uses: PhotoUses): string {
  return `${USE_WORDS[uses].charAt(0).toUpperCase()}${USE_WORDS[uses].slice(1)}, as the organiser chose on their EventLinqs photo page; this night only, not paid advertising.`
}

/** Their yes, as the page put it to them and as they gave it. */
export function grantWording(input: { readonly givenBy: string; readonly organiserName: string; readonly nightTitle: string; readonly uses: PhotoUses; readonly count: number }): string {
  const images = input.count === 1 ? 'the image' : `the ${input.count} images`
  return `${input.givenBy.trim()}, for ${input.organiserName.trim()}: I took ${images} I added for ${input.nightTitle.trim()}, or have the right to share ${input.count === 1 ? 'it' : 'them'}, and EventLinqs may use ${input.count === 1 ? 'it' : 'them'} ${USE_WORDS[input.uses]}.`
}
