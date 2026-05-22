import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PAGES = [
  {
    slug: 'homepage',
    url: 'https://www.humanitix.com/au/',
    outputDir: join(__dirname, 'homepage'),
  },
  {
    slug: 'event-detail',
    url: 'https://events.humanitix.com/bangladesh-night-2026',
    outputDir: join(__dirname, 'event-detail'),
  },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 375, height: 812, mobile: true },
];

const USER_AGENTS = {
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mobile:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

async function slowScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 400;
      const delay = 120;
      let scrolled = 0;
      const totalHeight = document.body.scrollHeight;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        scrolled += distance;
        if (scrolled >= totalHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 500);
        }
      }, delay);
    });
  });
}

function getRGBHex(color) {
  if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') return null;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return color;
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

async function collectMeasurements(page, slug, url, viewport) {
  return await page.evaluate(
    ({ slug, url, viewport }) => {
      function getStyle(selector, prop) {
        try {
          const el = document.querySelector(selector);
          if (!el) return null;
          return window.getComputedStyle(el).getPropertyValue(prop) || null;
        } catch {
          return null;
        }
      }

      function getRGBHex(color) {
        if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') return null;
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }

      function measureTypo(selector) {
        const el = document.querySelector(selector);
        if (!el) return { selectorUsed: selector, fontFamily: null, fontSizePx: null, fontWeight: null, lineHeight: null, letterSpacing: null };
        const cs = window.getComputedStyle(el);
        return {
          selectorUsed: selector,
          fontFamily: cs.fontFamily || null,
          fontSizePx: parseFloat(cs.fontSize) || null,
          fontWeight: cs.fontWeight || null,
          lineHeight: cs.lineHeight || null,
          letterSpacing: cs.letterSpacing || null,
        };
      }

      // Typography
      const h1Selectors = ['h1', '.event-title', '[data-testid="event-title"]'];
      const h2Selectors = ['h2', 'section h2'];
      const h3Selectors = ['h3', 'section h3'];
      const bodySelectors = ['body', 'p', 'main p'];
      const smallSelectors = ['small', '.caption', 'figcaption', 'time', '.text-sm'];

      let h1El = null;
      for (const sel of h1Selectors) {
        h1El = document.querySelector(sel);
        if (h1El) break;
      }
      let h2El = null;
      for (const sel of h2Selectors) {
        h2El = document.querySelector(sel);
        if (h2El) break;
      }
      let h3El = null;
      for (const sel of h3Selectors) {
        h3El = document.querySelector(sel);
        if (h3El) break;
      }
      let bodyEl = document.querySelector('body');
      let smallEl = null;
      for (const sel of smallSelectors) {
        smallEl = document.querySelector(sel);
        if (smallEl) break;
      }

      function measureEl(el, fallbackSel) {
        const selector = el ? (el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '')) : fallbackSel;
        if (!el) return { selectorUsed: fallbackSel, fontFamily: null, fontSizePx: null, fontWeight: null, lineHeight: null, letterSpacing: null };
        const cs = window.getComputedStyle(el);
        return {
          selectorUsed: selector,
          fontFamily: cs.fontFamily || null,
          fontSizePx: parseFloat(cs.fontSize) || null,
          fontWeight: cs.fontWeight || null,
          lineHeight: cs.lineHeight || null,
          letterSpacing: cs.letterSpacing || null,
        };
      }

      const typography = {
        h1: measureEl(h1El, 'h1'),
        h2: measureEl(h2El, 'h2'),
        h3: measureEl(h3El, 'h3'),
        body: measureEl(bodyEl, 'body'),
        small: measureEl(smallEl, 'small'),
      };

      // Spacing
      let heroPaddingTopPx = null;
      let heroPaddingBottomPx = null;
      const heroSelectors = [
        '[class*="hero"]', '[class*="Hero"]', '[class*="banner"]', '[class*="Banner"]',
        'section:first-of-type', 'header', '.featured', '[class*="featured"]'
      ];
      let heroEl = null;
      for (const sel of heroSelectors) {
        heroEl = document.querySelector(sel);
        if (heroEl) break;
      }
      if (heroEl) {
        const cs = window.getComputedStyle(heroEl);
        heroPaddingTopPx = parseFloat(cs.paddingTop) || null;
        heroPaddingBottomPx = parseFloat(cs.paddingBottom) || null;
      }

      let eventCardPaddingPx = null;
      const cardSelectors = [
        '[class*="EventCard"]', '[class*="event-card"]', '[class*="card"]',
        'article', '[class*="Card"]', 'li[class*="event"]'
      ];
      let cardEl = null;
      for (const sel of cardSelectors) {
        cardEl = document.querySelector(sel);
        if (cardEl) break;
      }
      if (cardEl) {
        const cs = window.getComputedStyle(cardEl);
        const p = [parseFloat(cs.paddingTop), parseFloat(cs.paddingRight), parseFloat(cs.paddingBottom), parseFloat(cs.paddingLeft)].filter(v => v > 0);
        eventCardPaddingPx = p.length ? p[0] : null;
      }

      let cardGridGapPx = null;
      const gridSelectors = [
        '[class*="grid"]', '[class*="Grid"]', '[class*="EventList"]', '[class*="cards"]',
        'ul[class*="event"]', '[class*="row"]'
      ];
      let gridEl = null;
      for (const sel of gridSelectors) {
        gridEl = document.querySelector(sel);
        if (gridEl) break;
      }
      if (gridEl) {
        const cs = window.getComputedStyle(gridEl);
        cardGridGapPx = parseFloat(cs.gap || cs.columnGap) || null;
      }

      const containerSelectors = [
        'main', '[class*="container"]', '[class*="Container"]', '[class*="wrapper"]', 'section'
      ];
      let containerEl = null;
      for (const sel of containerSelectors) {
        containerEl = document.querySelector(sel);
        if (containerEl) break;
      }
      let mainContainerPaddingXPx = null;
      if (containerEl) {
        const cs = window.getComputedStyle(containerEl);
        mainContainerPaddingXPx = parseFloat(cs.paddingLeft) || null;
      }

      // Colour
      const bodyCs = window.getComputedStyle(document.body);
      const primaryTextColour = getRGBHex(bodyCs.color);
      const pageBackground = getRGBHex(bodyCs.backgroundColor);

      // Accent colour tally - sample many elements
      const colourCount = {};
      const allEls = document.querySelectorAll('*');
      let sampled = 0;
      for (const el of allEls) {
        if (sampled > 500) break;
        sampled++;
        const cs = window.getComputedStyle(el);
        const props = [cs.backgroundColor, cs.color, cs.borderColor];
        for (const c of props) {
          const hex = getRGBHex(c);
          if (!hex) continue;
          if (hex === pageBackground || hex === primaryTextColour) continue;
          if (hex === '#000000' || hex === '#ffffff' || hex === '#fafafa' || hex === '#f9fafb') continue;
          colourCount[hex] = (colourCount[hex] || 0) + 1;
        }
      }
      const accentColoursTop5 = Object.entries(colourCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([hex]) => hex);

      // Image rendering
      let eventCardImageAspectRatio = null;
      let eventCardImageRatioWH = null;
      let heroImageAspectRatio = null;
      let heroImageRatioWH = null;
      let imageFormat = null;

      const cardImgSelectors = [
        '[class*="card"] img', '[class*="Card"] img', 'article img', 'li img',
        '[class*="event"] img', 'a[href*="events.humanitix"] img'
      ];
      let cardImg = null;
      for (const sel of cardImgSelectors) {
        cardImg = document.querySelector(sel);
        if (cardImg) break;
      }
      if (cardImg) {
        const w = cardImg.naturalWidth || cardImg.offsetWidth;
        const h = cardImg.naturalHeight || cardImg.offsetHeight;
        if (w && h) {
          const ratio = w / h;
          eventCardImageAspectRatio = Math.round(ratio * 100) / 100;
          const gcd = (a, b) => b ? gcd(b, a % b) : a;
          const d = gcd(w, h);
          eventCardImageRatioWH = `${w/d}:${h/d}`;
        }
        const src = cardImg.currentSrc || cardImg.src || '';
        const ext = src.split('.').pop().split('?')[0].split('&')[0].toLowerCase();
        if (['avif','webp','jpg','jpeg','png'].includes(ext)) imageFormat = ext.toUpperCase();
        else if (src.includes('webp')) imageFormat = 'WebP';
        else if (src.includes('avif')) imageFormat = 'AVIF';
      }

      const heroImgSelectors = [
        '[class*="hero"] img', '[class*="Hero"] img', '[class*="banner"] img',
        'header img', 'section:first-of-type img', '[class*="featured"] img'
      ];
      let heroImg = null;
      for (const sel of heroImgSelectors) {
        heroImg = document.querySelector(sel);
        if (heroImg) break;
      }
      if (heroImg) {
        const w = heroImg.naturalWidth || heroImg.offsetWidth;
        const h = heroImg.naturalHeight || heroImg.offsetHeight;
        if (w && h) {
          const ratio = w / h;
          heroImageAspectRatio = Math.round(ratio * 100) / 100;
          const gcd = (a, b) => b ? gcd(b, a % b) : a;
          const d = gcd(w, h);
          heroImageRatioWH = `${w/d}:${h/d}`;
        }
      }

      // Motion
      const btnSelectors = [
        'button[class*="primary"]', 'a[class*="btn"]', 'button',
        'a[class*="button"]', '[class*="cta"]', '[class*="ticket"]'
      ];
      let btnEl = null;
      let btnSelectorUsed = null;
      for (const sel of btnSelectors) {
        btnEl = document.querySelector(sel);
        if (btnEl) { btnSelectorUsed = sel; break; }
      }
      let transitionDuration = null;
      let transitionTimingFunction = null;
      let motionElementDescribed = null;
      if (btnEl) {
        const cs = window.getComputedStyle(btnEl);
        transitionDuration = cs.transitionDuration || null;
        transitionTimingFunction = cs.transitionTimingFunction || null;
        motionElementDescribed = btnSelectorUsed;
      }

      return {
        typography,
        spacing: {
          heroPaddingTopPx,
          heroPaddingBottomPx,
          eventCardPaddingPx,
          cardGridGapPx,
          mainContainerPaddingXPx,
        },
        colour: {
          primaryTextColour,
          pageBackground,
          accentColoursTop5,
        },
        imageRendering: {
          eventCardImageAspectRatio,
          eventCardImageRatioWH,
          heroImageAspectRatio,
          heroImageRatioWH,
          imageFormat,
        },
        motion: {
          elementDescribed: motionElementDescribed,
          transitionDuration,
          transitionTimingFunction,
        },
      };
    },
    { slug, url, viewport }
  );
}

