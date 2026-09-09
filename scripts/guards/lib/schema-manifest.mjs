/**
 * EVERY SCHEMA OBJECT THE SHIPPED CODE READS OR WRITES BY NAME that a migration
 * in this repository created and that production may not carry yet.
 *
 * One entry per object. `readBy` is for the person reading a failure, so they
 * can see what would break. Read by scripts/guards/schema-ahead-of-code.mjs
 * (the prebuild gate) and scripts/ops/verify-production-schema.mjs (the
 * founder's one-command proof after `supabase db push --linked`).
 *
 * It is a reviewed list, added to when an item ships code that names a new
 * column, and NOT derived from src/types/database.ts: the types file describes
 * the TEST schema and would make the gate agree with the code by definition.
 * An entry is deleted once the migration has been on production long enough
 * that no deploy could precede it, which is a founder call recorded here.
 */
export const SCHEMA_THE_CODE_NAMES = [
  {
    table: 'ticket_tiers',
    column: 'access_mode',
    migration: '20260903000001_virtual_hybrid_delivery.sql',
    readBy: 'src/app/t/[code]/page.tsx, src/app/orders/[order_id]/confirmation/page.tsx, dashboard events actions',
  },
  {
    table: 'events',
    column: 'stream_geo_allow',
    migration: '20260903000001_virtual_hybrid_delivery.sql',
    readBy: 'dashboard events actions (create and edit), the organiser stream tab',
  },
  {
    table: 'stream_messages',
    column: 'id',
    migration: '20260903000001_virtual_hybrid_delivery.sql',
    readBy: 'src/app/api/stream/[code]/messages/route.ts, the organiser stream tab',
  },
  {
    table: 'event_stream_links',
    column: 'event_id',
    migration: '20260903000002_stream_link_vault.sql',
    readBy: 'src/lib/stream/link.ts (the vault every stream read and write goes through)',
  },
  {
    table: 'events',
    column: 'venue_geocode_source',
    migration: '20260904000001_venue_geocode_provenance.sql',
    readBy: 'dashboard events actions (create and edit write it with venue_geocoded_at), the organiser form (edit mode), the venue backfill',
  },
  {
    table: 'ticket_price_history',
    column: 'id',
    migration: '20260904000002_ticket_price_history.sql',
    readBy: 'src/lib/pricing/read-price-history.ts (the public event page), and saveDynamicPricing calls save_dynamic_pricing from the same migration',
  },
  {
    table: 'ticket_scans',
    column: 'client_scan_id',
    migration: '20260905000001_offline_door_validation.sql',
    readBy: 'src/lib/reporting/door-review.ts (the organiser review list), and the scanner calls door_validation_set and sync_offline_scans from the same migration',
  },
  {
    table: 'events',
    column: 'archived_at',
    migration: '20260906000002_event_lifecycle_archive_delete.sql',
    readBy: 'the organiser events list and actions (archive, restore), the admin events console, the public event page (archived branch); the enum value comes from 20260906000001_event_status_archived.sql',
  },
  {
    table: 'event_tombstones',
    column: 'slug',
    migration: '20260906000002_event_lifecycle_archive_delete.sql',
    readBy: 'src/proxy.ts (a deleted event answers 410 Gone from its tombstone), and the delete action calls event_money_record_counts from the same migration',
  },
  {
    table: 'platform_notifications',
    column: 'delivery_state',
    migration: '20260909000002_platform_notifications.sql',
    readBy: 'src/lib/notifications/platform-send.ts (the worker and the admin feed), /api/cron/platform-notify, the admin Notifications screen; the five triggers that write the rows come from the same migration',
  },
]
