import { readFileSync } from 'node:fs';

const routes = [
  ['home', '/'],
  ['events', '/events'],
  ['city', '/events/browse/melbourne'],
  ['event-detail', '/events/afrobeats-...'],
  ['category', '/categories/afrobeats'],
];

const rows = [];
for (const [name, label] of routes) {
  const path = `docs/sprint1/phase-1b/iter-6/${name}.report.json`;
  const r = JSON.parse(readFileSync(path, 'utf8'));
  const c = r.categories;
  const a = r.audits;
  rows.push({
    route: label,
    perf: c.performance?.score ?? null,
    a11y: c.accessibility?.score ?? null,
    bp: c['best-practices']?.score ?? null,
    seo: c.seo?.score ?? null,
    fcp: Math.round(a['first-contentful-paint'].numericValue),
    lcp: Math.round(a['largest-contentful-paint'].numericValue),
    tbt: Math.round(a['total-blocking-time'].numericValue),
    cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    si: Math.round(a['speed-index'].numericValue),
    ttfb: Math.round(a['server-response-time'].numericValue),
  });
}

console.log(JSON.stringify(rows, null, 2));
