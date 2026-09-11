/**
 * CONNECTED ACCOUNT HEALTH. Close-out S1.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO. The daily heartbeat used to compare
 * `organisations.name` with `business_profile.name` on the connected Stripe
 * account and report a fault when they differed. Stripe holds a public trading
 * name and a legal entity name as two separate fields by design, and for a sole
 * trader they will almost always differ, correctly. MKLStudios trading under the
 * legal name Michael Mirindi MWIKIZA is a correctly configured account, not a
 * fault. Left in place that check fires for nearly every organiser for ever and
 * trains the owner to ignore the daily email, which destroys the value of every
 * other line in it. The founder's ruling was to delete it outright rather than
 * soften it, and this file is what stands in its place: the fields that actually
 * determine whether money moves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE NARROWING OF S1'S EXACT RULES, AND THE MEASUREMENT BEHIND IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * S1 states: "RED if any account has charges_enabled false, or payouts_enabled
 * false, or a disabled_reason set, or anything in past_due."
 *
 * Applied literally that rule reproduces the defect it was written to remove.
 * Measured on TEST rather than imagined: organisation "Thunderbird Freight
 * Sessions", account acct_1U2EYNGsSxcPFPRu, carries charges_enabled false,
 * payouts_enabled false, disabled_reason "requirements.past_due" and 57 entries
 * in past_due including tos_acceptance.date and external_account. That is
 * somebody who pressed "set up payouts" and walked away before entering
 * anything. It has never worked, so it cannot have stopped working. RED maps to
 * the existing 'critical' severity, which emails the owner immediately and
 * re-emails every thirty minutes, so one abandoned signup would hold the
 * platform in permanent CRITICAL.
 *
 * Stripe's own example Account object has exactly that shape for a newly created
 * account, and Stripe publishes the field that separates the two cases:
 *
 *     details_submitted (boolean): "Whether account details have been
 *     submitted. Accounts with Stripe Dashboard access, which includes Standard
 *     accounts, cannot receive payouts before this is true. Accounts where this
 *     is false should be directed to an onboarding flow to finish submitting
 *     account details."
 *     - https://docs.stripe.com/api/accounts/object (fetched 2026-09-11)
 *
 * So an account with `details_submitted` false is AMBER and never RED, named,
 * with "has never finished Stripe onboarding" as the action. Every other account
 * keeps S1's rules unchanged, and RED therefore means what S1 wants it to mean:
 * money could move and now cannot. This narrows RED only. It narrows no field,
 * hides no account and drops no line from the report.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE BUYER'S BANK STATEMENT IS NOT THIS FILE'S PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * S1 also describes a statement-descriptor defect: a buyer seeing an organiser's
 * personal legal name, not recognising it, and disputing the charge. Read from
 * the code rather than assumed, as S1 requires: src/lib/payments/create-platform-charge.ts
 * is the only charge creator on this platform and it passes no `on_behalf_of`,
 * no `transfer_data` and no `application_fee_amount`. That is SEPARATE CHARGES
 * AND TRANSFERS WITHOUT on_behalf_of, and Stripe publishes what the buyer then
 * sees:
 *
 *     "The customer's statement uses the platform account's static component for
 *     the following charge types: Destination charges without on_behalf_of;
 *     Separate charges and transfers without on_behalf_of"
 *     - https://docs.stripe.com/connect/statement-descriptors (fetched 2026-09-11)
 *
 * So on THIS architecture an organiser's legal entity name cannot reach a
 * buyer's statement at all. The descriptor clause below therefore reports a
 * connected account whose descriptor is not derived from its own trading name as
 * a warning about the account's own records and about the day somebody adds
 * `on_behalf_of`, and it does not claim a chargeback risk that does not exist
 * here. Overstating it would be the same sin as the check this file replaced.
 */

/** The narrow slice of a Stripe Account this assessment reads. Kept as a local
 *  shape rather than `Stripe.Account` so the accounts LIST response, which
 *  arrives as plain JSON from a raw fetch, and a typed SDK object can both be
 *  assessed by the same function without either being cast to the other. */
