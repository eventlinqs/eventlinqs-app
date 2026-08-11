// Divergence drill: prove the business-name mismatch is actually detected.
//
// Renames the proof organisation in the TEST database WITHOUT touching Stripe,
// which reproduces exactly what happened on production: the platform holds one
// name, the connected account holds another, and nothing reports it. Pass
// "revert" to put the name back.
//
// Run from PowerShell:
//   node --env-file=.env.test scripts/verify/connect-divergence-drill.mjs
//   node --env-file=.env.test scripts/verify/connect-divergence-drill.mjs revert
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env. Run: node --env-file=.env.test scripts/verify/connect-divergence-drill.mjs')
  process.exit(1)
}
if (!SUPABASE_URL.includes('vkapkibzokmfaxqogypq')) {
  console.error(`Refusing to run: ${SUPABASE_URL} is not the TEST project.`)
  process.exit(1)
}

const SLUG = 'thunderbird-freight-sessions'
const TRUE_NAME = 'Thunderbird Freight Sessions'
const DRIFTED_NAME = 'Redbird Cargo Nights'

const revert = process.argv[2] === 'revert'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase
  .from('organisations')
  .update({ name: revert ? TRUE_NAME : DRIFTED_NAME })
  .eq('slug', SLUG)
  .select('id, name, stripe_account_id')
  .single()

if (error) {
  console.error(error)
  process.exit(1)
}
console.log(JSON.stringify({ mode: revert ? 'revert' : 'drift', ...data }, null, 2))
