/**
 * WHO RECEIVES WHAT, DECLARED ONCE. Close-out MONEY FIX, part B, step B3.
 *
 * "One place declares per message type which roles receive it, read at send
 * time. A type absent from the matrix cannot be sent and raises a named error
 * rather than defaulting to anyone."
 *
 * WHY THIS FILE EXISTS, with the evidence rather than a principle. MKLStudios
 * sold two tickets on the Afro-Fusion Music Showcase on 10 September 2026 and
 * the only human told was the platform owner. There was no organiser sale
 * message anywhere in the codebase to fail: `order_paid` is a PLATFORM
 * notification and always was. Nothing was broken, so nothing could be found
 * broken, which is exactly the failure mode a declaration catches and a code
 * review does not. The governing sentence of the item is
 * "the organiser's money belongs to the organiser and so does the news about
 * it", and this file is where that stops being a sentence.
 *
 * WHAT THIS FILE IS NOT. It does not resolve ADDRESSES. A role is a
 * relationship to the message ("the organiser of the event this is about"), and
 * turning a role into an inbox needs a database this module deliberately does
 * not touch, so the whole matrix stays a pure function of its own declaration
 * and can be tested exhaustively without a clock, a mailbox or a row. The
 * address half lives at each send site, which already holds the ids.
 *
 * THE ENFORCEMENT POINT IS EVERY TRANSPORT, NOT `sendEmail`, and that
 * distinction was a finding rather than a design choice. The B1 inventory of
 * 14 September recorded "every outbound email on this platform goes through ONE
 * function, sendEmail". Its list of SITES was right and its statement of the
 * MECHANISM was wrong: four transports send mail, and one of the three that are
 * not `sendEmail` is the buyer's ticket, the single most important message the
 * platform sends. They are enumerated in the guard header
 * (scripts/guards/every-message-has-a-declared-recipient.mjs) and all four are
 * gated.
 */

import type { PlatformNotificationKind } from './platform-policy'

/**
 * A RELATIONSHIP TO THE MESSAGE, never a person and never an address.
 *
 * `organiser` means "the organisation whose event or money this message is
 * about", which is the only reading under which clause 2 of the guard can be
 * checked. `platform_owner` is EventLinqs operations, a single destination
 * resolved from the environment.
 */
export const RECIPIENT_ROLES = [
  'buyer',
  'organiser',
  'platform_owner',
  'ticket_holder',
  'account_holder',
  'prospect',
  'support',
] as const

export type RecipientRole = (typeof RECIPIENT_ROLES)[number]

export interface MessageTypeDeclaration {
  /** The stable identifier a send site passes. */
  readonly type: string
  /** Every role that receives this message. Never empty. */
  readonly roles: readonly RecipientRole[]
  /**
   * True when the message is ABOUT a particular organiser's event, money or
   * attendees. This is the fact clause 2 of the guard is checked against, and
   * it is declared rather than inferred from the name, because a name is a
   * label and this is a rule about money.
   */
  readonly concernsOrganiserEvent: boolean
  /**
   * THE COMPANION THAT TELLS THE ORGANISER, and the field that makes clause 2
   * enforceable instead of merely quotable.
   *
   * Clause 2 reads: "no message concerning an organiser's event may resolve to
   * a recipient set containing the platform owner and not that organiser."
   * Read literally, per message, it would force every owner-facing operational
   * alert to be copied to the organiser, including ones that exist to flag a
   * problem WITH an organiser, which is not what the item means and would be a
   * worse platform.
   *
   * What the item means is that the owner is never the only human who learns
   * something about an organiser's money. So a type that goes to the owner
   * about an organiser's event satisfies clause 2 one of two ways: the
   * organiser is a direct recipient, or this field names the type that tells
   * them the same fact. The guard then checks that the named companion is
   * itself declared AND has a real send site, so "the organiser is told by
   * another message" cannot be a promise about a message that does not exist.
   * That is precisely the MKLStudios failure: the owner had `order_paid` and
   * the organiser had nothing at all.
   */
  readonly organiserToldBy?: string
  /** One line saying what the message is, so the matrix reads as a register. */
  readonly what: string
}