export type ConnectedAccountFacts = {
  id: string
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  business_profile?: { name?: string | null } | null
  settings?: {
    payments?: { statement_descriptor?: string | null } | null
    card_payments?: { statement_descriptor_prefix?: string | null } | null
  } | null
  requirements?: {
    disabled_reason?: string | null
    currently_due?: string[] | null
    past_due?: string[] | null
    pending_verification?: string[] | null
    current_deadline?: number | null
  } | null
  future_requirements?: {
    currently_due?: string[] | null
    current_deadline?: number | null
  } | null
}

/** An organisation row that points at the account. More than one is itself a
 *  fault, and a worse one than anything else here. */
export type AccountOwner = { id: string; name: string }

export type HealthVerdict = 'green' | 'amber' | 'red'

export type AccountAssessment = {
  accountId: string
  verdict: HealthVerdict
  /** One line per finding, each already naming the organiser and the account. */
  findings: string[]
  /** Plain words, addressed to the owner, saying what the organiser must do. */
  actions: string[]
}

/** S1: "a current_deadline falls inside 14 days" is AMBER. */
export const DEADLINE_AMBER_DAYS = 14
/** S1: "anything sits in pending_verification for more than 3 days" is AMBER. */
export const PENDING_VERIFICATION_AMBER_DAYS = 3

/** Worst verdict wins, so one broken account is never averaged away by nine
 *  healthy ones. */
export function worseOf(a: HealthVerdict, b: HealthVerdict): HealthVerdict {
  if (a === 'red' || b === 'red') return 'red'
  if (a === 'amber' || b === 'amber') return 'amber'
  return 'green'
}

function list(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : []
}

/**
 * Name the requirements rather than count them. S1 is explicit about this
 * ("listed by name, not just counted") and it is the difference between a line
 * the owner can act on and a line that only says something is wrong. Long lists
 * are capped so one abandoned account cannot push every other account's line out
 * of a daily email, and the cap says how many it hid.
 */
const NAMED_LIMIT = 8
function named(values: string[]): string {
  if (values.length <= NAMED_LIMIT) return values.join(', ')
  return `${values.slice(0, NAMED_LIMIT).join(', ')} (+${values.length - NAMED_LIMIT} more)`
}

function daysUntil(unixSeconds: number | null | undefined, now: number): number | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null
  return Math.ceil((unixSeconds * 1000 - now) / 86_400_000)
}

function who(owners: AccountOwner[], accountId: string): string {
  if (owners.length === 0) return `an organisation the platform no longer holds (${accountId})`
  if (owners.length === 1) return `"${owners[0].name}" (${accountId})`
  return `${owners.length} organisations sharing ${accountId}`
}

/**
 * Assess ONE connected account.
 *
 * `pendingVerificationAges` maps a requirement string to how many whole days the
 * monitor has been watching it wait. Stripe publishes what is pending and never
 * when it started, so the age comes from public.connect_requirement_watch. An
 * absent entry means this is the first observation, which is age zero and
 * correctly not yet a finding.
 */
