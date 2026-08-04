# EventLinqs legal pages: build summary and review pack

Built 24 July 2026 on `feat/walkthrough-defects`. Australian jurisdiction.
Four policies rewritten end to end, plus link wiring. No database writes, no
change to the funds-holding payment engine, no design change.

---

## LAWYER REVIEW

**Do not take real money from the public until a solicitor has cleared the items
below.** They are ordered by risk. Items marked CODE mean the drafting and the
software do not currently agree, so a lawyer's answer alone will not close them.

### Blocking, commercial and legal

0. **PRODUCTION IS CHARGING THE WRONG FEES. CODE. Found while building these
   pages, and it blocks launch on its own.** The locked fee migration
   `20260627000001_fee_structure_locked_au.sql` **has not been applied to the
   production database**. Read directly from each database (read-only, no
   writes), the currently effective AU rules are:

   | Rule | Production (`gndnldyf...`) | TEST (`vkapkibz...`) | Locked structure |
   |---|---|---|---|
   | `platform_fee_percentage` | **2.0%** (v2) | 3.5% (v3) | 3.5% |
   | `platform_fee_fixed` | **50c** (v1) | 99c (v2) | 99c |
   | `processing_fee_percentage` | **2.9%** (v1) | 2.5% (v2) | 2.5% |
   | `processing_fee_fixed_cents` | **30c** (v1) | 0 (v2) | 0 |

   On a $20 ticket production would charge about **$21.78** all-in, TEST charges
   **$22.19**, and every marketing asset published states **$22.19** (see
   `docs/marketing/`). Advertising one all-in price and charging another is
   precisely the drip-pricing and misleading-price exposure the ACCC pursues.
   Because these legal pages read the fee live, a production deploy today would
   publish "2% + AUD 0.50" in the Terms and the Organiser Agreement, contradicting
   the marketing. **Apply the migration to production before launch** (Lawal
   applies migrations with `supabase db push --linked`; never the Dashboard SQL
   editor). Then re-read this table and confirm it matches the locked column.

   Note also that on both databases several versions of the same rule are
   concurrently effective (`effective_until IS NULL` on v1, v2 and v3). The
   resolver correctly takes the highest version, so behaviour is right, but the
   superseded rows should be closed off for auditability.

1. **Who bears the fee on a refunded order. CODE.** The founder's instruction was
   that EventLinqs recovers the platform and processing fee from the organiser on
   a cancelled event. **The code does not do this.** In
   `supabase/migrations/20260621000002_reconcile_refund_event_scope.sql`, the
   clawback is `v_share := p_refund_amount_cents - v_app_fee`: the organiser is
   debited the refund *minus* the proportional fees, so **EventLinqs currently
   absorbs the fee** and refunds it to the buyer out of its own margin. I have
   drafted the Organiser Agreement to state the mechanism that actually operates
   today, plus an express reservation of the right to recover fees where the
   organiser cancelled or misrepresented the event. Decisions needed: (a) is the
   commercial intent to change the code so the organiser bears it, (b) is the
   reservation of right enforceable, and (c) does recovering a fee for a service
   already performed survive the unfair contract terms regime.

2. **Unfair contract terms, Part 2-3 of the ACL. HIGHEST LEGAL RISK.** Since
   November 2023 there are civil penalties for merely *proposing* an unfair term
   in a standard form small business contract, and most organisers will qualify.
   Every one of these needs review: unilateral variation of fees and terms on 30
   days notice; our discretion to suspend sales, unpublish listings and withhold
   or extend holds on payouts; the indemnity; set-off of debts against payouts on
   the organiser's *other* events; the liability cap; and our discretion to raise
   a reserve. Some of these may need to be narrowed or made reciprocal.

3. **Holding buyer funds: financial services licensing.** EventLinqs collects and
   holds ticket money and pays organisers after the event. Confirm whether this
   is a non-cash payment facility requiring an AFS licence or whether an
   exemption applies, whether the funds must be held on trust or in a segregated
   account, and whether the "limited payment collection agent" characterisation
   in the Terms and the Organiser Agreement is the correct and defensible one.
   Also confirm any AML/CTF obligations.

4. **GST and the agency posture.** The policies state that the organiser is the
   seller and remits GST on the ticket price, that EventLinqs deals with GST only
   on its own fees and only once registered, and that no separate GST line is
   added. Confirm this is correct for a limited collection agent, confirm the
   position while under the $75k registration threshold, and confirm the tax
   invoice obligations that follow for both sides.

5. **Founding Organiser offer as a representation about a future matter.**
   Section 4 of the ACL reverses the onus: we must hold reasonable grounds for
   the promise. The drafted terms are zero platform fees for 6 months, extended
   by 3 months per successful referral, capped at the first 50 organisers across
   Geelong and Melbourne, with the processing fee still payable. Confirm the cap
   and the referral mechanic are administered exactly as written, that "successful
   referral" is defined tightly enough to be enforceable, and that we can
   evidence how places were allocated. **CODE:** there is no fee-holiday or
   promotional-rate mechanism in `pricing_rules` today. The waiver would be
   applied as a per-organiser override, and that needs to be set up and audited
   before the first Founding Organiser sells a ticket.