/**
 * THE MATRIX. Every outbound message type on the platform, enumerated from the
 * four transports rather than from memory.
 *
 * Adding a send site without adding a row here fails
 * `every-message-has-a-declared-recipient`, which is registered and blocking on
 * prebuild. That is the whole point: the defect this item exists to fix was a
 * message that was never written, and the only way to notice a message that
 * does not exist is to require the declaration first.
 */
export const MESSAGE_TYPES: readonly MessageTypeDeclaration[] = [
  // ── The buyer ───────────────────────────────────────────────────────────
  {
    type: 'order_confirmation_and_ticket',
    roles: ['buyer'],
    concernsOrganiserEvent: true,
    what: 'The order confirmation with the tickets attached.',
  },
  {
    type: 'refund_completed',
    roles: ['buyer', 'organiser'],
    concernsOrganiserEvent: true,
    what: 'A refund has settled back to the buyer.',
  },
  {
    type: 'refund_request_decision',
    roles: ['buyer'],
    concernsOrganiserEvent: true,
    what: 'The decision on a refund the buyer asked for.',
  },
  {
    type: 'ticket_transfer_received',
    roles: ['ticket_holder'],
    concernsOrganiserEvent: true,
    what: 'Somebody has sent this person a ticket.',
  },
  {
    type: 'seat_updated',
    roles: ['ticket_holder'],
    concernsOrganiserEvent: true,
    what: 'The organiser moved this holder to a different seat.',
  },
  {
    type: 'seat_assigned',
    roles: ['ticket_holder'],
    concernsOrganiserEvent: true,
    what: 'The organiser assigned this holder a seat.',
  },
  {
    type: 'waitlist_place_available',
    roles: ['prospect'],
    concernsOrganiserEvent: true,
    what: 'A place has come free on a waiting list this person joined.',
  },
  {
    type: 'attendee_event_alert',
    roles: ['prospect'],
    concernsOrganiserEvent: true,
    what: 'An alert about an event this attendee follows (the demand engine).',
  },
  {
    type: 'checkout_recovery',
    roles: ['prospect'],
    concernsOrganiserEvent: true,
    what: 'A resumable checkout the buyer abandoned.',
  },

  // ── The organiser ───────────────────────────────────────────────────────
  {
    type: 'organiser_first_sale',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The first ticket sold on one of their events.',
  },
  {
    type: 'organiser_sale',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'A ticket sold, sent immediately when that is their preference.',
  },
  {
    type: 'organiser_sales_digest',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The daily roll-up of their sales, which is the default.',
  },
  {
    type: 'organiser_refund_requested',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'A buyer has asked for a refund on their event.',
  },
  {
    type: 'organiser_dispute_opened',
    roles: ['organiser', 'platform_owner'],
    concernsOrganiserEvent: true,
    what: 'A chargeback was opened against their event. Urgent for both parties.',
  },
  {
    type: 'organiser_payment_setup_problem',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'Their Connect account cannot take money or cannot be paid out.',
  },
  {
    type: 'organiser_event_published',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'Their event is live and on sale.',
  },
  {
    type: 'payout_initiated',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'A transfer to their connected account has been started.',
  },
  {
    type: 'payout_paid',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The transfer landed.',
  },
  {
    type: 'payout_failed',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The transfer failed and needs their attention.',
  },
  {
    type: 'payout_reserve_released',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The refund-window reserve has been released to them.',
  },
  {
    type: 'refund_did_not_complete',
    roles: ['organiser', 'platform_owner'],
    concernsOrganiserEvent: true,
    what: 'A refund on their event failed to settle and the buyer is still owed.',
  },
  {
    type: 'organiser_launch_kit',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'The launch kit artefacts for their event.',
  },
  {
    type: 'organiser_fillrate_nudge',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'Their event is selling below pace and here is what to do.',
  },
  {
    type: 'marketplace_supplier_notice',
    roles: ['organiser'],
    concernsOrganiserEvent: true,
    what: 'A production-module message to a supplier or an organiser about a job.',
  },

  // ── Neither: the account, the prospect, support ─────────────────────────
  {
    type: 'auth_confirm_signup',
    roles: ['account_holder'],
    concernsOrganiserEvent: false,
    what: 'Confirm a new account.',
  },
  {
    type: 'auth_reset_password',
    roles: ['account_holder'],
    concernsOrganiserEvent: false,
    what: 'Reset a password.',
  },
  {
    type: 'auth_magic_link',
    roles: ['account_holder'],
    concernsOrganiserEvent: false,
    what: 'Sign in without a password.',
  },
  {
    type: 'founding_invitation',
    roles: ['prospect'],
    concernsOrganiserEvent: false,
    what: 'The Founding Organiser invitation for a city.',
  },
  {
    type: 'campaign_send',
    roles: ['prospect'],
    concernsOrganiserEvent: false,
    what: 'An outbound growth campaign message.',
  },
  {
    type: 'support_handoff',
    roles: ['support'],
    concernsOrganiserEvent: false,
    what: 'The assistant handing a conversation to a human.',
  },

  // ── The platform owner ──────────────────────────────────────────────────
  /*
   * THE FIVE PLATFORM KINDS, SPLIT. They used to be one row here, and one row
   * was a way of not answering the question: `order_paid` and `event_published`
   * are unambiguously about an organiser's event, and folding them in with
   * `organiser_created` let the whole group be declared as concerning no
   * organiser, which is how the MKLStudios sale came to have the owner as its
   * only reader. Split, each kind has to answer for itself.
   */
  {
    type: 'platform_order_paid',
    roles: ['platform_owner'],
    concernsOrganiserEvent: true,
    organiserToldBy: 'organiser_first_sale',
    what: 'A ticket was sold, as the owner sees it in the business feed.',
  },
  {
    type: 'platform_event_published',
    roles: ['platform_owner'],
    concernsOrganiserEvent: true,
    organiserToldBy: 'organiser_event_published',
    what: 'An event went live, as the owner sees it.',
  },
  {
    type: 'platform_organiser_created',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'A new organisation signed up.',
  },
  {
    type: 'platform_connect_onboarding_started',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'An organisation began Stripe onboarding.',
  },
  {
    type: 'platform_connect_charges_enabled',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'An organisation can now take money.',
  },
  {
    type: 'platform_notification_digest',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'The roll-up once the daily order ceiling is reached.',
  },
  {
    type: 'platform_weekly_digest',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'The weekly business digest.',
  },
  {
    type: 'platform_health_alert',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'A system health check went critical or recovered.',
  },
  {
    type: 'platform_sentinel_alert',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'An auth, webhook or Connect-divergence sentinel fired.',
  },
  {
    type: 'platform_transport_probe',
    roles: ['platform_owner'],
    concernsOrganiserEvent: false,
    what: 'The sentinel proving the mail transport itself still works.',
  },
] as const