export function assessConnectedAccount(
  account: ConnectedAccountFacts,
  owners: AccountOwner[],
  opts: { now?: number; pendingVerificationAges?: Map<string, number> } = {},
): AccountAssessment {
  const now = opts.now ?? Date.now()
  const ages = opts.pendingVerificationAges ?? new Map<string, number>()
  const findings: string[] = []
  const actions: string[] = []
  let verdict: HealthVerdict = 'green'
  const label = who(owners, account.id)

  const chargesEnabled = account.charges_enabled === true
  const payoutsEnabled = account.payouts_enabled === true
  const detailsSubmitted = account.details_submitted === true
  const disabledReason = (account.requirements?.disabled_reason ?? '').trim()
  const currentlyDue = list(account.requirements?.currently_due)
  const pastDue = list(account.requirements?.past_due)
  const pendingVerification = list(account.requirements?.pending_verification)
  const futureDue = list(account.future_requirements?.currently_due)

  // ── More than one organisation on one account ─────────────────────────────
  //
  // Carried over from the deleted check, which found it on TEST across 42
  // organisations and 12 accounts. It is not a name problem and so it survives
  // S1's deletion: every organiser sharing an account is paid into the same
  // Stripe balance, which is a money fault rather than a monitoring one.
  if (owners.length > 1) {
    verdict = worseOf(verdict, 'red')
    findings.push(
      `${account.id} is claimed by ${owners.length} organisations (${owners.slice(0, 3).map(o => `"${o.name}"`).join(', ')}${owners.length > 3 ? ', ...' : ''}), so their money settles into one Stripe account`,
    )
    actions.push(
      `Decide which organisation owns ${account.id} and give every other one its own connected account, before any of them sells a ticket.`,
    )
  }

  // ── Never onboarded: AMBER, never RED. The measured narrowing above. ──────
  if (!detailsSubmitted) {
    verdict = worseOf(verdict, 'amber')
    findings.push(
      `${label} has never finished Stripe onboarding (details_submitted false, charges ${chargesEnabled ? 'on' : 'off'}, payouts ${payoutsEnabled ? 'on' : 'off'})`,
    )
    actions.push(
      `${label} started setting up payouts and did not finish. They cannot be paid until they do. Send them back to Payouts in their dashboard. Nothing is broken.`,
    )
    // Everything that follows describes an account that has completed
    // onboarding. Reporting fifty-seven past_due fields on somebody who never
    // typed anything is noise, and it is exactly the noise this file exists to
    // stop.
    return { accountId: account.id, verdict, findings, actions }
  }

  // ── RED: money could move and now cannot ──────────────────────────────────
  if (!chargesEnabled) {
    verdict = worseOf(verdict, 'red')
    findings.push(`${label} cannot take charges (charges_enabled false)`)
    actions.push(`${label} cannot sell a ticket right now. Everything below tells you what Stripe is waiting for.`)
  }
  if (!payoutsEnabled) {
    verdict = worseOf(verdict, 'red')
    findings.push(`${label} cannot be paid out (payouts_enabled false)`)
    actions.push(`${label} can hold money but cannot receive it. Usually a missing bank account or an unverified identity.`)
  }
  if (disabledReason.length > 0) {
    verdict = worseOf(verdict, 'red')
    findings.push(`${label} is disabled by Stripe: ${disabledReason}`)
  }
  if (pastDue.length > 0) {
    verdict = worseOf(verdict, 'red')
    findings.push(`${label} is past due on ${pastDue.length}: ${named(pastDue)}`)
    actions.push(`${label} has passed Stripe's deadline for the fields above. Stripe has already stopped or is about to stop this account.`)
  }

  // ── AMBER: working today, with something that will stop it ────────────────
  if (currentlyDue.length > 0) {
    verdict = worseOf(verdict, 'amber')
    findings.push(`${label} currently owes Stripe ${currentlyDue.length}: ${named(currentlyDue)}`)
    actions.push(`${label} must give Stripe the fields above. They can still trade for now.`)
  }

  const deadlineDays = daysUntil(account.requirements?.current_deadline, now)
  if (deadlineDays !== null && deadlineDays <= DEADLINE_AMBER_DAYS) {
    verdict = worseOf(verdict, 'amber')
    findings.push(
      deadlineDays < 0
        ? `${label} passed its Stripe deadline ${Math.abs(deadlineDays)} day(s) ago`
        : `${label} has ${deadlineDays} day(s) until its Stripe deadline`,
    )
  }

  const stuck = pendingVerification.filter(r => (ages.get(r) ?? 0) > PENDING_VERIFICATION_AMBER_DAYS)
  if (stuck.length > 0) {
    verdict = worseOf(verdict, 'amber')
    findings.push(
      `${label} has ${stuck.length} waiting on Stripe verification for more than ${PENDING_VERIFICATION_AMBER_DAYS} days: ${named(stuck)}`,
    )
    actions.push(
      `Stripe has been reviewing the above for ${stuck.map(r => ages.get(r) ?? 0).reduce((a, b) => Math.max(a, b), 0)} days. If the document was rejected the organiser is usually told inside Stripe and not by us; ask them to check.`,
    )
  }

  // ── Future requirements: reported always, AMBER only near the deadline ────
  //
  // S1 asks for future_requirements.currently_due and current_deadline. They are
  // reported whenever present, because the owner asked to see them, but they
  // only move the verdict when the deadline is close: a future requirement with
  // a deadline months out is information, and treating information as a warning
  // is how a warning stops meaning anything.
  if (futureDue.length > 0) {
    const futureDays = daysUntil(account.future_requirements?.current_deadline, now)
    findings.push(
      `${label} has ${futureDue.length} upcoming Stripe requirement(s)${futureDays === null ? ' with no deadline set' : `, due in ${futureDays} day(s)`}: ${named(futureDue)}`,
    )
    if (futureDays !== null && futureDays <= DEADLINE_AMBER_DAYS) {
      verdict = worseOf(verdict, 'amber')
      actions.push(`${label} has new Stripe requirements landing within ${DEADLINE_AMBER_DAYS} days. Give them warning before Stripe does.`)
    }
  }

  // ── The statement descriptor on the account's own records ─────────────────
  //
  // Scoped honestly to what is true here, per the header: on separate charges
  // and transfers without on_behalf_of the buyer never sees this string, so this
  // is a finding about the connected account's own records and about the day
  // somebody sets on_behalf_of. It is never RED and it never claims a chargeback.
  const tradingName = (account.business_profile?.name ?? '').trim()
  const descriptor = (account.settings?.payments?.statement_descriptor ?? '').trim()
  if (tradingName.length > 0 && descriptor.length > 0 && !descriptorMatchesTradingName(descriptor, tradingName)) {
    verdict = worseOf(verdict, 'amber')
    findings.push(
      `${label} has the Stripe statement descriptor "${descriptor}", which is not derived from its trading name "${tradingName}"`,
    )
    actions.push(
      `Buyers on EventLinqs are charged on the platform account, so this string is not on their statements today and no buyer is confused by it. It would be, the day a charge sets on_behalf_of. Setting business_profile.name resets it: Stripe resets a descriptor based on lower precedence data when the name is set.`,
    )
  }

  return { accountId: account.id, verdict, findings, actions }
}

