-- Surpass edges flag resolution (founder ruling 2026-07-11): the three
-- surfaces this flag gates (Fill the room organiser panel, Know before you
-- go event card, What you keep pricing comparison) are LAUNCH FEATURES,
-- not testing scaffolding. ON is the correct launch state. This migration
-- only corrects the description so the recorded intent matches the ruling;
-- the enabled value is untouched. DOWN: restore the previous description.
UPDATE public.feature_flags
SET description = 'Surpass pass 1: Fill the room organiser panel, Know before you go event card, What you keep pricing comparison. Launch feature, ON for launch (founder ruling 2026-07-11).'
WHERE flag = 'surpass_edges';
