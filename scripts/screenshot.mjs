import { chromium } from 'playwright';

const targets = [
  { url: 'http://localhost:3000/',                                      name: 'homepage',     viewport: { width: 1440, height: 900 } },
  { url: 'http://localhost:3000/',                                      name: 'homepage-mobile', viewport: { width: 390, height: 844 } },
  { url: 'http://localhost:3000/events',                                name: 'events',       viewport: { width: 1440, height: 900 } },
  { url: 'http://localhost:3000/events',                                name: 'events-mobile', viewport: { width: 390, height: 844 } },
  { url: 'http://localhost:3000/events/browse/melbourne',               name: 'melbourne',    viewport: { width: 1440, height: 900 } },
  { url: 'http://localhost:3000/events/browse/melbourne',               name: 'melbourne-mobile', viewport: { width: 390, height: 844 } },
  { url: 'http://localhost:3000/events/bollywood-nights-sydney-dhol-and-dance', name: 'event-detail-bollywood', viewport: { width: 1440, height: 900 } },
  { url: 'http://localhost:3000/events/bollywood-nights-sydney-dhol-and-dance', name: 'event-detail-bollywood-mobile', viewport: { width: 390, height: 844 } },
  { url: 'http://localhost:3000/events/caribbean-carnival-melbourne-soca-saturday', name: 'event-detail-caribbean', viewport: { width: 1440, height: 900 } },
];

const browser = await chromium.launch();
for (const t of targets) {
  const ctx = await browser.newContext({ viewport: t.viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`); });
  try {
    const resp = await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const out = `docs/sprint1/screenshots/${t.name}.png`;
    await page.screenshot({ path: out, fullPage: true });
    const status = resp ? resp.status() : 'no-response';
    console.log(`${t.name}: HTTP ${status} | ${out} | errors=${errors.length}`);
    if (errors.length) console.log(`  first-err: ${errors[0].slice(0, 200)}`);
  } catch (e) {
    console.log(`${t.name}: FAILED ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
