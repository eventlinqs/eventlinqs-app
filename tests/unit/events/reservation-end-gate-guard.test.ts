import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  END_GATE,
  HISTORY,
  definitionsIn,
  judgeMigrations,
} from '../../../scripts/guards/reservation-functions-carry-the-end-gate.mjs'

/**
 * THE GUARD'S RULE, RED AND GREEN (the project manager's 02:05 order of
 * 23 October 2026): no migration outside the dated history may define
 * create_reservation or create_seat_reservation without refusing an event that
 * has ended, and the effective definition of each must carry the gate.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations')
const tree = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(join(DIR, name), 'utf8') }))

/** The shape of lane/b-growth's 20260921000050: it drops the five-argument
 *  function and makes a six-argument one with the status gate and no end gate. */
const LANE_SHAPE = {
  name: '20260921000050_the_organisers_per_order_rules_bind_every_door.sql',
  sql: `DROP FUNCTION IF EXISTS public.create_reservation(uuid, uuid, text, jsonb, integer);
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_event_id UUID, p_user_id UUID DEFAULT NULL, p_session_id TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]', p_ttl_minutes INT DEFAULT 10, p_group_hold BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF v_event_status IS DISTINCT FROM 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not on sale.');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;`,
}

describe('reservation-functions-carry-the-end-gate', () => {
  it('green on this tree: both effective definitions carry the gate', () => {
    const { failures, effective } = judgeMigrations(tree)
    expect(failures).toEqual([])
    expect(effective.create_reservation.file).toBe('20261023000001_an_ended_event_sells_nothing.sql')
    expect(effective.create_seat_reservation.file).toBe('20261023000001_an_ended_event_sells_nothing.sql')
  })

  it('red on a file shaped like lane/b-growth 20260921000050, though its number sorts before the fix', () => {
    const { failures } = judgeMigrations([...tree, LANE_SHAPE])
    expect(failures.map((f) => [f.fn, f.file])).toEqual([['create_reservation', LANE_SHAPE.name]])
  })

  it('red on main as it was before the fix: the effective definitions have no gate', () => {
    const before = tree.filter((f) => !f.name.startsWith('20261023000001'))
    const { failures } = judgeMigrations(before)
    expect(failures.map((f) => f.reason)).toEqual([
      `the effective definition of create_reservation (20260906000002_event_lifecycle_archive_delete.sql) does not refuse an event that has ended ("${END_GATE}")`,
      `the effective definition of create_seat_reservation (20260906000002_event_lifecycle_archive_delete.sql) does not refuse an event that has ended ("${END_GATE}")`,
    ])
  })

  it('the history is exactly the files that defined either function before the gate', () => {
    const defining = tree
      .filter((f) => definitionsIn(f.sql, 'create_reservation').length + definitionsIn(f.sql, 'create_seat_reservation').length > 0)
      .map((f) => f.name)
    expect(defining.filter((n) => !n.startsWith('20261023000001'))).toEqual(HISTORY)
  })

  it("reads each definition to its own body's end, so a gate in a later function is not credited to an earlier one", () => {
    const sql = `CREATE FUNCTION public.create_reservation() RETURNS int AS $a$ SELECT 1 $a$;
CREATE FUNCTION public.something_else() RETURNS text AS $b$ SELECT '${END_GATE}' $b$;`
    const [def] = definitionsIn(sql, 'create_reservation')
    expect(def.includes(END_GATE)).toBe(false)
  })
})
