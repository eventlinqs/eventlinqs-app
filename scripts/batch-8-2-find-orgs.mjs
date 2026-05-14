// Find organisation slugs from the live DB.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Manually parse .env.local because dotenv isn't installed and we
// don't want to add it just for a one-shot diagnostic.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('missing supabase env')
  process.exit(1)
}
const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('organisations')
  .select('id, name, slug, status')
  .eq('status', 'active')
  .limit(10)
if (error) {
  console.error(error)
  process.exit(1)
}
console.log(JSON.stringify(data, null, 2))
