-- THE REAL VISITOR RECORD GAINS ITS FIRST BYTE AND FIRST PAINT (WINDOW 5A, 13 November 2026; Lawal's one second law of
-- 10 November 2026, 13:30, internal only; the plan: C:\dev\EVIDENCE\EL-12NOV\speed\PLAN-vitals-breakdown.md).
--
-- The event page's real LCP p75 on phones read 1,614 ms, and the record (20261110020001) kept LCP, INP and CLS only, so
-- it could not say what the time was made of. Next.js's own web vitals hook also reports TTFB (the server and the
-- network) and FCP (the first paint); with them beside each page view's LCP, the next speed car is chosen from real
-- visitors. Numbers only, as before: no person, no device, nothing shown on any screen.
--
-- Only the metric check widens. Its name was read on production first (pg_constraint, 13 November 2026):
-- page_vitals_metric_check. The drop has no IF EXISTS on purpose: a wrong name stops this migration instead of leaving
-- the old check in place to refuse the new measures without a word.

alter table public.page_vitals drop constraint page_vitals_metric_check;
alter table public.page_vitals add constraint page_vitals_metric_check
  check (metric in ('LCP', 'INP', 'CLS', 'TTFB', 'FCP'));
