/**
 * Statement descriptor proof.
 *
 * Shows what a buyer's bank actually receives for one real event per category,
 * plus the hostile edge cases, by importing the REAL suffix function and
 * creating REAL confirmed charges on the Stripe TEST platform account, then
 * reading back `calculated_statement_descriptor` (Stripe's own computed value,
 * not ours).
 *
 * Nothing here reimplements the sanitiser. A proof that reimplements the thing
 * it is proving proves nothing.
 *
 * Run: npx tsx scripts/verify/statement-descriptor-proof.ts   (with .env.test)
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { statementDescriptorSuffix } from '../../src/lib/stripe/business-profile'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'

/** Stripe's published ceiling for the complete descriptor, including the
 *  asterisk and the space. https://docs.stripe.com/get-started/account/statement-descriptors */
const NETWORK_LIMIT = 22

const key = process.env.STRIPE_SECRET_KEY
if (!key || !/^(sk|rk)_test_/.test(key)) {
  throw new Error(`Refusing to run: STRIPE_SECRET_KEY must be a test key (got "${String(key).slice(0, 8)}").`)
}
const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) throw new Error('Supabase env missing. Run with --env-file=.env.test')
if (!supabaseUrl.includes('vkapkibzokmfaxqogypq')) {
  throw new Error(`Refusing to run: ${supabaseUrl} is not the TEST project.`)
}
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

type Row = {
  group: string
  title: string
  suffix: string | null
  calculated: string | null
  ok: boolean
  note: string
}

/** One real published event title per category. */
async function realTitlesByCategory(): Promise<{ category: string; title: string }[]> {
  const { data, error } = await supabase
    .from('events')
    .select('title, category:event_categories(name)')
    .eq('status', 'published')
    .limit(500)
  if (error) throw error

  // PostgREST types an embedded relation as an array even when it resolves to a
  // single row, so accept either shape rather than asserting one.
  type CategoryRef = { name: string } | { name: string }[] | null
  const categoryName = (ref: CategoryRef): string => {
    if (!ref) return 'Uncategorised'
    const first = Array.isArray(ref) ? ref[0] : ref
    return first?.name ?? 'Uncategorised'
  }

  const longestPerCategory = new Map<string, string>()
  for (const row of (data ?? []) as unknown as { title: string; category: CategoryRef }[]) {
    const category = categoryName(row.category)
    const held = longestPerCategory.get(category)
    // The LONGEST title per category, because truncation is what is on trial.
    if (!held || row.title.length > held.length) longestPerCategory.set(category, row.title)
  }
  return [...longestPerCategory.entries()]
    .map(([category, title]) => ({ category, title }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

const EDGE_CASES: { label: string; title: string }[] = [
  { label: 'one word', title: 'Basement45' },
  { label: 'forbidden chars', title: `Rosie's <Basement> * "45" \\ Warehouse` },
  { label: 'curly apostrophe (real seeded title)', title: 'A Doll’s House on Stage at The Events Centre Caloundra' },
  { label: 'accented latin', title: 'Café Niño Fiesta Nocturna' },
  { label: 'emoji', title: 'Sunset 🎧 Rooftop Session' },
  { label: 'emoji only (nonsense)', title: '🎧🎉🔥' },
  { label: 'digits only (nonsense)', title: '2026' },
  { label: 'non-latin script', title: '東京 Night Market' },
  { label: 'same organiser, event A', title: 'Basement 45 Warehouse Sessions' },
  { label: 'same organiser, event B', title: 'Rooftop Summer Opening Party' },
]

async function calculatedFor(suffix: string | null): Promise<string | null> {
  const intent = await stripe.paymentIntents.create({
    amount: 5000,
    currency: 'aud',
    payment_method_types: ['card'],
    payment_method: 'pm_card_visa',
    confirm: true,
    ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
  })
  const chargeId = intent.latest_charge as string | null
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  return charge.calculated_statement_descriptor ?? null
}

async function main(): Promise<void> {
  const platform = await stripe.accounts.retrieve()
  const prefix = platform.settings?.card_payments?.statement_descriptor_prefix ?? null
  const staticDescriptor = platform.settings?.payments?.statement_descriptor ?? null

  console.log(`${DIM}platform account          : ${platform.id}${RESET}`)
  console.log(`${DIM}statement_descriptor      : ${staticDescriptor}${RESET}`)
  console.log(`${DIM}descriptor_prefix (live)  : ${prefix}${RESET}`)
  console.log(`${DIM}network limit             : ${NETWORK_LIMIT} characters including "* "${RESET}\n`)

  const rows: Row[] = []

  for (const { category, title } of await realTitlesByCategory()) {
    const suffix = statementDescriptorSuffix(title)
    const calculated = await calculatedFor(suffix)
    rows.push({
      group: `category: ${category}`,
      title,
      suffix,
      calculated,
      ok: (calculated?.length ?? 0) <= NETWORK_LIMIT,
      note: suffix === null ? 'no suffix, fell back to the platform descriptor' : '',
    })
  }

  for (const { label, title } of EDGE_CASES) {
    let suffix: string | null = null
    let calculated: string | null = null
    let note = ''
    try {
      suffix = statementDescriptorSuffix(title)
      calculated = await calculatedFor(suffix)
      if (suffix === null) note = 'no suffix, fell back to the platform descriptor'
    } catch (err) {
      note = `STRIPE REJECTED: ${(err as Error).message.slice(0, 80)}`
    }
    rows.push({
      group: `edge: ${label}`,
      title,
      suffix,
      calculated,
      ok: note.startsWith('STRIPE REJECTED') ? false : (calculated?.length ?? 0) <= NETWORK_LIMIT,
      note,
    })
  }

  console.log('WHAT THE BUYER SEES')
  console.log('='.repeat(100))
  for (const row of rows) {
    const flag = row.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
    console.log(`\n${row.group}`)
    console.log(`  title      : ${row.title}`)
    console.log(`  suffix     : ${row.suffix === null ? '(none)' : row.suffix}`)
    console.log(`  STATEMENT  : ${row.calculated ?? '(none)'}  ${DIM}[${row.calculated?.length ?? 0} chars]${RESET}  ${flag}`)
    if (row.note) console.log(`  note       : ${row.note}`)
  }

  const failures = rows.filter(r => !r.ok)
  const distinctSameOrganiser = new Set(
    rows.filter(r => r.group.startsWith('edge: same organiser')).map(r => r.calculated)
  )

  console.log(`\n${'='.repeat(100)}`)
  console.log(`rows                                : ${rows.length}`)
  console.log(`over the ${NETWORK_LIMIT} character limit or rejected : ${failures.length}`)
  console.log(`two events, one organiser, distinct : ${distinctSameOrganiser.size === 2 ? 'YES' : 'NO'}`)
  if (failures.length > 0) {
    console.log(`\n${RED}FAILURES${RESET}`)
    for (const f of failures) console.log(`  ${f.group}: ${f.note || f.calculated}`)
    process.exit(1)
  }
  console.log(`\n${GREEN}All statement lines are inside Stripe's published limit.${RESET}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
