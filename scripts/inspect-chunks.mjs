// Identify what modules are in the worst-offender JS chunks.
// Read minified output, search for known signatures from each library.
import { readFileSync, readdirSync, statSync } from 'node:fs'

const CHUNKS_DIR = '.next/static/chunks'

// Files identified as worst offenders by Lighthouse unused-javascript audit
// across the 11 routes in iter-7.
const TARGETS = [
  '12537mhf-1c02.js',     // 81% unused on /events
  '0.~2ky53fo~10.js',     // 37% unused on /events (likely framework)
  '03~yq9q893hmn.js',     // 112 KB
  '0gyanf0v5_rzs.js',     // 109 KB
  '16x4h-h3v448c.js',     // 100% unused on /events
]

const SIGNATURES = {
  'react-query': ['useQueryClient', 'QueryClientProvider', 'mutateAsync'],
  'supabase': ['createBrowserClient', 'supabaseUrl', 'GoTrueClient'],
  'stripe': ['StripeElement', 'useStripe', 'loadStripe'],
  'googlemaps': ['google.maps', 'MarkerClusterer', '@googlemaps'],
  'lucide-react': ['lucide', 'LucideIcon'],
  'radix-dialog': ['DialogTrigger', 'DialogContent'],
  'radix-popover': ['PopoverContent'],
  'radix-select': ['SelectTrigger', 'SelectContent'],
  'radix-tooltip': ['TooltipProvider'],
  'radix-navigation': ['NavigationMenu'],
  'radix-toast': ['ToastProvider'],
  'radix-tabs': ['TabsContent'],
  'radix-accordion': ['AccordionTrigger'],
  'zustand': ['useStore', 'createStore', 'subscribeWithSelector'],
  'tailwind-merge': ['twMerge', 'tailwind-merge'],
  'react-email': ['react-email', '@react-email'],
  'cva': ['class-variance-authority', 'cva'],
  'date-fns': ['date-fns'],
  'next-router': ['useRouter', 'usePathname', 'useSearchParams'],
  'next-image': ['next/image', '_next/image'],
  'next-form': ['useFormState', 'useFormStatus'],
  'react-19': ['useTransition', 'useDeferredValue', 'useOptimistic', 'startTransition'],
  'video-player': ['HLS', 'videojs', 'VideoPlayer'],
  'meilisearch': ['MeiliSearch', 'meilisearch'],
  'upstash': ['Upstash', 'redis'],
}

for (const t of TARGETS) {
  let buf
  try {
    buf = readFileSync(`${CHUNKS_DIR}/${t}`, 'utf8')
  } catch (e) {
    console.log(`\n## ${t}\n  MISSING: ${e.message}`)
    continue
  }
  const size = (buf.length / 1024).toFixed(1)
  console.log(`\n## ${t} (${size} KB unminified)`)
  const hits = []
  for (const [libName, sigs] of Object.entries(SIGNATURES)) {
    let count = 0
    for (const s of sigs) {
      const matches = buf.split(s).length - 1
      count += matches
    }
    if (count > 0) hits.push([libName, count])
  }
  hits.sort((a, b) => b[1] - a[1])
  for (const [name, c] of hits) console.log(`  ${name}: ${c} hits`)
}

// Also: full chunk list with sizes, looking for chunks that should NOT be on most routes
console.log('\n\n=== All chunks > 30 KB ===')
const all = readdirSync(CHUNKS_DIR)
  .map((f) => ({ f, size: statSync(`${CHUNKS_DIR}/${f}`).size }))
  .filter((x) => x.size > 30 * 1024 && x.f.endsWith('.js'))
  .sort((a, b) => b.size - a.size)
for (const { f, size } of all) {
  console.log(`  ${(size / 1024).toFixed(1).padStart(7)} KB  ${f}`)
}
