-- THE WITHDRAWAL TRIGGER NAMES EVERY COLUMN IT READS. Follows 20261028205501. Additive: one trigger dropped and made
-- again with a longer event list; no table, row, function or grant changes.
--
-- social_asset_withdrawal_is_final() checks that a replacement is a current asset of the SAME night, so it reads
-- event_id; its trigger fired only on an update of the four withdrawal columns. The guard
-- a-referential-null-is-not-an-edit called that DRIFTED, quoted: "social_asset_withdrawal_is_final() reads event_id,
-- which its event list (withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by) does not cover, so the check
-- silently stops running when one of them changes." social_assets.event_id cascades on a deleted night (20261028141001),
-- it is never blanked by the database, so naming it here judges no parent delete. A change of night alone raises
-- nothing: the function refuses only a change to the withdrawal of an asset no longer current.

drop trigger if exists social_assets_withdrawal_is_final on public.social_assets;
create trigger social_assets_withdrawal_is_final
  before update of withdrawal_status, withdrawn_at, withdrawal_reason, replaced_by, event_id on public.social_assets
  for each row execute function public.social_asset_withdrawal_is_final();

do $post$
begin
  if not exists (
    select 1 from pg_trigger t
     where t.tgname = 'social_assets_withdrawal_is_final' and not t.tgisinternal
       and t.tgrelid = 'public.social_assets'::regclass
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(t.tgattr::int2[]) k join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k)
           = array['event_id', 'replaced_by', 'withdrawal_reason', 'withdrawal_status', 'withdrawn_at']
  ) then
    raise exception 'social_assets_withdrawal_is_final post-condition failed: its event list is not the five columns';
  end if;
end
$post$;
