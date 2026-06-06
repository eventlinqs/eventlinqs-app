# Migration drift reconciliation - 2026-06-06

Pre-launch hardening item 12. Read-only check of local migration files against
the remote applied history on the linked Sydney project
(`gndnldyfudbytbboxesk`).

## Command (read-only, nothing applied)

```
supabase migration list --linked
```

Note: on this machine `npx supabase` is broken; the `supabase` binary is used
directly. The command only reads `supabase_migrations.schema_migrations` on the
remote; it does not apply anything.

## Result: NO DRIFT

- Local migration files: 34
- Remote applied migrations: 34
- Every row returned a matching `Local | Remote` version. There are no
  local-only rows (nothing pending apply) and no remote-only rows (no orphan
  applied migration missing a local file).
- Local filenames: 0 duplicate version prefixes, 0 malformed names (all match
  `^[0-9]{14}_`), strictly increasing.

The newest pair, `20260606000001` (`drop_artists_spotify_url`, from the Spotify
removal merged earlier today), is already present on both sides.

## Fix required

None. Local and remote histories are in lockstep.

## Re-run instructions for the founder

If new migration files are added before launch, re-run `supabase migration list
--linked` and confirm every local version shows a matching remote version. Apply
any pending (local-only) migration with `supabase db push --linked` from
PowerShell. Never apply via the Dashboard SQL editor or the Supabase MCP.

## Related, still open

Hardening item 13 (handwritten `src/types/database.ts` to
`supabase gen types typescript --linked`) is a separate task and is not changed
here.