async function collectDensity(page, viewport) {
  return await page.evaluate(({ vw, vh }) => {
    // Count event cards above fold
    const cardSelectors = [
      'a[href*="events.humanitix"]',
      '[class*="card"]',
      '[class*="Card"]',
      'article',
      'li[class*="event"]',
    ];
    let eventEls = [];
    for (const sel of cardSelectors) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length > 3) { eventEls = els; break; }
    }
    const eventsAboveFold = eventEls.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0 && rect.width > 50;
    }).length;

    // Filter/category options visible
    const filterSelectors = [
      'nav a', '[class*="filter"]', '[class*="Filter"]',
      '[class*="category"]', '[class*="Category"]',
      '[class*="tab"]', '[class*="pill"]', 'ul[class*="nav"] li'
    ];
    let filterEls = [];
    for (const sel of filterSelectors) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length > 2) { filterEls = [...filterEls, ...els]; }
    }
    const filterOptionsVisible = [...new Set(filterEls)].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0 && rect.width > 10;
    }).length;

    // CTAs above fold
    const ctaSelectors = [
      'button', 'a[class*="btn"]', 'a[class*="button"]',
      '[class*="cta"]', 'a[class*="primary"]', 'a[href*="tickets"]'
    ];
    let ctaEls = [];
    for (const sel of ctaSelectors) {
      ctaEls = [...ctaEls, ...document.querySelectorAll(sel)];
    }
    const ctasAboveFold = [...new Set(ctaEls)].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0 && rect.width > 10;
    }).length;

    return { eventsAboveFold, filterOptionsVisible, ctasAboveFold };
  }, { vw: viewport.width, vh: viewport.height });
}