6. **Entity and personal liability.** Everything is contracted through a sole
   trader, "Lawal Adams trading as EventLinqs, ABN 30 837 447 587". The
   indemnities, the funds-holding, and the consumer-facing refund guarantee all
   sit on personal liability. Advice on incorporating before launch is worth
   getting now rather than after the first dispute.

### Clause-level review

7. **Liability cap** (Terms, "Liability"; Organiser Agreement, "Liability and
   Indemnity"). Capped at the greater of fees paid in 12 months or AUD 100 for
   buyers, and fees earned in 12 months for organisers. Confirm enforceability
   against the consumer guarantees and the unfair terms regime, and confirm the
   resupply limitation is available for the services we actually provide.

8. **Refund of EventLinqs fees on cancellation.** We promise the buyer a full
   all-in refund including both fees for a cancelled, materially changed, or
   opted-out-of rescheduled event. Confirm this is the correct ACL position for a
   ticketing intermediary that is *not* the event supplier, and confirm we are
   not over-promising relative to what we can recover.

9. **Our characterisation as "not the supplier of the event".** The Terms draw a
   firm line between the organiser as event supplier and EventLinqs as ticketing
   service. Confirm this holds up given that we are merchant of record, hold the
   funds, and set refund outcomes. If a court would treat us as a supplier of the
   event, the liability and refund sections need rewriting.

10. **Ticket resale restriction** (Refund and Ticket Policy, "Ticket Terms").
    Drafted as "must not be resold above the total amount you paid". Resale caps
    are state-based and inconsistent, and several states use a 10 percent margin
    rather than face value. Confirm the wording works nationally or make it
    jurisdiction-specific.

11. **Cancellation obligations on organisers** (Organiser Agreement,
    "Cancelling or Rescheduling"): notification within 24 hours, our authority to
    refund without further approval, and repayment of already-disbursed funds
    within 7 days as a debt. Confirm enforceability and whether the 7 day demand
    is reasonable.

12. **Chargeback liability and debt recovery.** Organiser carries chargeback
    liability, network fees may be passed on, and shortfalls become a debt
    recoverable against other events. Confirm, and confirm the disclosure is
    adequate for an organiser to understand the exposure before signing.

13. **Indemnity scope** (Organiser Agreement). Broad indemnity for claims arising
    from the event, listings, data handling and regulator action. Likely to draw
    unfair-terms attention in a small business contract. Consider carve-outs.

14. **Minors.** Account minimum age 16, with under-18s relying on parent or
    guardian agreement. Confirm this is workable given a minor's capacity to
    contract, and confirm the position for age-restricted events.

15. **Dispute resolution.** Mediation through the Resolution Institute, then the
    non-exclusive jurisdiction of Victorian courts, with an express saving for
    tribunal and regulator routes. Confirm the saving is drafted widely enough.

16. **Privacy: overseas disclosure (APP 8).** The policy names the United States,
    the European Union and Singapore, and asserts that we take reasonable steps
    including data protection terms with each provider, and that primary
    infrastructure is set to Australian or regional data centres where offered.
    **Each of those assertions must be verified as literally true** before
    launch, provider by provider (Stripe, Supabase, Vercel, Resend, Upstash,
    Sentry, Google, Anthropic). An inaccurate APP 8 statement is itself a breach.

17. **Privacy: the retention schedule.** 7 years for transaction and tax records,
    3 years for support correspondence, 12 months for technical logs. Confirm
    these match the actual retention configured in the systems, and that the
    7 year figure is right for the applicable tax records.

18. **Privacy: deletion promises.** The policy promises removal of profile,
    preferences, follows and marketing contacts, and de-identification of the
    rest. **CODE:** confirm an account deletion and de-identification path exists
    and does exactly this. Do not launch this wording without testing it.

19. **Privacy: organisers as separate handlers.** Many organisers will fall under
    the small business exemption and not be bound by the Privacy Act directly.
    We bind them by contract instead. Confirm that is enforceable and sufficient,
    given we are disclosing attendee personal information to them.

20. **Notifiable Data Breaches.** The policy states we maintain a data breach
    response plan and will assess within 30 days. Confirm the plan exists in
    writing before this sentence is published.

21. **Anthropic and AI processing.** The policy states question content is
    processed to generate a reply, that payment data is not sent, and that
    content is not used to train external models. Verify against the current
    provider terms and the actual request payload.

22. **Service level commitments.** The policies commit to: first response within
    2 business days; privacy acknowledgement within 5 business days; privacy and
    complaint responses within 30 days; refunds started within 5 business days of
    a confirmed cancellation; disputed refund decisions within 10 business days.
    These are contractual promises. Confirm they are operationally achievable for
    a sole operator, and that these mailboxes exist and are monitored:
    `hello@`, `support@`, `privacy@`, `legal@`, `organisers@`.

### Verified as accurate against the code (no drafting question, listed for the file)

- Platform fee 3.5% + AUD 0.99 per ticket, processing fee 2.5%, free events free
  (`20260627000001_fee_structure_locked_au.sql`, `fee-math.ts`). Rendered live in
  the pages, never hardcoded.
- Payout released 3 business days after event end (`payout_schedule_days` AU = 3,
  `connect-ledger.ts` `computeReleaseAt` via `addBusinessDays`).
- Reserve 20% of organiser net share (`reserve_percentage` AU = 20).
- Reserve released at the same point, and held back only where a chargeback hold
  is open on the same event (`release_holds()`).
- Buyer sees the all-in total before committing (`ticket-selector.tsx`).
- Organisers can issue refunds from the dashboard (`submitOrganiserRefund`), and
  so can admin. There is no buyer self-service refund button.

---

## What changed

### Policies rewritten (4)

| File | Was | Now |
|---|---|---|
| `src/app/legal/terms/page.tsx` | Terms of Use, 14 sections | **Terms of Service**, 21 sections, live fees, ACL consumer guarantees, all-in pricing statement |
| `src/app/legal/privacy/page.tsx` | Privacy Policy, 12 sections | **Privacy Policy**, 20 sections, structured to the Australian Privacy Principles, access, correction, deletion, breach and OAIC complaint escalation |
| `src/app/legal/refunds/page.tsx` | Refund Policy, 6 sections | **Refund and Ticket Policy**, 13 sections, consumer guarantees first, change-of-mind carve-out, real refund process |
| `src/app/legal/organiser-terms/page.tsx` | Organiser Terms, 13 sections | **Organiser Agreement**, 20 sections, real fees, real payout schedule and reserve, chargeback liability, cancellation obligations, prohibited events, Founding Organiser offer |

### Link wiring (3 files)

| File | Change |
|---|---|
| `src/components/layout/site-footer.tsx` | Added **Organiser agreement** to the `LEGAL` array. It was the only policy missing from the footer. |
| `src/app/checkout/[reservation_id]/checkout-form.tsx` | Added a consent line above the order summary linking **Terms**, **Refund and Ticket Policy** and **Privacy Policy**. Checkout previously carried no legal links at all. |
| `src/components/auth/signup-form.tsx` | Added **Organiser Agreement** to the consent line, shown only when `isOrganiser` is true. `/organisers/signup` redirects to `/signup?role=organiser`, so this is the organiser signup consent point. |

Cross-links: each of the four policies ends with a **Related Policies** section
linking the other three, so every policy is reachable from every other one.

### Not changed

No component, colour, spacing, layout or shared style was altered. All four
pages continue to use the existing `LegalPageShell`, `PageHero`, `ContentSection`
and `Prose`. The two link insertions reuse classes already present in the files
they were added to. The funds-holding payment engine was read, never modified.

## Verification run

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` on all changed files | clean |
| `vitest run` | **723 passed, 90 files** |
| Routes render | `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/organiser-terms`, `/legal/cookies`, `/legal/accessibility` all **200** |
| Live fees render | Terms, Refunds and Organiser Agreement all render **3.5% + AUD 0.99** and **2.5%** against TEST |
| Cross-links | each policy links to the other three, confirmed in rendered HTML |
| Footer | all six legal links render on the homepage, including the new Organiser agreement |
| Organiser signup | `/organisers/signup` 307s to `/signup?role=organiser`, which renders Terms + **Organiser Agreement** + Privacy. Buyer signup correctly renders only Terms + Privacy |
| Copy laws | zero em-dashes, zero en-dashes, zero exclamation marks, zero competitor names, zero instances of the banned word |
| `npm run build` | **NOT RUN.** The repo's own disk guard blocks builds under 5 GB free and the machine has ~1.8 GB. `npm run reclaim` and `reclaim -- --deep` recovered only 0.08 GB because the disk is genuinely full at machine level, not with build artefacts. This gate must be re-run once space is freed. |
| Checkout consent line | verified by compile and lint only, not by render. Reaching the checkout page needs a live reservation, which needs a browser run the disk could not support. The block is static JSX in an already-covered file. |

### Caching note

`/legal/terms`, `/legal/refunds` and `/legal/organiser-terms` read the fee live,
so each sets `export const revalidate = 60`. Without it Next would statically
render them once and quote a stale rate indefinitely. 60 seconds matches the
pricing resolver's own Redis TTL and the existing `/organisers` precedent
(`/pricing` uses `force-dynamic`). The Privacy Policy reads no fee and stays
fully static.

During verification the Redis fee cache is shared across environments, so a dev
server pointed at TEST can briefly serve fee values resolved against production.
Wait out the 60 second TTL before trusting a fee figure seen locally.

## Copy rules applied

Australian English. No em-dashes or en-dashes. No exclamation marks. No
competitor named anywhere. "Community" used throughout; the banned word does not
appear.
