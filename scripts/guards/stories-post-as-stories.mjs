/**
 * GUARD: A STORY POSTS AS A STORY, OR NOT AT ALL (the PM's 04:40 of 20 November 2026, item 4, on WINDOW 5A's read of
 * 02:47: our Blotato call set the story type for Instagram alone, so a Facebook story would have posted to the Page's
 * feed as a photo; Blotato's own reference, help.blotato.com/api/api-reference/publish-post, read 20 November 2026,
 * takes mediaType 'story' on Instagram and on Facebook).
 *
 * No story piece reaches a publisher call without its story type. Two publishers carry our posts, and each is held:
 *   - Route B, src/lib/social/blotato-publisher.ts: the target's mediaType comes from blotatoMediaType(format), whatever
 *     the network; a story type set under a network test (platform === ...) is the fault this guard was made for.
 *   - The Meta route, src/lib/social/meta-publisher.ts: an Instagram story is sent as media_type STORIES, and a Facebook
 *     story is refused with its reason (Meta's Page photos pages publish feed photos only), never posted another way.
 *
 * AND IN ITS OWN FORMAT, NEVER ONE GUESSED FROM ITS SLIDES (WINDOW 5A's look of 20 November 2026 at 10:49, on the PM's
 * 10:42 item 1): both publishers and the destination check read the format from the slides (formatOfSlides: a story
 * slide or a story file), and a tonight story's one slide is of type 'tonight', so it was read as a feed: the scheduler's
 * destination check passed it as a feed and Blotato would have posted a story drawing as a feed image with a black band.
 * Now the piece's own row decides (store.ts ownFormatOf), so this guard holds that:
 *   - no slide-reading guess of the format is left in src/lib/social (formatOfSlides, or a format from s.t === 'story');
 *   - each publisher takes the format from its input, and the destination check takes it as an argument;
 *   - the publishing run reads ownFormatOf and passes it to the destination check and the publisher, and the scheduler
 *     passes each approved piece's own format to the destination check.
 * Reads src only (on the build host). Comments are stripped before reading.
 *
 * Run: node scripts/guards/stories-post-as-stories.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[stories-post-as-stories]'
const SOCIAL = 'src/lib/social'
const BLOTATO = `${SOCIAL}/blotato-publisher.ts`
const META = `${SOCIAL}/meta-publisher.ts`
const CHECK = `${SOCIAL}/destination-check.ts`
const STORE = `${SOCIAL}/store.ts`
const stripComments = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const blotato = stripComments(readFileSync(BLOTATO, 'utf8'))
const meta = stripComments(readFileSync(META, 'utf8'))
const check = stripComments(readFileSync(CHECK, 'utf8'))
const store = stripComments(readFileSync(STORE, 'utf8'))
const faults = []

// The piece's own format: no guess from its slides anywhere in the social code.
const socialFiles = readdirSync(SOCIAL).filter((f) => /\.tsx?$/.test(f))
for (const f of socialFiles) {
  const text = stripComments(readFileSync(`${SOCIAL}/${f}`, 'utf8'))
  if (/\bformatOfSlides\b/.test(text)) faults.push(`${SOCIAL}/${f}: formatOfSlides guesses a piece's format from its slides; the piece's own format (store.ts ownFormatOf) decides`)
  for (const m of text.matchAll(/^.*\?\s*'story'\s*:\s*'feed'.*$/gm)) {
    if (/\.t\s*===\s*'story'|format\s*===\s*'story'\s*\)\s*\)/.test(m[0]) && /slides|\bs\.t\b/.test(m[0])) {
      faults.push(`${SOCIAL}/${f}: a format read from the slides ('${m[0].trim().slice(0, 120)}')`)
    }
  }
}
if (!/return async \(\{ pieceId, platform, format, slides, caption \}\)/.test(blotato)) faults.push(`${BLOTATO}: the publisher does not take the piece's own format from its input`)
if (!/return async \(\{ pieceId, platform, format, slides, caption \}: \{[^}]*format: 'feed' \| 'story'/.test(meta)) faults.push(`${META}: the publisher does not take the piece's own format from its input`)
if (!/export async function slidesMisfit\(slides: readonly Slide\[\], platform: SocialPlatform, format: 'feed' \| 'story', fetcher: Fetcher\)/.test(check)) {
  faults.push(`${CHECK}: slidesMisfit does not take the piece's own format as an argument`)
}
if (!/format = rev === null \? null : await ownFormatOf\(db, pieceId\)/.test(store)) faults.push(`${STORE}: the publishing run does not read the piece's own format (ownFormatOf)`)
if (!/await slidesMisfit\(rev\.slides, platform, format, /.test(store)) faults.push(`${STORE}: the publishing run's destination check is not given the piece's own format`)
if (!/await opts\.publisher\(\{ pieceId, platform, format, /.test(store)) faults.push(`${STORE}: the publisher is not given the piece's own format`)
if (!/await slidesMisfit\(d\.rev\.slides, platform, d\.format, /.test(store)) faults.push(`${STORE}: the scheduler's destination check is not given each piece's own format`)

// Route B: the story type from the format alone, in the publisher's own target.
if (!/export function blotatoMediaType\(format: 'feed' \| 'story'\): 'story' \| null \{\s*return format === 'story' \? 'story' : null\s*\}/.test(blotato)) {
  faults.push(`${BLOTATO}: blotatoMediaType is missing or no longer gives 'story' for every story and nothing for a feed piece`)
}
if (!/const mediaType = blotatoMediaType\(format\)\s*\n\s*if \(mediaType\) target\.mediaType = mediaType/.test(blotato)) {
  faults.push(`${BLOTATO}: the target's mediaType is not taken from blotatoMediaType(format), so a story can reach Blotato without its story type`)
}
for (const m of blotato.matchAll(/^.*\bmediaType\b.*$/gm)) {
  if (/platform\s*===/.test(m[0])) faults.push(`${BLOTATO}: the story type is set under a network test ('${m[0].trim()}'), so a story on another network posts to its feed`)
}

// The Meta route: Instagram stories as STORIES, Facebook stories refused.
if (!/media_type: 'STORIES'/.test(meta)) faults.push(`${META}: an Instagram story is no longer sent as media_type STORIES`)
if (!/async function facebook\([^)]*\)[^{]*\{\s*if \(format === 'story'\) throw new MetaRefusal\(/.test(meta)) {
  faults.push(`${META}: a Facebook story is no longer refused first, so it could be posted to the Page's feed as a photo`)
}

declareWork('stories-post-as-stories', { did: { publisher: 2, 'social file': socialFiles.length }, found: { fault: faults.length } })
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${faults.length} way(s) a story could post as something else.`)
  process.exit(1)
}
console.log(`${TAG} PASS - both publishers post a story as a story or refuse it: Blotato's story type follows the format on every network; Meta sends Instagram stories as STORIES and refuses Facebook stories; and the format is each piece's own, read from its row and given to the scheduler's check, the publishing run's check and the publisher, with no guess from slides in ${socialFiles.length} social files.`)
