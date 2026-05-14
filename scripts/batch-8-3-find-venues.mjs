// Find venue handles by slug-form of distinct events.venue_name.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      if (idx === -1) return ['', '']
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

function venueSlugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const { data } = await supabase
  .from('events')
  .select('venue_name')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .not('venue_name', 'is', null)
  .limit(200)

const counts = new Map()
for (const r of data ?? []) {
  if (!r.venue_name) continue
  counts.set(r.venue_name, (counts.get(r.venue_name) ?? 0) + 1)
}
const sorted = Array.from(counts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([name, count]) => ({ name, slug: venueSlugify(name), count }))
console.log(JSON.stringify(sorted, null, 2))
