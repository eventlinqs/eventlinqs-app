-- FO1 DATABASE PROOF. The two things a browser on this machine cannot reach.
--
-- WHY THIS EXISTS AND WHAT IT IS NOT. The driven proof
-- (scripts/verify/fo1-founding-offer-drive.mjs) exercises everything a person
-- can touch: the owner grants, extends and revokes founding terms through
-- /admin/network, and a guest sees the badge appear, the service fee go to
-- zero, and the fee come back the instant the terms are revoked. Two behaviours
-- sit behind a COMPLETED CARD PAYMENT, and a card payment cannot be completed on
-- this machine: STRIPE_SECRET_KEY is empty in .env.local and the only matching
-- TEST key in the Stripe CLI config answers `Expired API Key`. They are proved
-- here instead, against the real TEST database, and this file says plainly that
-- it is a database proof rather than a browser one.
--
--   1. The fifty-first founding window is REFUSED by the database, and is
--      granted when the owner deliberately overrides.
--   2. The referral credit fires ONCE, on the referred organiser's first
--      CONFIRMED PAID order, and never on a free one.
--
-- IT LEAVES NOTHING BEHIND. The whole experiment is one DO block, which is one
-- transaction, and it ends by RAISING, so every row it creates is rolled back
-- whatever the outcome. The report travels out in the exception message, which
-- is the only thing that can survive a rollback. Every row it creates while it
-- runs carries lane-B in its name and slug.
--
-- Run:
--   npx supabase db query --linked -f scripts/verify/fo1-founding-database-proof.sql
-- Expect: an ERROR whose message begins FO1-PROOF and lists PASS lines.

DO $proof$
DECLARE
  v_owner       UUID;
  v_event       UUID;
  v_report      TEXT := '';
  v_pass        INT := 0;
  v_fail        INT := 0;
  v_i           INT;
  v_id          UUID;
  v_referrer    UUID;
  v_referred    UUID;
  v_before      TIMESTAMPTZ;
  v_after       TIMESTAMPTZ;
  v_expected    TIMESTAMPTZ;
  v_credited    TIMESTAMPTZ;
  v_refused     BOOLEAN;
  v_stamp       TEXT := to_char(NOW(), 'YYYYMMDDHH24MISS');

