-- ============================================================
-- Issue 3 Fix: Correct ticket_tiers sold_count and total_capacity
-- Run this in the Supabase SQL editor.
-- ============================================================

-- STEP 1: BEFORE STATE - show current values for all events
SELECT
  e.title AS event_title,
  t.id AS tier_id,
  t.name AS tier_name,
  t.total_capacity,
  t.sold_count,
  t.reserved_count
FROM ticket_tiers t
JOIN events e ON e.id = t.event_id
ORDER BY e.title, t.name;

-- STEP 2: Recompute sold_count from confirmed order_items
-- (This is the authoritative fix - counts actual delivered tickets)
UPDATE ticket_tiers tt
SET sold_count = (
  SELECT COALESCE(SUM(oi.quantity), 0)
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.ticket_tier_id = tt.id
    AND oi.item_type = 'ticket'
    AND o.status IN ('confirmed', 'partially_refunded', 'refunded')
);

-- STEP 3: Reset reserved_count to 0 for all tiers
-- (Active reservations are tracked separately; stale reserved_counts cause off-by-one on available display)
UPDATE ticket_tiers
SET reserved_count = (
  SELECT COALESCE(SUM(
    (item->>'quantity')::int
  ), 0)
  FROM reservations r,
       jsonb_array_elements(r.items) AS item
  WHERE r.status = 'active'
    AND r.expires_at > NOW()
    AND (item->>'ticket_tier_id')::uuid = ticket_tiers.id
);

-- STEP 4: Fix total_capacity to 60 for the "Stripe Test Event" General Admission tier
-- (Only runs if the capacity is currently 59 - safe no-op if already correct)
UPDATE ticket_tiers
SET total_capacity = 60
WHERE name = 'General Admission'
  AND total_capacity = 59
  AND event_id = (
    SELECT id FROM events WHERE title = 'Stripe Test Event' LIMIT 1
  );

-- STEP 5: AFTER STATE - verify the corrected values
SELECT
  e.title AS event_title,
  t.id AS tier_id,
  t.name AS tier_name,
  t.total_capacity,
  t.sold_count,
  t.reserved_count
FROM ticket_tiers t
JOIN events e ON e.id = t.event_id
ORDER BY e.title, t.name;
