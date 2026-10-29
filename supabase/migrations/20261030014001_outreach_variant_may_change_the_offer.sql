-- A PLAY's TEST MAY CHANGE THE OFFER (window 6, 30 October 2026; the growth blueprint's ruling 1, the project manager's
-- 01:23: "variants A and B become two template versions in that format, and run as the learning loop's first test").
--
-- 20261029210001 let a variant change only its subject, its true line or its question. Variant A (listing-first, with
-- the poster preview) and variant B (the recurring partnership) keep all three and change the offer between them, so the
-- first test needs 'offer' as a fourth change. Still one change a test; an unknown change is still refused.
--
-- Additive in effect: one check widened, every value it accepted before still accepted. Proved red then green on TEST by
-- scripts/verify/proofs/outreach-variant-offer.sql.

alter table public.outreach_plays drop constraint if exists outreach_plays_variant_change_check;
alter table public.outreach_plays add constraint outreach_plays_variant_change_check check (
  variant_change is null or variant_change in ('subject', 'true_line', 'question', 'offer')
);
