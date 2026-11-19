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
 * Reads src only (on the build host). Comments are stripped before reading.
 *
 * Run: node scripts/guards/stories-post-as-stories.mjs
 */
import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[stories-post-as-stories]'
const BLOTATO = 'src/lib/social/blotato-publisher.ts'
const META = 'src/lib/social/meta-publisher.ts'
const stripComments = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const blotato = stripComments(readFileSync(BLOTATO, 'utf8'))
const meta = stripComments(readFileSync(META, 'utf8'))
const faults = []

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

declareWork('stories-post-as-stories', { did: { publisher: 2 }, found: { fault: faults.length } })
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${faults.length} way(s) a story could post as something else.`)
  process.exit(1)
}
console.log(`${TAG} PASS - both publishers post a story as a story or refuse it: Blotato's story type follows the format on every network; Meta sends Instagram stories as STORIES and refuses Facebook stories.`)
