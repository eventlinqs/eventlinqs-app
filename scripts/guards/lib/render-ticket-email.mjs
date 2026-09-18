/**
 * RENDER THE TICKET EMAIL, BOTH BODIES, AND PRINT THEM AS JSON.
 *
 * Close-out PL1. The guard beside this one has to judge what the email ACTUALLY
 * CONTAINS, not what its source appears to say, and the difference is the whole
 * point: a line inside a branch that never runs is in the source and not in the
 * email. So it is rendered, from a fixture, with the real builders.
 *
 * IT IS A SEPARATE FILE AND A SEPARATE PROCESS because the builders are
 * TypeScript under `src/` and reach the repo's `@/` alias, so they need the two
 * loaders this repository already ships for exactly this
 * (`scripts/lib/server-only-shim.mjs` and `scripts/lib/src-alias-loader.mjs`).
 * A guard cannot enable a loader for itself once it is running, so the guard
 * spawns this with them.
 *
 * It writes ONE line of JSON to stdout and nothing else, so the caller can
 * parse it without guessing which line was the answer.
 *
 * Run (the guard does this for you):
 *   node --import ./scripts/lib/server-only-shim.mjs \
 *        --import ./scripts/lib/src-alias-loader.mjs \
 *        scripts/guards/lib/render-ticket-email.mjs
 */
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const mod = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'email', 'order-confirmation.ts')).href)

/*
 * THE PLAINEST POSSIBLE ORDER. One ticket, no seat, no stream, no refund
 * policy: everything optional is left out, so the footer this guard reads is
 * the footer EVERY buyer gets rather than the one a rich fixture produces.
 */
const order = {
  id: '00000000-0000-4000-8000-000000000001',
  order_number: 'EL-GUARDPL1',
  total_cents: 4500,
  currency: 'AUD',
  user_id: null,
}

const event = {
  title: 'A guard fixture event',
  start_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  timezone: 'Australia/Melbourne',
  venue_name: 'A guard fixture venue',
  venue_city: 'Geelong',
}

const tickets = [
  {
    ticket_code: 'GUARDPL1TICKET',
    secret: 'guard-fixture-secret',
    holder_name: 'A guard fixture holder',
    status: 'valid',
    seat: null,
  },
]

const html = mod.buildConfirmationEmailHtml(order, event, tickets, null, 'Guard')
const text = mod.buildConfirmationEmailText(order, event, tickets, null, 'Guard')

process.stdout.write(JSON.stringify({ html, text }))
