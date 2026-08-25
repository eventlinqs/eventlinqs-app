-- ===========================================================================
-- THE ORGANISER'S TAX IDENTITY, so a buyer's receipt can become a TAX INVOICE
-- ===========================================================================
--
-- WHY THIS IS NEEDED AT ALL. CLAUDE.md, the locked fee structure:
--
--   "EventLinqs is the organiser's limited payment collection agent: the
--    ORGANISER is the seller and remits GST on the ticket price. EventLinqs
--    deals with GST only on its OWN fee, and only once GST-registered."
--
-- The seller on a ticket sale is therefore the organiser, and a tax invoice for
-- that sale must carry THEIR identity and THEIR ABN. The Australian Taxation
-- Office is explicit about both, at
-- https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
-- (page last updated 25 August 2025, fetched 25 August 2026):
--
--   "Tax invoices for taxable sales of less than $1,000 must include enough
--    information to clearly determine the following 7 details: Document is
--    intended to be a tax invoice. Seller's identity. Seller's Australian
--    business number (ABN). ..."
--
-- Before this migration `public.organisations` carried no ABN, no legal name
-- and no GST-registration flag, so requirements 2 and 3 were unsatisfiable for
-- every organiser on the platform and no receipt this platform issued could be
-- a valid tax invoice.
--
-- ---------------------------------------------------------------------------
-- THE COLUMNS
-- ---------------------------------------------------------------------------
--
-- abn             Eleven digits, stored WITHOUT spaces. The display grouping
--                 (2 3 3 3) is a presentation concern and lives in
--                 src/lib/tax/abn.ts, so the stored value has one shape and
--                 comparisons are not defeated by whitespace.
--
-- gst_registered  The organiser's own declaration. It is deliberately NOT
--                 derived from the presence of an ABN: an ABN and a GST
--                 registration are two different registrations, and plenty of
--                 sole traders under the $75,000 threshold hold the first
--                 without the second. Treating one as the other would print
--                 "Tax invoice" over a sale that carries no GST, which invites
--                 the buyer to claim a credit that does not exist.
--
-- legal_name      The registered entity name, when it differs from the trading
--                 name. Nullable; the invoice falls back to `name`. The ATO
--                 requires the "seller's identity", not specifically the
--                 registered name, so a trading name is acceptable and the
--                 field exists for organisers whose two differ.
--
-- ---------------------------------------------------------------------------
-- THE CHECK CONSTRAINT, AND WHAT IT DELIBERATELY DOES NOT CHECK
-- ---------------------------------------------------------------------------
--
-- Eleven digits, no leading zero. The modulus 89 checksum published by the
-- Australian Business Register (https://abr.business.gov.au/Help/AbnFormat,
-- ABN Lookup 9.9.7, fetched 25 August 2026) is enforced in application code
-- rather than here, because expressing it in a CHECK would bury the algorithm
-- in a place nobody reads and duplicate the one in src/lib/tax/abn.ts, which is
-- the tested copy. The constraint's job is to make a malformed value
-- impossible to store at all; the checksum's job is to catch a typo, and it
-- runs at the point where a human can be told about it.
--
-- Nothing here asserts the ABN is REGISTERED or ACTIVE or belongs to this
-- organiser. That needs an ABN Lookup web-service credential and is separate
-- work; claiming it on the strength of a modulus would be a claim the data
-- cannot support.
-- ===========================================================================

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS abn TEXT,
  ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legal_name TEXT;

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_abn_format;

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_abn_format
  CHECK (abn IS NULL OR abn ~ '^[1-9][0-9]{10}$');

COMMENT ON COLUMN public.organisations.abn IS
  'The seller''s Australian Business Number, 11 digits, unformatted. ATO tax-invoice requirement 3. The modulus 89 checksum is enforced in src/lib/tax/abn.ts.';

COMMENT ON COLUMN public.organisations.gst_registered IS
  'The organiser''s declaration that they are registered for GST. NOT derived from the ABN: they are two different registrations, and a receipt must not say "Tax invoice" unless the seller is registered.';

COMMENT ON COLUMN public.organisations.legal_name IS
  'The registered entity name where it differs from the trading name. ATO tax-invoice requirement 2 (seller''s identity) falls back to organisations.name.';

-- ---------------------------------------------------------------------------
-- COLUMN PRIVILEGES: these are NOT public.
-- ---------------------------------------------------------------------------
--
-- Migration 20260808000010 revoked table-wide SELECT on public.organisations
-- from anon and authenticated and granted a named column list instead, so a new
-- column is private by default and no grant is needed to keep it that way. That
-- is the correct posture here and it is stated rather than assumed:
--
--   - `gst_registered` is a tax position, and whose business is registered is
--     not something a stranger reading an event page needs.
--   - `abn` is public information at the register, but it is only ever rendered
--     to the BUYER OF A TICKET, on their own receipt, resolved server side with
--     the service role and collapsed into the rendered document. Nothing about
--     an organiser's tax details crosses the client boundary on a public page.
--
-- The same reasoning, and the same mechanism, as the organiser sale-posture
-- columns: read it privileged, decide server side, send the decision.
