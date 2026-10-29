/**
 * THE HELD POSTS JUDGED AGAIN ON TEST (the project manager's ruling of 29 October 2026, 14:52: an organiser's own title
 * and name are quoted exactly; "TEST's held Children's Week posts are re-judged under it"). A post whose Launch Kit
 * words were refused is kept with no words (store.planWeek), and nothing offers them again. This reads every planned
 * post still to come that has no words, writes the kit's words again for its network and its own link, judges them with
 * today's rule (words.wordsRefusal with the night's exact title and organiser name) and keeps them as the kit's version
 * 1 only where they now pass; a refusal is printed with its reason and nothing is written for it.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-rejudge-held-words.mts [--apply]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for TEST (vkapkibzokmfaxqogypq). Without --apply it
 * writes nothing and says what it would keep. TEST only, refused anywhere else.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as StoreModule from '@/lib/social/store'
import type * as PlanModule from '@/lib/social/plan'
import type * as WordsModule from '@/lib/social/words'
import type * as KitModule from '@/lib/broadcast/kit-artefacts'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const pick = <T,>(mod: T & { default?: T }) => (mod.default ?? mod) as T
const store = pick((await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule })
const { factsOf, kitCaption } = pick((await import('@/lib/social/plan')) as typeof PlanModule & { default?: typeof PlanModule })
const { quotableSummary, wordsRefusal } = pick((await import('@/lib/social/words')) as typeof WordsModule & { default?: typeof WordsModule })
const { toCaptionInput } = pick((await import('@/lib/broadcast/kit-artefacts')) as typeof KitModule & { default?: typeof KitModule })

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-rejudge-held-words runs on TEST only')
  process.exit(2)
}
const apply = process.argv.includes('--apply')
const db = createClient(url, key, { auth: { persistSession: false } })
const now = new Date()

const { data: posts, error } = await db
  .from('social_posts')
  .select('id, event_id, platform, link, events(title, start_date), social_drafts(id)')
  .order('planned_at', { ascending: true })
  .limit(1000)
if (error) throw new Error(`the posts could not be read: ${error.message}`)
type Row = { id: string; event_id: string; platform: 'instagram' | 'facebook'; link: string; events: { title: string; start_date: string } | null; social_drafts: { id: string }[] }
const held = ((posts ?? []) as unknown as Row[]).filter((p) => p.social_drafts.length === 0 && p.events !== null && Date.parse(p.events.start_date) > now.getTime())
console.log(`${held.length} post(s) still to come with no words, of ${(posts ?? []).length} read (${apply ? 'APPLY' : 'DRY RUN'})`)

let kept = 0
let refused = 0
for (const p of held) {
  const context = await store.contextFor(db, p.event_id, now)
  if (context === null) {
    refused += 1
    console.log(`REFUSED ${p.id} ${p.events?.title}: the night could not be read`)
    continue
  }
  const told = toCaptionInput(context)
  const caption = { ...told, summary: quotableSummary(told.summary, [told.title, told.organiserName]) }
  const words = kitCaption(caption, p.platform, p.link)
  const why = wordsRefusal(words, p.link, factsOf(caption), [caption.title, caption.organiserName])
  if (why !== null) {
    refused += 1
    console.log(`REFUSED ${p.id} ${p.platform} ${p.events?.title}: ${why}`)
    continue
  }
  if (apply) {
    const { error: derr } = await db.from('social_drafts').insert({ post_id: p.id, version: 1, caption: words, written_by: 'kit', drafted_at: now.toISOString() })
    if (derr) {
      refused += 1
      console.log(`REFUSED ${p.id} ${p.platform} ${p.events?.title}: the database said ${derr.message}`)
      continue
    }
  }
  kept += 1
  console.log(`${apply ? 'KEPT' : 'WOULD KEEP'} ${p.id} ${p.platform} ${p.events?.title}`)
}
console.log(`${apply ? 'KEPT' : 'WOULD KEEP'} ${kept}, REFUSED ${refused}`)