/**
 * Raised when a send site names a type the matrix does not declare.
 *
 * NAMED, and it carries the type, because the alternative the item forbids is
 * "defaulting to anyone": a transport that cannot find a declaration has no
 * safe fallback, since every possible guess is a decision about who reads an
 * organiser's money news.
 */
export class UndeclaredMessageTypeError extends Error {
  readonly messageType: string

  constructor(messageType: string) {
    super(
      `Message type "${messageType}" is not declared in the recipient matrix ` +
        `(src/lib/notifications/recipient-matrix.ts). A message with no declared ` +
        `recipients cannot be sent: add the type to MESSAGE_TYPES naming every ` +
        `role that receives it. Refusing to guess a recipient.`,
    )
    this.name = 'UndeclaredMessageTypeError'
    this.messageType = messageType
  }
}

const BY_TYPE: ReadonlyMap<string, MessageTypeDeclaration> = new Map(
  MESSAGE_TYPES.map((entry) => [entry.type, entry]),
)

/** Every declared type, for the guard and for exhaustive tests. */
export function declaredMessageTypes(): readonly string[] {
  return MESSAGE_TYPES.map((entry) => entry.type)
}

export function isDeclaredMessageType(messageType: string): boolean {
  return BY_TYPE.has(messageType)
}

/**
 * The roles that receive this message type.
 *
 * Throws `UndeclaredMessageTypeError` for anything not declared. This is the
 * function every transport calls before it sends, so the throw is the
 * enforcement and not a lint.
 */
export function resolveRecipientRoles(messageType: string): readonly RecipientRole[] {
  const entry = BY_TYPE.get(messageType)
  if (!entry) throw new UndeclaredMessageTypeError(messageType)
  return entry.roles
}

export function messageTypeDeclaration(messageType: string): MessageTypeDeclaration {
  const entry = BY_TYPE.get(messageType)
  if (!entry) throw new UndeclaredMessageTypeError(messageType)
  return entry
}

