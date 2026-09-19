-- ---------------------------------------------------------------------------
-- NO ACCOUNT ON THIS PLATFORM COULD BE DELETED, AND THE REASON WAS A FOREIGN
-- KEY ARGUING WITH A TRIGGER ABOUT WHAT AN EVIDENCE ROW IS.
--
-- MEASURED, 19 September 2026, on TEST, deleting two accounts that had never
-- touched the table involved:
--
--   delete from auth.users where email like 'lane-b-aq3%'
--   ERROR: 42501: append only: UPDATE on public.marketing_capture_placement is
--   refused. A consent record is evidence of what a person was shown and agreed
--   to, so it is never altered and never removed; record a new event instead.
--   CONTEXT: SQL statement "UPDATE ONLY public.marketing_capture_placement
--            SET decided_by = NULL WHERE $1 = decided_by"
--
-- THE TWO HALVES, BOTH ADDED BY 20260919000110 EARLIER THE SAME DAY.
--
--   `decided_by uuid references auth.users(id) on delete set null` is a
--   STANDING INSTRUCTION TO REWRITE THE ROW when an account goes.
--
--   `trg_marketing_capture_placement_no_update ... FOR EACH STATEMENT` refuses
--   every UPDATE on the table, on the grounds that the row is evidence.
--
-- They cannot both be obeyed, and the failure is total rather than partial:
-- the referential action issues its UPDATE whether or not a single row matches,
-- and the refusal is STATEMENT level, so it fires on an update of nothing. The
-- two accounts above appear nowhere in the table and were still undeletable.
-- Every `auth.admin.deleteUser` on the platform was failing, including the one
-- behind account closure, and every drive teardown in every lane was swallowing
-- the failure in a catch and reporting a clean tear-down.
--
-- THE EVIDENCE WINS, WHICH IS WHY THE FOREIGN KEY GOES RATHER THAN THE TRIGGER.
-- "Who decided where this question is asked" is a historical fact about a
-- decision that was made. An account closing later does not un-make it, and a
-- ledger that quietly forgets the decider the day they leave is not a ledger.
-- So the column stays and keeps its value for ever; what goes is the database's
-- instruction to blank it.
--
-- WHAT IS GIVEN UP, STATED PLAINLY: the database will no longer refuse an
-- insert naming a uuid that is not an account. Every writer of this table goes
-- through `recordPlacementDecision`, which takes the id off an authenticated
-- admin session, and an evidence table that records an id nobody can resolve is
-- a smaller problem than an evidence table that erases the one it recorded.
--
-- NOT TOUCHED, and recorded in REVIEW-QUEUE-B.md instead: the same SET NULL
-- shape exists on `event_group_rates.created_by`, whose BEFORE UPDATE trigger
-- is FOR EACH ROW and judges the PRICE rather than refusing outright, so it
-- passes today and can only refuse if the floor has moved under an existing
-- rate. That is a latent trap rather than a live defect and it belongs in its
-- own change with its own proof.
-- ---------------------------------------------------------------------------

alter table public.marketing_capture_placement
  drop constraint if exists marketing_capture_placement_decided_by_fkey;

comment on column public.marketing_capture_placement.decided_by is
  'The admin account that made this placement decision, recorded for ever. DELIBERATELY NOT A FOREIGN KEY: the table refuses every UPDATE because the row is evidence, so an "on delete set null" made every account on the platform undeletable (migration 20260919000130). The identity is a historical fact and outlives the account.';