/**
 * Whether a descriptor plausibly came from the trading name.
 *
 * Stripe truncates, uppercases and strips punctuation when it generates a
 * descriptor from a name, and the complete descriptor is capped at 22
 * characters, so an exact comparison would report every long trading name as a
 * mismatch. Comparing the leading run that survives truncation is the test that
 * matches what Stripe actually does.
 */
export function descriptorMatchesTradingName(descriptor: string, tradingName: string): boolean {
  const flatten = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const d = flatten(descriptor)
  const n = flatten(tradingName)
  if (d.length === 0 || n.length === 0) return true
  return n.startsWith(d) || d.startsWith(n)
}

export type PlatformAccountHealth = {
  verdict: HealthVerdict
  /** One line per account, worst first, so a daily email reads top down. */
  findings: string[]
  actions: string[]
  assessed: number
  green: number
}

/** Roll every account's assessment into the one result the health check reports. */
export function assessAllAccounts(
  assessments: AccountAssessment[],
): PlatformAccountHealth {
  const rank: Record<HealthVerdict, number> = { red: 0, amber: 1, green: 2 }
  const sorted = [...assessments].sort((a, b) => rank[a.verdict] - rank[b.verdict])
  let verdict: HealthVerdict = 'green'
  const findings: string[] = []
  const actions: string[] = []
  for (const a of sorted) {
    verdict = worseOf(verdict, a.verdict)
    findings.push(...a.findings)
    for (const action of a.actions) if (!actions.includes(action)) actions.push(action)
  }
  return {
    verdict,
    findings,
    actions,
    assessed: assessments.length,
    green: assessments.filter(a => a.verdict === 'green').length,
  }
}
