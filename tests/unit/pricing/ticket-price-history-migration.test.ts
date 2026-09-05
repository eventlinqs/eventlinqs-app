import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * MIGRATION 20260904000002 (ticket price history), read as text.
 *
 * The live proof is scripts/verify/ticket-price-history-schema-verify.mjs
 * against TEST (13 checks, C:\dev\EVIDENCE\A4-schema-verify-test.txt). These
 * pin the SHAPE of the file so a later edit that drops a grant, un-defers a
 * trigger or widens the reason CHECK fails here, before it reaches a push.
 */
const ROOT = join(__dirname, '..', '..', '..')
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', '20260904000002_ticket_price_history.sql'), 'utf8')

describe('the table', () => {
  test('exists with the three reasons and non-negative money', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ticket_price_history/)
    expect(sql).toMatch(/reason\s+text NOT NULL CHECK \(reason IN \('listed', 'changed', 'step'\)\)/)
    expect(sql).toMatch(/price_cents\s+integer NOT NULL CHECK \(price_cents >= 0\)/)
  })

  test('is keyed to the event with cascade and to the tier with SET NULL, because an edit re-creates tiers', () => {
    expect(sql).toMatch(/event_id\s+uuid NOT NULL REFERENCES public\.events\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/ticket_tier_id\s+uuid REFERENCES public\.ticket_tiers\(id\) ON DELETE SET NULL/)
    expect(sql).toMatch(/tier_name\s+text NOT NULL/)
  })

  test('is readable by everyone and writable by the service role only', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.ticket_price_history TO anon, authenticated/)
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^\n]*ticket_price_history TO (anon|authenticated)/)
    expect(sql).toMatch(/"Price history is viewable by everyone"[\s\S]*FOR SELECT[\s\S]*USING \(true\)/)
    expect(sql).toMatch(/"Service role manages price history"[\s\S]*auth\.role\(\) = 'service_role'/)
  })
})

describe('the recorder and the triggers', () => {
  test('the recorder asks get_current_tier_price, so the history says what a buyer is charged', () => {
    expect(sql).toMatch(/FUNCTION public\.record_tier_price_history\(p_tier_id uuid, p_hint text\)/)
    expect(sql).toMatch(/v_price := public\.get_current_tier_price\(v_tier\.id\)/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_tier_price_history\(uuid, text\) FROM PUBLIC, anon, authenticated/)
  })

  test('both triggers are DEFERRABLE INITIALLY DEFERRED constraint triggers, for each row', () => {
    for (const name of ['ticket_tiers_record_price_history', 'dynamic_pricing_rules_record_price_history']) {
      const block = new RegExp(`CREATE CONSTRAINT TRIGGER ${name}[\\s\\S]*?EXECUTE FUNCTION`).exec(sql)?.[0] ?? ''
      expect(block, name).toContain('DEFERRABLE INITIALLY DEFERRED')
      expect(block, name).toContain('FOR EACH ROW')
    }
  })

  test('the tier trigger watches the columns that move a price: price, the switch, the name, and both counts', () => {
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF price, dynamic_pricing_enabled, name, sold_count, reserved_count\s+ON public\.ticket_tiers/)
  })

  test('the rules trigger watches every write, including the delete', () => {
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OR DELETE\s+ON public\.dynamic_pricing_rules/)
  })

  test('every SECURITY DEFINER function pins its search_path', () => {
    const definers = sql.match(/SECURITY DEFINER\s*\n\s*SET search_path = public, pg_temp/g) ?? []
    const declared = sql.match(/SECURITY DEFINER/g) ?? []
    expect(definers).toHaveLength(declared.length)
    expect(declared.length).toBeGreaterThanOrEqual(4)
  })
})

describe('the atomic save', () => {
  test('exists, validates, and is granted to the service role only', () => {
    expect(sql).toMatch(/FUNCTION public\.save_dynamic_pricing\(\s*p_tier_id uuid,\s*p_enabled boolean,\s*p_steps\s+jsonb\s*\)/)
    expect(sql).toMatch(/between 1 and 10 steps are allowed/)
    expect(sql).toMatch(/threshold must be between 1 and 100/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.save_dynamic_pricing\(uuid, boolean, jsonb\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_dynamic_pricing\(uuid, boolean, jsonb\) TO service_role/)
  })

  test('does the toggle, the delete and the insert inside the one function body', () => {
    const body = /FUNCTION public\.save_dynamic_pricing[\s\S]*?\$\$;\s*\n/.exec(sql)?.[0] ?? ''
    expect(body).toMatch(/UPDATE public\.ticket_tiers\s+SET dynamic_pricing_enabled = p_enabled/)
    expect(body).toMatch(/DELETE FROM public\.dynamic_pricing_rules WHERE ticket_tier_id = p_tier_id/)
    expect(body).toMatch(/INSERT INTO public\.dynamic_pricing_rules/)
  })
})

describe('the backfill', () => {
  test('lists every existing tier at its base price, dated when the tier was created, and then runs the recorder once per tier', () => {
    expect(sql).toMatch(/INSERT INTO public\.ticket_price_history[\s\S]*SELECT tt\.event_id, tt\.id, tt\.name, GREATEST\(tt\.price, 0\), NULL, 'listed', NULL, COALESCE\(tt\.currency, 'AUD'\), tt\.created_at/)
    expect(sql).toMatch(/PERFORM public\.record_tier_price_history\(v_id, 'changed'\)/)
  })

  test('uses gen_random_uuid, which is on every project, rather than the extension function that is not on the migration search path', () => {
    expect(sql).toContain('DEFAULT gen_random_uuid()')
    expect(sql).not.toContain('uuid_generate_v4')
  })
})