async function capturePage(browser, pageConfig) {
  const { slug, url, outputDir } = pageConfig;
  mkdirSync(outputDir, { recursive: true });

  const results = {};

  for (const vp of VIEWPORTS) {
    console.log(`  [${slug}] Capturing ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: USER_AGENTS[vp.name] || USER_AGENTS.desktop,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'en-AU',
    });

    const page = await context.newPage();
    let playwrightWorked = true;
    let errorNote = null;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      // Try to close cookie banner
      try {
        const acceptBtn = await page.$('button:has-text("Accept all"), button:has-text("Accept"), [class*="cookie"] button');
        if (acceptBtn) await acceptBtn.click();
        await page.waitForTimeout(500);
      } catch {}

      await slowScroll(page);
      await page.waitForTimeout(1000);

      // Take full-page screenshot
      const screenshotPath = join(outputDir, `screenshot-${vp.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`    Saved screenshot: screenshot-${vp.name}.png`);

      // Collect measurements on desktop pass only
      if (vp.name === 'desktop') {
        results.desktopMeasurements = await collectMeasurements(page, slug, url, vp);
        if (slug === 'homepage') {
          results.desktopDensity = await collectDensity(page, vp);
        }
      } else {
        results.mobileMeasurements = await collectMeasurements(page, slug, url, vp);
        if (slug === 'homepage') {
          results.mobileDensity = await collectDensity(page, vp);
        }
      }
    } catch (err) {
      playwrightWorked = false;
      errorNote = err.message;
      console.error(`    ERROR on ${vp.name}: ${err.message}`);
    }

    results.playwrightWorked = results.playwrightWorked === false ? false : playwrightWorked;
    if (errorNote) {
      results.errors = results.errors || [];
      results.errors.push({ viewport: vp.name, error: errorNote });
    }

    await context.close();
  }

  // Build measurements.json
  const dm = results.desktopMeasurements || {};
  const mm = results.mobileMeasurements || {};

  const measurements = {
    competitor: 'humanitix',
    page: slug,
    url,
    capturedDate: '2026-05-23',
    playwrightWorked: results.playwrightWorked !== false,
    typography: dm.typography || null,
    h1FontSizeMobilePx: mm.typography?.h1?.fontSizePx || null,
    spacing: dm.spacing
      ? {
          heroPaddingTopPx: dm.spacing.heroPaddingTopPx,
          heroPaddingBottomPx: dm.spacing.heroPaddingBottomPx,
          eventCardPaddingPx: dm.spacing.eventCardPaddingPx,
          cardGridGapPx: dm.spacing.cardGridGapPx,
          mainContainerPaddingXDesktopPx: dm.spacing.mainContainerPaddingXPx,
          mainContainerPaddingXMobilePx: mm.spacing?.mainContainerPaddingXPx || null,
        }
      : null,
    colour: dm.colour || null,
    imageRendering: dm.imageRendering || null,
    motion: dm.motion || null,
    notes: results.errors ? results.errors.map(e => `${e.viewport}: ${e.error}`) : [],
  };

  writeFileSync(join(outputDir, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(`    Saved measurements.json`);

  // Build density.json for homepage only
  if (slug === 'homepage') {
    const density = {
      competitor: 'humanitix',
      page: 'homepage',
      url,
      capturedDate: '2026-05-23',
      desktop: results.desktopDensity || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
      mobile: results.mobileDensity || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
      notes: results.errors ? results.errors.map(e => `${e.viewport}: ${e.error}`) : [],
    };
    writeFileSync(join(outputDir, 'density.json'), JSON.stringify(density, null, 2));
    console.log(`    Saved density.json`);
  }

  return measurements;
}

async function main() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });

  try {
    for (const pageConfig of PAGES) {
      console.log(`\nCapturing page: ${pageConfig.slug} (${pageConfig.url})`);
      await capturePage(browser, pageConfig);
    }
  } finally {
    await browser.close();
    console.log('\nDone. Browser closed.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