/**
 * Raised when a transport is asked to send a declared type to a role that type
 * does not declare. Separate from `UndeclaredMessageTypeError` because the two
 * are different mistakes and the remedies differ: one is a missing
 * declaration, the other is a send site aiming at the wrong person.
 */
export class UndeclaredRecipientRoleError extends Error {
  readonly messageType: string
  readonly role: string

  constructor(messageType: string, role: string, declared: readonly RecipientRole[]) {
    super(
      `Message type "${messageType}" is not declared to reach the "${role}" role ` +
        `(declared: ${declared.join(', ')}). Either the send site is aiming at the ` +
        `wrong person, or the matrix entry in ` +
        `src/lib/notifications/recipient-matrix.ts needs that role added deliberately.`,
    )
    this.name = 'UndeclaredRecipientRoleError'
    this.messageType = messageType
    this.role = role
  }
}

/**
 * THE CALL EVERY TRANSPORT MAKES BEFORE IT SENDS.
 *
 * Read at send time, per B3, rather than checked in a test: a check that only
 * runs in CI is a check a production code path can walk straight past.
 */
export function assertRecipientDeclared(messageType: string, role: RecipientRole): void {
  const roles = resolveRecipientRoles(messageType)
  if (!roles.includes(role)) {
    throw new UndeclaredRecipientRoleError(messageType, role, roles)
  }
}

/**
 * CLAUSE 2, AS A FUNCTION, so the guard and the unit tests judge the same rule
 * rather than two descriptions of it.
 *
 * "No message concerning an organiser's event may resolve to a recipient set
 * containing the platform owner and not that organiser."
 *
 * Satisfied by a direct organiser recipient, or by a declared companion type
 * that tells the organiser the same fact (see `organiserToldBy`). A companion
 * that is not itself declared does NOT satisfy it, because a promise pointing
 * at nothing is the defect rather than the fix.
 *
 * Returns the offending types with the reason, empty when the matrix is lawful.
 */
export function typesWhereOwnerDisplacesOrganiser(): readonly {
  type: string
  reason: string
}[] {
  const offenders: { type: string; reason: string }[] = []
  for (const entry of MESSAGE_TYPES) {
    if (!entry.concernsOrganiserEvent) continue
    if (!entry.roles.includes('platform_owner')) continue
    if (entry.roles.includes('organiser')) continue
    if (!entry.organiserToldBy) {
      offenders.push({
        type: entry.type,
        reason:
          'concerns an organiser event and goes to the platform owner, but the ' +
          'organiser is neither a recipient nor named in organiserToldBy',
      })
      continue
    }
    if (!BY_TYPE.has(entry.organiserToldBy)) {
      offenders.push({
        type: entry.type,
        reason: `names organiserToldBy "${entry.organiserToldBy}", which is not itself a declared message type`,
      })
      continue
    }
    const companion = BY_TYPE.get(entry.organiserToldBy)!
    if (!companion.roles.includes('organiser')) {
      offenders.push({
        type: entry.type,
        reason: `names organiserToldBy "${entry.organiserToldBy}", which does not have the organiser as a recipient`,
      })
    }
  }
  return offenders
}

/**
 * The owner's five business kinds, mapped to their declared message types.
 *
 * A TOTAL record rather than a switch with a default: adding a sixth
 * `platform_notification_kind` will not compile until it has been given a type
 * here and a row in the matrix above, which is the only way a new owner
 * notification cannot quietly arrive without anyone deciding whether the
 * organiser should hear about it too.
 */
export const PLATFORM_NOTIFICATION_MESSAGE_TYPES: Record<PlatformNotificationKind, string> = {
  organiser_created: 'platform_organiser_created',
  connect_onboarding_started: 'platform_connect_onboarding_started',
  connect_charges_enabled: 'platform_connect_charges_enabled',
  event_published: 'platform_event_published',
  order_paid: 'platform_order_paid',
}

export function platformNotificationMessageType(kind: PlatformNotificationKind): string {
  return PLATFORM_NOTIFICATION_MESSAGE_TYPES[kind]
}

/**
 * A declaration with no recipients is a message nobody reads. Separate from
 * clause 2 because an empty set passes clause 2 vacuously.
 */
export function typesWithNoRecipients(): readonly string[] {
  return MESSAGE_TYPES.filter((entry) => entry.roles.length === 0).map((entry) => entry.type)
}
