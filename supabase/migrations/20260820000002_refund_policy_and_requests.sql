-- ============================================================================
-- THE PER-EVENT REFUND POLICY, AND THE BUYER'S PATH TO USING IT.
--
-- WHAT EXISTED BEFORE THIS. An organiser could refund from their dashboard, and
-- that path is proven end to end. A BUYER had no way to ask. There was no policy
-- on an event, nothing shown before purchase, and nothing that could approve a
-- request without a human. Every competitor has all three.
--
-- VERIFIED AGAINST THE COMPETITORS' OWN HELP CENTRES, 20 August 2026 (Law 7):
--
--   EVENTBRITE (https://www.eventbrite.com/help/en-us/articles/130304/how-to-set-a-refund-policy/)
--     Two choices: "Allow refunds", with a number of days before the event during
--     which an attendee may request one, or "Don't allow refunds". After
--     publishing: "Once you've set your policy and published your event, you can
--     only change the policy to a more flexible one." The organiser chooses
--     whether to absorb the ticketing fee. Qualifying requests are approved
--     AUTOMATICALLY when the event balance covers them.
--
--   HUMANITIX (https://help.humanitix.com/en/articles/8897185-allow-buyers-to-refund-and-cancel-their-orders-and-tickets)
--     Default is a contact-the-host request. The host may optionally enable
--     SELF-SERVICE refunds, after which the buyer refunds themselves from the
--     manage-order screen with no host involvement.
--
--   TICKETMASTER (https://help.ticketmaster.com/hc/en-us/articles/9672441081105-How-do-I-request-a-refund)
--     All sales final by default; a Request Refund button appears only if the
--     event organiser has approved refunds.
--
-- So the shape below is not invented: two policy modes matching Eventbrite, an
-- optional self-service flag matching Humanitix, an absorb-fee flag matching
-- Eventbrite, and a request queue matching all three.
--
-- ----------------------------------------------------------------------------
-- WHY THE ONE-WAY RULE IS A DATABASE TRIGGER AND NOT A FORM CHECK.
--
-- All three competitors let a published policy move one way only, and the reason
-- is consumer law rather than product taste: a buyer paid under the terms shown
-- at the time, and tightening those terms afterwards changes the deal after the
-- money moved. A check that lives only in the edit form is bypassed by every
-- other writer: the API, an admin screen, a script, a future bulk editor. This is
-- a rule about what the row may become, so it belongs on the row.
--
-- WHICH DIRECTION IS "LOOSER", stated explicitly because it inverts and the
-- inversion is easy to get backwards:
--   * no_refunds is the strictest setting there is.
--   * Within days_before, a SMALLER number is LOOSER. "Refunds up to 1 day
--     before" lets a buyer ask later than "refunds up to 30 days before", so
--     going 30 -> 1 is a loosening and 1 -> 30 is a tightening.
--   * Turning self-service ON is a loosening; turning it off is a tightening.
--   * Absorbing the fee is a loosening; stopping absorbing it is a tightening,
--     because the buyer gets less money back than the terms they bought under.
--
-- A DRAFT EVENT IS EXEMPT. Nothing has been sold, so nobody bought under those
-- terms. The rule arms at publication, which is the moment the terms become a
-- promise, and it stays armed for every later status.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The policy lives on the event.
--
-- NOT on organisations. `organisations.refund_window_days` already exists from
-- 20260428000001, is capped at 0..7, and is read by NOTHING in src/ (it appears
-- only in the generated types). It is dead, and it is deliberately left alone
-- rather than repurposed: a per-ORGANISATION window cannot express "this festival
-- is refundable and that one is not", which is the thing organisers actually
-- need. Repurposing it would also silently change the meaning of a column that
-- other environments may still carry data in.
-- ----------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS refund_policy_type TEXT NOT NULL DEFAULT 'days_before'
    CHECK (refund_policy_type IN ('days_before', 'no_refunds')),
  ADD COLUMN IF NOT EXISTS refund_policy_days INT NOT NULL DEFAULT 7
    CHECK (refund_policy_days >= 0 AND refund_policy_days <= 365),
  ADD COLUMN IF NOT EXISTS refund_policy_absorb_fee BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refund_policy_self_service BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.refund_policy_type IS
  'days_before: a buyer may request a refund until refund_policy_days before start_date. '
  'no_refunds: no buyer request path (a CANCELLED event is still always refunded).';
COMMENT ON COLUMN public.events.refund_policy_days IS
  'Days before start_date that the request window closes. SMALLER IS MORE FLEXIBLE.';
COMMENT ON COLUMN public.events.refund_policy_absorb_fee IS
  'TRUE: the organiser absorbs the EventLinqs fee so the buyer receives the full '
  'face value back. FALSE: the fee is retained, matching Eventbrite''s default.';
COMMENT ON COLUMN public.events.refund_policy_self_service IS
  'TRUE: a request that satisfies the policy is actioned without the organiser, '
  'the Humanitix self-service model. FALSE: the organiser decides each one.';

-- ----------------------------------------------------------------------------
-- 2. The one-way rule, enforced on the row.
--
-- Returns TRUE when the move from old to new is a LOOSENING or a no-op. Written
-- as a pure function so the trigger stays readable and so a test can call it
-- directly with every combination rather than through an UPDATE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_policy_is_looser_or_equal(
  p_old_type        TEXT,
  p_old_days        INT,
  p_old_self        BOOLEAN,
  p_old_absorb      BOOLEAN,
  p_new_type        TEXT,
  p_new_days        INT,
  p_new_self        BOOLEAN,
  p_new_absorb      BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- no_refunds -> anything is a loosening. anything -> no_refunds is a tightening.
  IF p_old_type = 'no_refunds' AND p_new_type = 'days_before' THEN
    -- Loosening on the mode. The other three fields cannot make this a tightening,
    -- because under no_refunds there was no window to shorten in the first place.
    RETURN TRUE;
  END IF;
  IF p_old_type = 'days_before' AND p_new_type = 'no_refunds' THEN
    RETURN FALSE;
  END IF;

  -- Same mode from here.
  IF p_new_type = 'days_before' AND p_new_days > p_old_days THEN
    -- A LARGER number closes the window earlier, so this is a tightening.
    RETURN FALSE;
  END IF;

  -- Self-service may be switched on, never off.
  IF p_old_self AND NOT p_new_self THEN
    RETURN FALSE;
  END IF;

  -- Fee absorption may be taken on, never dropped.
  IF p_old_absorb AND NOT p_new_absorb THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_refund_policy_one_way()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Nothing about the policy changed: not our business.
  IF NEW.refund_policy_type        IS NOT DISTINCT FROM OLD.refund_policy_type
     AND NEW.refund_policy_days    IS NOT DISTINCT FROM OLD.refund_policy_days
     AND NEW.refund_policy_self_service IS NOT DISTINCT FROM OLD.refund_policy_self_service
     AND NEW.refund_policy_absorb_fee   IS NOT DISTINCT FROM OLD.refund_policy_absorb_fee THEN
    RETURN NEW;
  END IF;

  -- A draft that has never been published has sold nothing under these terms.
  IF OLD.published_at IS NULL AND OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NOT public.refund_policy_is_looser_or_equal(
       OLD.refund_policy_type, OLD.refund_policy_days,
       OLD.refund_policy_self_service, OLD.refund_policy_absorb_fee,
       NEW.refund_policy_type, NEW.refund_policy_days,
       NEW.refund_policy_self_service, NEW.refund_policy_absorb_fee) THEN
    RAISE EXCEPTION
      'refund policy cannot be tightened after publishing (% % days, self-service %, absorb % -> % % days, self-service %, absorb %)',
      OLD.refund_policy_type, OLD.refund_policy_days, OLD.refund_policy_self_service, OLD.refund_policy_absorb_fee,
      NEW.refund_policy_type, NEW.refund_policy_days, NEW.refund_policy_self_service, NEW.refund_policy_absorb_fee
      USING ERRCODE = 'check_violation',
            HINT = 'A published policy may only be made more generous. Buyers paid under the terms shown at the time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_policy_one_way ON public.events;
CREATE TRIGGER trg_refund_policy_one_way
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_refund_policy_one_way();

-- ----------------------------------------------------------------------------
-- 3. The buyer's request.
--
-- A request is a CONVERSATION about an order, not a refund. It becomes a refund
-- only by going through the one proven path (create_refund_request then
-- reconcile_refund), and `refund_id` below is where that link is recorded. There
-- is deliberately no money arithmetic in this table: a second place that computes
-- a refund amount is a second place that can compute it differently.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id         UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organisation_id  UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  requester_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Held separately from the user so a guest order can still request, and so the
  -- address survives the user being deleted.
  requester_email  TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','approved','declined','refunded','cancelled','failed')),
  buyer_message    TEXT CHECK (buyer_message IS NULL OR char_length(buyer_message) <= 1000),

  -- The decision.
  decided_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decline_reason   TEXT,
  -- The note the BUYER receives. A decline with no explanation is how a
  -- chargeback starts, so this is carried separately from the internal reason.
  decision_note    TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),

  -- Set once the request has produced a real refund.
  refund_id        UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
  auto_approved    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Why it could not be auto-approved, in plain words, so the organiser sees the
  -- same sentence the buyer was given.
  auto_decision_reason TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One OPEN request per order. A buyer may ask again after a decline, but may not
-- stack three identical requests while the organiser is deciding.
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_open_per_order
  ON public.refund_requests(order_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_refund_requests_org_status
  ON public.refund_requests(organisation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_event
  ON public.refund_requests(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requester
  ON public.refund_requests(requester_id, created_at DESC);

-- Which tickets the buyer asked about. Without this a partial request is
-- indistinguishable from a whole-order one.
CREATE TABLE IF NOT EXISTS public.refund_request_tickets (
  request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, ticket_id)
);

CREATE OR REPLACE FUNCTION public.touch_refund_request()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_refund_request ON public.refund_requests;
CREATE TRIGGER trg_touch_refund_request
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_refund_request();

-- ----------------------------------------------------------------------------
-- 4. RLS. A buyer sees their own requests; an organiser sees their events'.
--
-- Every write goes through a server action on the service role, so these policies
-- are READ shaped. That is deliberate: a buyer must never be able to move their
-- own request to 'approved' by writing the row directly.
-- ----------------------------------------------------------------------------
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_request_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_requests_buyer_read ON public.refund_requests;
CREATE POLICY refund_requests_buyer_read ON public.refund_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS refund_requests_organiser_read ON public.refund_requests;
CREATE POLICY refund_requests_organiser_read ON public.refund_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = refund_requests.organisation_id AND o.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = refund_requests.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin','manager')
    )
  );

DROP POLICY IF EXISTS refund_request_tickets_read ON public.refund_request_tickets;
CREATE POLICY refund_request_tickets_read ON public.refund_request_tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.refund_requests r
      WHERE r.id = refund_request_tickets.request_id
    )
  );

COMMIT;
