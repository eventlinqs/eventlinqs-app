-- Train C, the project manager's 21:51 of 27 October 2026, (E): paid features built and OFF.
--
-- Featured spots and organiser services ship with their prices empty (20261027140501 seeds every offer unpriced) AND
-- their admin switch off: nothing is offered to an organiser until Lawal sets the pilot. One row, the switch, OFF on
-- every database this file reaches; it is turned on from /admin/flags by a row change, never by a deploy.
insert into public.feature_flags (flag, enabled, description)
values (
  'paid_promotions',
  false,
  'Train C rows 12 and 13: paid featured placement and the organiser services menu. OFF until Lawal sets the pilot (the project manager, 27 October 2026, 21:51 (E)).'
)
on conflict (flag) do nothing;
