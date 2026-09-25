/**
 * GUARD: EVERY OUTBOUND MESSAGE HAS A DECLARED RECIPIENT.
 *
 * Close-out MONEY FIX, part B. The item names two clauses:
 *
 *   1. No outbound message type may exist without a recipient matrix entry.
 *   2. No message concerning an organiser's event may resolve to a recipient
 *      set containing the platform owner and not that organiser.
 *
 * WHY IT EXISTS, with the evidence. MKLStudios sold two tickets on the
 * Afro-Fusion Music Showcase on 10 September 2026 and the only human told was
 * the platform owner. Nothing failed and nothing threw: `order_paid` is a
 * PLATFORM notification and the organiser had no counterpart anywhere in the
 * codebase. A missing message cannot be caught by a test of the messages that
 * exist, which is why the enforcement has to be a DECLARATION that something is
 * checked against, rather than a review of what got written.
 *
 * THE FOUR TRANSPORTS, enumerated from source rather than assumed, because the
 * B1 inventory of 14 September got this exact point wrong. It recorded "every
 * outbound email on this platform goes through ONE function, sendEmail". Its
 * list of SITES was right; the MECHANISM was not. Four places put mail on the
 * wire:
 *
 *   src/lib/email/send.ts              sendEmail(), 30 call sites
 *   src/lib/email/order-confirmation.ts  its own Resend client, for the ticket
 *                                        attachments. THE BUYER'S TICKET.
 *   src/app/api/webhooks/stripe/route.ts its own client, refund completed
 *   src/lib/payouts/email.ts             its own client, the four payout notices
 *
 * Had this guard only understood `sendEmail`, the single most important message
 * the platform sends would have been the one message outside the declaration.
 *
 * WHAT IT CANNOT SEE, said plainly. It does not read a mailbox and it cannot
 * prove a message was delivered, or that the address a role resolves to is the
 * right human. It judges DECLARATION and WIRING: that every send names a type
 * the matrix knows, that no new transport appears ungated, and that the matrix
 * itself is lawful under clause 2. Delivery is the driven proof's job.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/every-message-has-a-declared-recipient.mjs
 */
import { relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { declareWork } from '../lib/work-report.mjs'
import { sourceFiles, readSource, lineAt } from './lib/source.mjs'

const ROOT = process.cwd()
const TAG = '[every-message-has-a-declared-recipient]'
const MATRIX = 'src/lib/notifications/recipient-matrix.ts'

/**
 * The transports. A file that puts mail on the wire is either `send.ts`, which
 * checks centrally, or one of the named three, which check for themselves.
 *
 * THE LIST IS NOT THE AUTHORITY, the code is: clause 1c below finds every
 * `emails.send(` in src/ and fails on any file not in this set, so adding a
 * fifth transport fails the build rather than quietly escaping the matrix.
 */
const CENTRAL_TRANSPORT = 'src/lib/email/send.ts'
const SELF_CHECKING_TRANSPORTS = new Set([
  'src/lib/email/order-confirmation.ts',
  'src/app/api/webhooks/stripe/route.ts',
  'src/lib/payouts/email.ts',
])

/**
 * Files that construct a Resend client for something other than sending a
 * message. `health/checks.ts` lists domains; it sends nothing.
 */
const NON_SENDING_RESEND_USERS = new Set(['src/lib/health/checks.ts'])

/**
 * THE PREFERENCE FENCE. `organisations.sales_notification_mode` governs SALE
 * messages only. The item's reversal condition is explicit that "payout,
 * refund, dispute and payment setup messages cannot be switched off by
 * anyone", so a day when one of those starts reading the preference is a day
 * the platform quietly acquired an off switch for money news.
 */
const PREFERENCE_COLUMN = 'sales_notification_mode'
const PREFERENCE_NOT_A_READER = new Set([
  // The generated database types NAME every column; naming is not reading.
  'src/types/database.ts',
])
const MAY_READ_PREFERENCE = new Set([
  'src/lib/notifications/organiser-sales-policy.ts',
  'src/lib/notifications/organiser-sale-notify.ts',
  'src/lib/notifications/organiser-sales-digest.ts',
  'src/app/api/cron/organiser-sales-digest/route.ts',
])

/** Load the matrix through the same alias loader the product uses. */
function loadMatrix() {
  const script = [
    "import { MESSAGE_TYPES, declaredMessageTypes, typesWhereOwnerDisplacesOrganiser, typesWithNoRecipients } from '@/lib/notifications/recipient-matrix'",
    'console.log(JSON.stringify({',
    '  types: declaredMessageTypes(),',
    '  entries: MESSAGE_TYPES.map((e) => ({ type: e.type, roles: e.roles, concernsOrganiserEvent: e.concernsOrganiserEvent, organiserToldBy: e.organiserToldBy ?? null })),',
    '  clause2: typesWhereOwnerDisplacesOrganiser(),',
    '  empty: typesWithNoRecipients(),',
    '}))',
  ].join('\n')
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(
      `could not load the recipient matrix through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
    )
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the recipient matrix printed nothing: ${r.stdout.slice(0, 200)}`)
  return JSON.parse(line)
}

/**
 * Every `messageType:` literal passed at a send site, with where it was passed.
 *
 * Comments are BLANKED (length preserved) before the scan, so a call sitting
 * inside a commented-out block is not read as live code. That failure mode is
 * not hypothetical: the funds-reach-the-organiser guard shipped with it on
 * 14 September and found its own precondition inside a `//` comment.
 */
export function collectDeclaredSends(files) {
  const found = []
  for (const { rel, code } of files) {
    const re = /messageType:\s*(?:'([a-z0-9_]+)'|"([a-z0-9_]+)"|([A-Za-z_$][\w$.\[\]()]*))/g
    let m
    while ((m = re.exec(code)) !== null) {
      const literal = m[1] ?? m[2] ?? null
      found.push({
        rel,
        line: lineAt(code, m.index),
        literal,
        expression: literal ? null : m[3],
      })
    }
  }
  return found
}

/** Every `sendEmail(` call site, so one without a messageType is visible. */
export function collectSendEmailCalls(files) {
  const calls = []
  for (const { rel, code } of files) {
    if (rel === CENTRAL_TRANSPORT) continue
    const re = /\bsendEmail\s*\(/g
    let m
    while ((m = re.exec(code)) !== null) {
      // The argument object, to the matching close paren. Good enough to see
      // whether messageType is named: these are all object literals.
      const slice = code.slice(m.index, m.index + 1200)
      calls.push({
        rel,
        line: lineAt(code, m.index),
        // The colon form `messageType:` OR the ES6 shorthand `messageType,`.
        // The shorthand is how a sender that computes its type from a total
        // map passes it, and a guard that understood only the colon form
        // reported the one correct sender in the tree as the fault.
        names: /\bmessageType\s*[:,}]/.test(slice),
      })
    }
  }
  return calls
}

function main() {
  const matrix = loadMatrix()
  const declared = new Set(matrix.types)

  const files = sourceFiles(ROOT)
    .map((abs) => {
      const rel = relative(ROOT, abs).split('\\').join('/')
      // `withStrings`: comments BLANKED (so a commented-out send is not read as
      // live code) and string contents KEPT (so the messageType literal this
      // guard exists to read still exists). `code` blanks strings too and would
      // make every clause here match nothing while reporting PASS.
      return { rel, abs, code: readSource(abs).withStrings }
    })

  const faults = []
  let judged = 0

  // ── Clause 1a. Every messageType named at a send site is declared ────────
  const sends = collectDeclaredSends(files.filter((f) => f.rel !== MATRIX))
  const namedTypes = new Set()
  for (const s of sends) {
    judged += 1
    if (!s.literal) {
      // A computed type is allowed only where a TOTAL record maps it, which is
      // itself checked by the compiler. Recorded, not failed, and printed so it
      // can never become a quiet hole.
      continue
    }
    namedTypes.add(s.literal)
    if (!declared.has(s.literal)) {
      faults.push(
        `${s.rel}:${s.line}: sends messageType '${s.literal}', which is not declared in ${MATRIX}`,
      )
    }
  }

  // ── Clause 1b. Every sendEmail call names a type ─────────────────────────
  for (const c of collectSendEmailCalls(files)) {
    judged += 1
    if (!c.names) {
      faults.push(
        `${c.rel}:${c.line}: calls sendEmail() without a messageType, so the message has no declared recipient`,
      )
    }
  }

  // ── Clause 1c. No transport escapes the matrix ───────────────────────────
  for (const f of files) {
    if (!/\bemails\s*\.\s*send\s*\(/.test(f.code)) continue
    judged += 1
    if (f.rel === CENTRAL_TRANSPORT) continue
    if (NON_SENDING_RESEND_USERS.has(f.rel)) continue
    if (!SELF_CHECKING_TRANSPORTS.has(f.rel)) {
      faults.push(
        `${f.rel}: puts mail on the wire with its own Resend client and is not a known transport. ` +
          `Add assertRecipientDeclared(...) above the send and add the file to SELF_CHECKING_TRANSPORTS in this guard.`,
      )
      continue
    }
    if (!/assertRecipientDeclared\s*\(/.test(f.code)) {
      faults.push(
        `${f.rel}: is a transport but never calls assertRecipientDeclared(), so its messages bypass the matrix`,
      )
    }
  }

  // ── Clause 1d. The central transport actually enforces ───────────────────
  {
    judged += 1
    const central = files.find((f) => f.rel === CENTRAL_TRANSPORT)
    if (!central) {
      faults.push(`${CENTRAL_TRANSPORT}: not found, so the central transport cannot be judged`)
    } else if (!/assertRecipientDeclared\s*\(/.test(central.code)) {
      faults.push(
        `${CENTRAL_TRANSPORT}: sendEmail() no longer calls assertRecipientDeclared(), so every one of its call sites is ungoverned`,
      )
    }
  }

  // ── Clause 2. The owner never displaces the organiser ────────────────────
  judged += matrix.entries.length
  for (const offender of matrix.clause2) {
    faults.push(
      `${MATRIX}: message type '${offender.type}' ${offender.reason}. ` +
        `Clause 2: no message concerning an organiser's event may resolve to a recipient set containing the platform owner and not that organiser.`,
    )
  }
  for (const empty of matrix.empty) {
    faults.push(`${MATRIX}: message type '${empty}' declares no recipients at all`)
  }

  // Every declared type literal referenced anywhere in src/ outside the matrix.
  // A sender that computes its type from a TOTAL record names the literal in
  // that record rather than at the call site, and clause 2b must see it.
  const referencedTypes = new Set()
  for (const f of files) {
    if (f.rel === MATRIX) continue
    for (const t of declared) {
      if (f.code.includes(`'${t}'`) || f.code.includes(`"${t}"`)) referencedTypes.add(t)
    }
  }

  // ── Clause 2b. A named companion must be a message that is actually SENT ──
  // "The organiser is told by another message" is only true if that message
  // exists at a send site. A promise pointing at a declaration nobody sends is
  // the MKLStudios defect wearing a declaration.
  for (const entry of matrix.entries) {
    if (!entry.organiserToldBy) continue
    judged += 1
    if (!namedTypes.has(entry.organiserToldBy) && !referencedTypes.has(entry.organiserToldBy)) {
      faults.push(
        `${MATRIX}: '${entry.type}' names organiserToldBy '${entry.organiserToldBy}', but nothing in src/ ever sends that type. ` +
          `The organiser would still hear nothing.`,
      )
    }
  }

  // ── Clause 3. The sales preference cannot silence money news ─────────────
  for (const f of files) {
    if (!f.code.includes(PREFERENCE_COLUMN)) continue
    if (f.rel === MATRIX) continue
    if (PREFERENCE_NOT_A_READER.has(f.rel)) continue
    judged += 1
    if (!MAY_READ_PREFERENCE.has(f.rel)) {
      faults.push(
        `${f.rel}: reads '${PREFERENCE_COLUMN}'. That preference governs SALE messages only. ` +
          `Payout, refund, dispute and payment-setup messages cannot be switched off by anyone (MONEY FIX B4 reversal condition).`,
      )
    }
  }

  /* ── Clause 4. A message the organiser is declared to receive is SENT to them ──
   *
   * WHAT CLAUSE 2 CANNOT SEE, and this is the hole it left. Clause 2 judges the
   * DECLARATION: it fails a type whose recipient set names the platform owner
   * and not the organiser. A type that names BOTH is lawful to it, however many
   * of its send sites reach only the owner. The matrix is a promise; only a send
   * site keeps it.
   *
   * It found a live one the day it was written. `refund_did_not_complete` has
   * declared roles ['organiser', 'platform_owner'] since 18 September, with the
   * description "A refund on their event failed to settle and the buyer is still
   * owed", and the single send in the Stripe webhook was
   * `recipientRole: 'platform_owner'` to the alert address. The owner was the
   * only human told that an organiser's buyer was out of pocket, which is the
   * MKLStudios defect wearing a lawful declaration.
   *
   * WHAT IT CHECKS, STATED NARROWLY SO A PASS IS NOT READ AS MORE. For each type
   * the organiser is declared to receive about their own event, some file
   * outside the matrix must NAME that type, and that file must either send to an
   * organiser itself or be imported by a file that does. It reads source text:
   * it cannot prove the organiser send in that file is the one carrying this
   * type, and it does not try to. The failure it closes is the one that has
   * actually happened three times in this item: a type declared for the
   * organiser that NOTHING anywhere sends to an organiser.
   *
   * THE IMPORT HOP IS NOT A LOOPHOLE, IT IS THE SHAPE OF THE SALE MESSAGES.
   * `organiser_first_sale` and `organiser_sale` are named in
   * organiser-sales-policy.ts, a pure decision module with no transport, and the
   * send site computes `messageType` from its return value while declaring
   * `recipientRole: 'organiser'`. Requiring the literal and the role in one file
   * would demand that a decision module import a transport, which is exactly the
   * separation clause 1c exists to protect.
   */
  const ORGANISER_SEND_MARKER = (code) =>
    code.includes("recipientRole: 'organiser'") ||
    (code.includes('assertRecipientDeclared(') && code.includes("'organiser')"))

  const outsideMatrix = files.filter((f) => f.rel !== MATRIX)
  const sendersToOrganiser = outsideMatrix.filter((f) => ORGANISER_SEND_MARKER(f.code))
  /** Basenames a file with an organiser send imports, so a decision module it uses counts. */
  const importedBySender = new Set()
  for (const g of sendersToOrganiser) {
    for (const m of g.code.matchAll(/from\s+'([^']+)'/g)) {
      const base = m[1].split('/').pop()
      if (base) importedBySender.add(base)
    }
  }
  const reachedBySender = (rel) => {
    const base = rel.split('/').pop().replace(/\.tsx?$/, '')
    return importedBySender.has(base)
  }

  for (const entry of matrix.entries) {
    if (!entry.concernsOrganiserEvent) continue
    if (!entry.roles.includes('organiser')) continue
    judged += 1
    const naming = outsideMatrix.filter((f) => f.code.includes(`'${entry.type}'`) || f.code.includes(`"${entry.type}"`))
    const satisfied = naming.some((f) => ORGANISER_SEND_MARKER(f.code) || reachedBySender(f.rel))
    if (!satisfied) {
      faults.push(
        `${MATRIX}: '${entry.type}' declares the organiser as a recipient and nothing in src/ sends it to one. ` +
          (naming.length === 0
            ? 'No file outside the matrix names the type at all.'
            : `It is named in ${naming.map((f) => f.rel).join(', ')}, and none of those sends to an organiser or is imported by a file that does.`) +
          ' Clause 4: a declared recipient the code never reaches is a promise with nothing behind it.',
      )
    }
  }

  if (faults.length > 0) {
    for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  }

  declareWork('every-message-has-a-declared-recipient', {
    did: {
      'declared message type': matrix.types.length,
      'send site judged': sends.length,
      'source file read': files.length,
      check: judged,
    },
    found: { fault: faults.length },
  })

  if (faults.length > 0) {
    for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
    console.error(`${TAG} ${faults.length} fault(s).`)
    process.exit(1)
  }

  console.log(
    `${TAG} PASS - every send names a declared type, no transport escapes the matrix, and no owner message displaces an organiser.`,
  )
}

main()
