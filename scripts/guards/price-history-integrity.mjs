/**
 * GUARD: THE PRICE HISTORY IS WRITTEN BY THE DATABASE, AND THE DYNAMIC PRICING
 * SAVE IS ONE TRANSACTION.
 *
 * THE INVARIANT, 4 September 2026 (Scope v5 3.3). ticket_price_history is the
 * record a buyer reads on the event page of how a ticket's price has moved.
 * Migration 20260904000002 writes it from two DEFERRABLE INITIALLY DEFERRED
 * constraint triggers, on ticket_tiers and on dynamic_pricing_rules, which
 * judge a tier's EFFECTIVE price (get_current_tier_price) at commit. Two
 * properties make that record true, and both can be broken by an ordinary edit
 * that passes lint, typecheck, build and every unit test:
 *
 *   1. NO APPLICATION CODE WRITES THE HISTORY. A hand-written insert would say
 *      whatever its author believed the price to be, beside rows that say what
 *      the database charged. Two sources of one fact is the class of defect the
 *      maintained-aggregates guard exists for; here it is refused outright.
 *
 *   2. NO APPLICATION CODE WRITES dynamic_pricing_rules DIRECTLY. The save used
 *      to be three auto-committed statements (toggle the flag, delete the
 *      rules, insert the rules), and a trigger judging each would have recorded
 *      a flip to the base price between the delete and the insert, a move no
 *      buyer ever saw. save_dynamic_pricing does the three inside one
 *      transaction. Restoring `.from('dynamic_pricing_rules').delete()` in the
 *      action would compile, pass, and quietly corrupt the record.
 *
 * WHAT IT ALSO HOLDS: the action still reaches the RPC by name, and the
 * migration still declares BOTH triggers deferred, so a later migration that
 * re-creates a trigger as an ordinary immediate one is caught by reading.
 *
 * WHAT IT CANNOT SEE, plainly: it reads source text. It cannot prove the
 * trigger computes the right number; scripts/verify/ticket-price-history-
 * schema-verify.mjs proves that against TEST by writing and reading back.
 *
 * Proven on 4 September 2026 by restoring the old delete call in the action
 * (red, naming the file and line) and removing it again (green). Both outputs
 * are in C:\dev\EVIDENCE\A4-guard-price-history-integrity-proof.txt.
 *
 * Run standalone:  node scripts/guards/price-history-integrity.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

export const HISTORY_TABLE = 'ticket_price_history'
export const RULES_TABLE = 'dynamic_pricing_rules'
export const SAVE_RPC = 'save_dynamic_pricing'
export const ACTION_FILE = 'src/app/actions/dynamic-pricing.ts'
export const MIGRATION_FILE = 'supabase/migrations/20260904000002_ticket_price_history.sql'
export const TRIGGER_NAMES = ['ticket_tiers_record_price_history', 'dynamic_pricing_rules_record_price_history']

const WRITE_METHODS = /\.(insert|update|upsert|delete)\s*\(/

/**
 * Every `.from('<table>')` call in a source text, with the text that follows it
 * up to the end of that statement, judged for a write method. A statement ends
 * at a blank line, at the next `await`, or after 400 characters, whichever comes
 * first: PostgREST builders are chained on one expression, so a write on the
 * same builder always sits inside that window.
 */
export function findDirectWrites(text, table) {
  const findings = []
  const pattern = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
  let m
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index
    const rest = text.slice(start + m[0].length)
    const stopAt = [rest.indexOf('\n\n'), rest.search(/\bawait\b/), 400]
      .filter((n) => n >= 0)
      .reduce((a, b) => Math.min(a, b), Infinity)
    const statement = rest.slice(0, stopAt === Infinity ? 400 : stopAt)
    const write = WRITE_METHODS.exec(statement)
    if (write) {
      const line = text.slice(0, start).split('\n').length
      findings.push({ line, method: write[1] })
    }
  }
  return findings
}

/** The action reaches the RPC by name. */
export function actionCallsRpc(text) {
  return new RegExp(`rpc\\(\\s*['"\`]${SAVE_RPC}['"\`]`).test(text)
}

/** The migration declares both triggers as deferred constraint triggers. */
export function migrationDeclaresDeferredTriggers(sql) {
  const missing = []
  for (const name of TRIGGER_NAMES) {
    const declaration = new RegExp(
      `CREATE\\s+CONSTRAINT\\s+TRIGGER\\s+${name}[\\s\\S]*?DEFERRABLE\\s+INITIALLY\\s+DEFERRED[\\s\\S]*?FOR\\s+EACH\\s+ROW`,
      'i',
    )
    if (!declaration.test(sql)) missing.push(name)
  }
  return missing
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.d\.ts$/.test(entry)) acc.push(full)
  }
  return acc
}

export function runGuard(root = ROOT) {
  const failures = []
  const files = walk(join(root, 'src'))
  let scanned = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    scanned += 1
    const rel = relative(root, file).replace(/\\/g, '/')
    for (const f of findDirectWrites(text, HISTORY_TABLE)) {
      failures.push(`${rel}:${f.line}  .${f.method}() on ${HISTORY_TABLE}: the database writes the history, application code never does`)
    }
    for (const f of findDirectWrites(text, RULES_TABLE)) {
      failures.push(`${rel}:${f.line}  .${f.method}() on ${RULES_TABLE}: go through ${SAVE_RPC} so the save is one transaction`)
    }
  }

  const actionPath = join(root, ACTION_FILE)
  if (!existsSync(actionPath)) {
    failures.push(`${ACTION_FILE} is missing`)
  } else if (!actionCallsRpc(readFileSync(actionPath, 'utf8'))) {
    failures.push(`${ACTION_FILE} does not call rpc('${SAVE_RPC}')`)
  }

  const migrationPath = join(root, MIGRATION_FILE)
  if (!existsSync(migrationPath)) {
    failures.push(`${MIGRATION_FILE} is missing`)
  } else {
    for (const name of migrationDeclaresDeferredTriggers(readFileSync(migrationPath, 'utf8'))) {
      failures.push(`${MIGRATION_FILE} no longer declares ${name} as a DEFERRABLE INITIALLY DEFERRED constraint trigger`)
    }
  }

  return { scanned, failures }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { scanned, failures } = runGuard()
  if (failures.length > 0) {
    console.error(`[price-history-integrity] FAIL - ${failures.length} finding(s) across ${scanned} source files:`)
    for (const f of failures) console.error(`    ${f}`)
    console.error(
      `\n    The price history a buyer reads is written by the database triggers in\n` +
        `    ${MIGRATION_FILE}, and dynamic pricing is saved through ${SAVE_RPC}\n` +
        `    so the deferred triggers judge one final state. Route the write through them.\n`,
    )
    process.exit(1)
  }
  console.log(
    `[price-history-integrity] PASS - ${scanned} source files, no direct writes to ${HISTORY_TABLE} or ${RULES_TABLE}; ` +
      `${ACTION_FILE} reaches ${SAVE_RPC}; both triggers deferred in ${MIGRATION_FILE.split('/').pop()}.`,
  )
}