BEGIN
  -- A real owner and a real event, read not invented, because both columns
  -- carry foreign keys. Nothing belonging to either is modified.
  SELECT owner_id INTO v_owner FROM public.organisations WHERE owner_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_event FROM public.events LIMIT 1;
  IF v_owner IS NULL OR v_event IS NULL THEN
    RAISE EXCEPTION 'FO1-PROOF cannot run: TEST has no organisation owner or no event to reference';
  END IF;

  -- =========================================================================
  -- 1. THE FIFTY CAP, AND THE OWNER'S DELIBERATE OVERRIDE
  -- =========================================================================
  --
  -- Every existing window is cleared FIRST, inside this transaction, so the
  -- count starts from a known zero and the boundary is the boundary rather than
  -- whatever TEST happened to be holding. It is all rolled back.
  UPDATE public.organisations SET founding_fee_free_until = NULL WHERE founding_fee_free_until IS NOT NULL;

  FOR v_i IN 1..50 LOOP
    INSERT INTO public.organisations (name, slug, status, owner_id, founding_fee_free_until)
    VALUES (
      'lane-B FO1 cap probe ' || v_i || ' ' || v_stamp,
      'lane-b-fo1-cap-' || v_stamp || '-' || v_i,
      'active',
      v_owner,
      NOW() + INTERVAL '6 months'
    );
  END LOOP;

  IF (SELECT COUNT(*) FROM public.organisations WHERE founding_fee_free_until IS NOT NULL) = 50 THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  fifty windows open, which is the cap exactly';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  expected exactly fifty open windows, found ' ||
      (SELECT COUNT(*) FROM public.organisations WHERE founding_fee_free_until IS NOT NULL);
  END IF;

  -- The fifty-first, by the ordinary path, must be refused by the database.
  INSERT INTO public.organisations (name, slug, status, owner_id)
  VALUES ('lane-B FO1 fifty-first ' || v_stamp, 'lane-b-fo1-fifty-first-' || v_stamp, 'active', v_owner)
  RETURNING id INTO v_id;

  v_refused := FALSE;
  BEGIN
    UPDATE public.organisations SET founding_fee_free_until = NOW() + INTERVAL '6 months' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN
    v_refused := TRUE;
  END;

  IF v_refused THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the fifty-first window is refused by trg_founding_waiver_cap';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  the fifty-first window was GRANTED; the cap is not enforced';
  END IF;

  -- The same grant, made deliberately by the owner through the RPC with the
  -- override, must succeed.
  v_after := public.admin_set_founding_waiver(v_id, NOW() + INTERVAL '6 months', TRUE, 'grant');
  IF v_after IS NOT NULL THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the owner override grants the fifty-first, through admin_set_founding_waiver';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  the owner override did not grant the fifty-first';
  END IF;

  -- And the override does NOT survive the CALL that used it: the very next
  -- ordinary grant, in the same transaction, is refused again. is_local bounds
  -- it to the transaction and admin_set_founding_waiver closes it before it
  -- returns, so an override the owner authorised for one grant cannot be
  -- inherited by a second.
  INSERT INTO public.organisations (name, slug, status, owner_id)
  VALUES ('lane-B FO1 fifty-second ' || v_stamp, 'lane-b-fo1-fifty-second-' || v_stamp, 'active', v_owner)
  RETURNING id INTO v_id;

  v_refused := FALSE;
  BEGIN
    UPDATE public.organisations SET founding_fee_free_until = NOW() + INTERVAL '6 months' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN
    v_refused := TRUE;
  END;

  IF v_refused THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the override died with its own call; the next grant in the same transaction is refused again';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  the override leaked past the call that opened it';
  END IF;

  -- =========================================================================
  -- 2. THE REFERRAL CREDIT, ON THE FIRST CONFIRMED PAID ORDER, ONCE
  -- =========================================================================

  UPDATE public.organisations SET founding_fee_free_until = NULL WHERE founding_fee_free_until IS NOT NULL;

  INSERT INTO public.organisations (name, slug, status, owner_id, is_founding, founding_fee_free_until)
  VALUES (
    'lane-B FO1 referrer ' || v_stamp, 'lane-b-fo1-referrer-' || v_stamp, 'active', v_owner,
    TRUE, NOW() + INTERVAL '6 months'
  )
  RETURNING id, founding_fee_free_until INTO v_referrer, v_before;

  INSERT INTO public.organisations (name, slug, status, owner_id, referred_by_organisation_id)
  VALUES (
    'lane-B FO1 referred ' || v_stamp, 'lane-b-fo1-referred-' || v_stamp, 'active', v_owner, v_referrer
  )
  RETURNING id INTO v_referred;

  -- A FREE order first. It confirms, and it must earn the referrer nothing,
  -- because the offer is three months for an organiser who SELLS, and a free
  -- event is free for everybody.
  INSERT INTO public.orders (order_number, event_id, organisation_id, status, subtotal_cents, total_cents, guest_email, guest_name)
  VALUES ('LANEB-FO1-FREE-' || v_stamp, v_event, v_referred, 'confirmed', 0, 0, 'lane-b-fo1-buyer@eventlinqs.test', 'Lane B FO1 buyer');

  SELECT founding_fee_free_until INTO v_after FROM public.organisations WHERE id = v_referrer;
  IF v_after = v_before THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  a free confirmed order earns the referrer nothing';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  a free order moved the window from ' || v_before || ' to ' || v_after;
  END IF;

  -- The first PAID confirmed order. This is the moment the offer names.
  v_expected := public.founding_add_months(GREATEST(v_before, NOW()), 3);

  INSERT INTO public.orders (order_number, event_id, organisation_id, status, subtotal_cents, total_cents, guest_email, guest_name)
  VALUES ('LANEB-FO1-PAID1-' || v_stamp, v_event, v_referred, 'confirmed', 5000, 5187, 'lane-b-fo1-buyer@eventlinqs.test', 'Lane B FO1 buyer');

  SELECT founding_fee_free_until INTO v_after FROM public.organisations WHERE id = v_referrer;
  SELECT referral_credited_at INTO v_credited FROM public.organisations WHERE id = v_referred;

  IF v_after = v_expected THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the first paid confirmed order moved the window ' || v_before || ' -> ' || v_after ||
      ', which is exactly three months';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  expected ' || v_expected || ', got ' || COALESCE(v_after::TEXT, 'NULL');
  END IF;

  IF v_credited IS NOT NULL THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the referred organisation is marked credited, so the referral cannot pay twice';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  referral_credited_at was not set on the referred organisation';
  END IF;

  -- A SECOND paid confirmed order must earn nothing more.
  INSERT INTO public.orders (order_number, event_id, organisation_id, status, subtotal_cents, total_cents, guest_email, guest_name)
  VALUES ('LANEB-FO1-PAID2-' || v_stamp, v_event, v_referred, 'confirmed', 9000, 9314, 'lane-b-fo1-buyer@eventlinqs.test', 'Lane B FO1 buyer');

  SELECT founding_fee_free_until INTO v_expected FROM public.organisations WHERE id = v_referrer;
  IF v_expected = v_after THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  a second paid order earns nothing more; the credit is once only';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  a second paid order moved the window again, to ' || v_expected;
  END IF;

  -- And the machine wrote down what it did.
  IF EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE action = 'founding.waiver.extended'
      AND target_id = v_referrer::TEXT
      AND metadata->>'reason' = 'referred_organiser_first_paid_sale'
  ) THEN
    v_pass := v_pass + 1;
    v_report := v_report || E'\n  PASS  the extension is in the audit log with its reason, its order and both dates';
  ELSE
    v_fail := v_fail + 1;
    v_report := v_report || E'\n  FAIL  nothing was written to the audit log for the extension';
  END IF;

  -- =========================================================================
  -- THE VERDICT, carried out on the only vehicle that survives a rollback.
  -- =========================================================================
  RAISE EXCEPTION 'FO1-PROOF % passed, % failed (every row rolled back)%',
    v_pass, v_fail, v_report;
END $proof$;
