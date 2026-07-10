-- Surpass pass 1 (2026-07-05): one flag gates the three visible edges
-- (Fill the room panel with the reach module, Know before you go, the
-- What you keep pricing comparison). Default ON for testing per the
-- founder directive. Additive; DOWN: delete the row.
INSERT INTO public.feature_flags (flag, enabled, description)
VALUES ('surpass_edges', TRUE, 'Surpass pass 1: Fill the room organiser panel, Know before you go event card, What you keep pricing comparison. Default ON for testing.')
ON CONFLICT (flag) DO NOTHING;
