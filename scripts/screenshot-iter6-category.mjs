import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const viewports = [
  { name: 'mobile-375',     width: 375,  height: 667 },
  { name: 'mobile-414',     width: 414,  height: 896 },
  { name: 'tablet-768',     width: 768,  height: 1024 },
  { name: 'tablet-1024',    width: 1024, height: 1366 },
  { name: 'desktop-1280',   width: 1280, height: 800 },
  { name: 'desktop-1440',   width: 1440, height: 900 },
  { name: 'desktop-1920',   width: 1920, height: 1080 },
];

const outDir = 'docs/sprint1/phase-1b/iter-6/screenshots-category-after';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
for (const v of viewports) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto('http://localhost:3000/categories/afrobeats', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    const out = `${outDir}/${v.name}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(`${v.name} (${v.width}x${v.height}): HTTP ${resp ? resp.status() : 'no-response'} -> ${out}`);
  } catch (e) {
    console.log(`${v.name}: FAILED ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
