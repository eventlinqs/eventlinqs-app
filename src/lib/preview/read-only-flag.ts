/**
 * THE READ-ONLY PREVIEW SWITCH, FRAMEWORK FREE (2 November 2026). PREVIEW_READ_ONLY=1 is set on the design preview's
 * branch only (src/lib/preview/read-only.ts holds the refusal it drives). The switch lives here, apart from that file,
 * because src/lib/supabase/admin.ts reads it, and the admin client is also loaded by plain node outside Next (the guard
 * probes); read-only.ts imports next/server, which plain node cannot resolve ("Cannot find module ... next/server",
 * sitemap-covers-the-catalogue at 07:42). Anything outside Next imports the switch from here.
 */
export function previewReadOnlyOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.PREVIEW_READ_ONLY === '1'
}
