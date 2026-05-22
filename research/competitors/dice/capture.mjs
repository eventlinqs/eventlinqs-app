/**
 * DICE competitor capture script
 * Captures screenshots and computed style measurements for dice.fm
 * Pages: homepage (https://dice.fm/) and event-detail
 * Viewports: desktop 1440x900, mobile 375x812
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAGES = [
  {
    key: 'homepage',
    url: 'https://dice.fm/',
    dir: path.join(__dirname, 'homepage'),
  },
  {
    key: 'event-detail',
    url: 'https://dice.fm/event/k6gby8-all-day-i-dream-of-golden-days-6th-jun-golden-gate-park-san-francisco-tickets',
    dir: path.join(__dirname, 'event-detail'),
  },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 375, height: 812, mobile: true },
];

const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function slowScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 400;
      const delay = 120;
      let scrolled = 0;
      const total = document.body.scrollHeight;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        scrolled += distance;
        if (scrolled >= total) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 500);
        }
      }, delay);
    });
  });
}

async function getComputedStyleValue(page, selector, prop) {
  return page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return window.getComputedStyle(el).getPropertyValue(prop);
    },
    { selector, prop }
  );
}

async function measureTypography(page, selector) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    return {
      selectorUsed: selector,
      fontFamily: cs.fontFamily,
      fontSizePx: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
    };
  }, selector);
}

async function measureSpacing(page, isMobile) {
  return page.evaluate((isMobile) => {
    function px(el, prop) {
      if (!el) return null;
      return parseFloat(window.getComputedStyle(el).getPropertyValue(prop));
    }

    // Hero section - try common selectors
    const heroSelectors = ['section', 'header', '[class*="hero"]', '[class*="Hero"]', 'main > div:first-child', '.container'];
    let heroEl = null;
    for (const s of heroSelectors) {
      const el = document.querySelector(s);
      if (el && el.getBoundingClientRect().height > 100) {
        heroEl = el;
        break;
      }
    }

    // Event card - try common selectors
    const cardSelectors = ['[class*="card"]', '[class*="Card"]', '[class*="event"]', 'article', 'li a[href*="/event/"]', 'a[href*="/event/"]'];
    let cardEl = null;
    for (const s of cardSelectors) {
      const el = document.querySelector(s);
      if (el) { cardEl = el; break; }
    }

    // Card grid gap
    const gridSelectors = ['[class*="grid"]', '[class*="Grid"]', '[class*="list"]', 'ul', 'ol'];
    let gridEl = null;
    for (const s of gridSelectors) {
      const el = document.querySelector(s);
      if (el) { gridEl = el; break; }
    }

    // Main container
    const containerSelectors = ['main', '[class*="container"]', '[class*="Container"]', '[class*="wrapper"]', 'body > div'];
    let containerEl = null;
    for (const s of containerSelectors) {
      const el = document.querySelector(s);
      if (el) { containerEl = el; break; }
    }

    return {
      heroPaddingTopPx: heroEl ? px(heroEl, 'padding-top') : null,
      heroPaddingBottomPx: heroEl ? px(heroEl, 'padding-bottom') : null,
      eventCardPaddingPx: cardEl ? px(cardEl, 'padding') : null,
      cardGridGapPx: gridEl ? px(gridEl, 'gap') || px(gridEl, 'row-gap') : null,
      mainContainerPaddingXDesktopPx: !isMobile && containerEl ? px(containerEl, 'padding-left') : null,
      mainContainerPaddingXMobilePx: isMobile && containerEl ? px(containerEl, 'padding-left') : null,
    };
  }, isMobile);
}

async function measureColours(page) {
  return page.evaluate(() => {
    // Primary text colour from body
    const bodyCs = window.getComputedStyle(document.body);
    const primaryText = bodyCs.color;
    const pageBg = bodyCs.backgroundColor;

    // Collect accent colours by frequency
    const colourCount = {};
    const ignore = new Set([primaryText, pageBg, 'rgba(0, 0, 0, 0)', 'transparent', '']);

    const all = document.querySelectorAll('*');
    const limit = Math.min(all.length, 500);
    for (let i = 0; i < limit; i++) {
      const cs = window.getComputedStyle(all[i]);
      for (const prop of ['color', 'background-color', 'border-color', 'border-top-color']) {
        const v = cs.getPropertyValue(prop);
        if (v && !ignore.has(v) && v !== 'rgb(0, 0, 0)' && v !== 'rgb(255, 255, 255)') {
          colourCount[v] = (colourCount[v] || 0) + 1;
        }
      }
    }

    function rgbToHex(rgb) {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return rgb;
      return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    }

    const sorted = Object.entries(colourCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => rgbToHex(c));

    return {
      primaryTextColour: rgbToHex(primaryText),
      pageBackground: rgbToHex(pageBg),
      accentColoursTop5: sorted,
    };
  });
}

async function measureImages(page, pageKey) {
  return page.evaluate((pageKey) => {
    // Event card image
    const cardImgSelectors = ['a[href*="/event/"] img', '[class*="card"] img', '[class*="event"] img', 'article img'];
    let cardImg = null;
    for (const s of cardImgSelectors) {
      const el = document.querySelector(s);
      if (el) { cardImg = el; break; }
    }

    // Hero image - look for above-fold large images
    const heroImgSelectors = ['[class*="hero"] img', 'header img', 'main > div:first-child img', 'section img'];
    let heroImg = null;
    if (pageKey === 'event-detail') {
      heroImg = document.querySelector('img');
    } else {
      for (const s of heroImgSelectors) {
        const el = document.querySelector(s);
        if (el && el.naturalWidth > 400) { heroImg = el; break; }
      }
      if (!heroImg) heroImg = document.querySelector('img');
    }

    function aspectRatio(el) {
      if (!el) return { decimal: null, ratio: null };
      const w = el.naturalWidth || el.width;
      const h = el.naturalHeight || el.height;
      if (!w || !h) {
        // Try bounding rect
        const rect = el.getBoundingClientRect();
        if (rect.width && rect.height) {
          const dec = parseFloat((rect.width / rect.height).toFixed(3));
          return { decimal: dec, ratio: `${rect.width.toFixed(0)}:${rect.height.toFixed(0)}` };
        }
        return { decimal: null, ratio: null };
      }
      const dec = parseFloat((w / h).toFixed(3));
      return { decimal: dec, ratio: `${w}:${h}` };
    }

    function imgFormat(el) {
      if (!el) return null;
      const src = el.currentSrc || el.src || '';
      const m = src.match(/\.(avif|webp|jpg|jpeg|png|gif|svg)/i);
      return m ? m[1].toUpperCase() : (src.includes('auto=format') ? 'auto(AVIF/WebP)' : null);
    }

    const cardAR = aspectRatio(cardImg);
    const heroAR = aspectRatio(heroImg);

    return {
      eventCardImageAspectRatio: cardAR.decimal,
      eventCardImageRatioWH: cardAR.ratio,
      heroImageAspectRatio: heroAR.decimal,
      heroImageRatioWH: heroAR.ratio,
      imageFormat: imgFormat(cardImg) || imgFormat(heroImg),
    };
  }, pageKey);
}

async function measureMotion(page) {
  return page.evaluate(() => {
    // Primary button or event card link
    const selectors = ['button', 'a[href*="/event/"]', '[class*="btn"]', '[class*="button"]', '[class*="Button"]'];
    let el = null;
    for (const s of selectors) {
      const found = document.querySelector(s);
      if (found) { el = found; break; }
    }
    if (!el) return { elementDescribed: null, transitionDuration: null, transitionTimingFunction: null };
    const cs = window.getComputedStyle(el);
    return {
      elementDescribed: el.tagName + (el.className ? '.' + el.className.toString().trim().split(/\s+/).join('.') : ''),
      transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction,
    };
  });
}

async function measureDensity(page, viewport) {
  return page.evaluate((vh) => {
    // Count event cards above fold
    const eventSelectors = ['a[href*="/event/"]', '[class*="event"]', '[class*="Event"]', 'article'];
    let events = [];
    for (const s of eventSelectors) {
      const found = [...document.querySelectorAll(s)];
      if (found.length > events.length) events = found;
    }
    const eventsAboveFold = events.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0 && rect.height > 50;
    }).length;

    // Filter/sort/category options
    const filterSelectors = ['[class*="filter"]', '[class*="Filter"]', '[class*="tag"]', '[class*="Tab"]', '[class*="category"]', '[role="tab"]', 'nav a', 'ul li a[href*="browse"]'];
    let filters = [];
    for (const s of filterSelectors) {
      const found = [...document.querySelectorAll(s)];
      if (found.length > filters.length && found.length < 50) filters = found;
    }
    const filterOptionsVisible = filters.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < vh && rect.bottom > 0;
    }).length;

    // CTAs above fold
    const ctaSelectors = ['button', 'a[class*="btn"]', 'a[class*="cta"]', '[class*="Button"]', '[class*="download"]'];
    let ctas = new Set();
    for (const s of ctaSelectors) {
      [...document.querySelectorAll(s)].forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent.trim();
        if (rect.top < vh && rect.bottom > 0 && text.length > 0 && text.length < 60) {
          ctas.add(text);
        }
      });
    }

    return { eventsAboveFold, filterOptionsVisible, ctasAboveFold: ctas.size };
  }, viewport.height);
}

async function capturePage(page, pageConfig, viewport, browser) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    userAgent: viewport.mobile ? UA_MOBILE : UA_DESKTOP,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });

  const p = await context.newPage();
  let playwrightWorked = true;
  const notes = [];

  try {
    await p.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(4000);
    await slowScroll(p);
    await p.waitForTimeout(1000);

    // Verify it's not a CAPTCHA/block page
    const title = await p.title();
    const bodyText = await p.evaluate(() => document.body.innerText.slice(0, 500));
    if (title.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('access denied') || bodyText.toLowerCase().includes('blocked')) {
      notes.push(`Possible bot block detected. Title: "${title}". Proceeding anyway.`);
    }
    notes.push(`Page title: "${title}"`);

  } catch (err) {
    playwrightWorked = false;
    notes.push(`Navigation error: ${err.message}`);
  }

  // Screenshot
  const screenshotPath = path.join(pageConfig.dir, `screenshot-${viewport.name}.png`);
  try {
    await p.screenshot({ path: screenshotPath, fullPage: true });
    notes.push(`Screenshot saved: screenshot-${viewport.name}.png`);
  } catch (err) {
    notes.push(`Screenshot error: ${err.message}`);
  }

  // Measurements (only at desktop for typography; spacing both)
  let measurements = null;
  if (viewport.name === 'desktop') {
    const typoH1 = await measureTypography(p, 'h1');
    const typoH2 = await measureTypography(p, 'h2');
    const typoH3 = await measureTypography(p, 'h3');
    const typoBody = await measureTypography(p, 'p') || await measureTypography(p, 'body');
    const typoSmall = await measureTypography(p, 'small') || await measureTypography(p, '[class*="caption"]') || await measureTypography(p, 'span');
    const spacing = await measureSpacing(p, false);
    const colours = await measureColours(p);
    const images = await measureImages(p, pageConfig.key);
    const motion = await measureMotion(p);
    const density = pageConfig.key === 'homepage' ? await measureDensity(p, viewport) : null;

    measurements = {
      competitor: 'DICE',
      page: pageConfig.key,
      url: pageConfig.url,
      capturedDate: '2026-05-23',
      playwrightWorked,
      typography: {
        h1: typoH1,
        h2: typoH2,
        h3: typoH3,
        body: typoBody,
        small: typoSmall,
      },
      h1FontSizeMobilePx: null, // filled later from mobile pass
      spacing,
      colour: colours,
      imageRendering: images,
      motion,
      notes,
    };

    return { measurements, density, viewport: viewport.name };
  } else {
    // Mobile pass: get h1 font size and mobile container padding
    const h1Mobile = await measureTypography(p, 'h1');
    const spacingMobile = await measureSpacing(p, true);
    const densityMobile = pageConfig.key === 'homepage' ? await measureDensity(p, viewport) : null;
    return {
      h1FontSizeMobilePx: h1Mobile ? h1Mobile.fontSizePx : null,
      spacingMobile,
      densityMobile,
      viewport: viewport.name,
    };
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const pageConfig of PAGES) {
    mkdirSync(pageConfig.dir, { recursive: true });
    console.log(`\n=== Capturing: ${pageConfig.key} ===`);

    // Desktop pass (measurements + screenshot)
    console.log('  Desktop viewport...');
    const context_d = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: UA_DESKTOP,
      isMobile: false,
    });
    const page_d = await context_d.newPage();
    let playwrightWorked = true;
    const notes = [];

    try {
      await page_d.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page_d.waitForTimeout(4000);
      await slowScroll(page_d);
      await page_d.waitForTimeout(1000);
      const title = await page_d.title();
      notes.push(`Page title (desktop): "${title}"`);
      const bodyText = await page_d.evaluate(() => document.body.innerText.slice(0, 200));
      if (bodyText.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('access denied')) {
        notes.push('Warning: possible bot detection on desktop viewport');
      }
    } catch (err) {
      playwrightWorked = false;
      notes.push(`Desktop navigation error: ${err.message}`);
    }

    const screenshotDesktop = path.join(pageConfig.dir, 'screenshot-desktop.png');
    try {
      await page_d.screenshot({ path: screenshotDesktop, fullPage: true });
      console.log(`  Saved: screenshot-desktop.png`);
    } catch (err) {
      notes.push(`Desktop screenshot error: ${err.message}`);
    }

    // Collect measurements at desktop
    const typoH1 = await measureTypography(page_d, 'h1');
    const typoH2 = await measureTypography(page_d, 'h2');
    const typoH3 = await measureTypography(page_d, 'h3');
    const typoBody = await measureTypography(page_d, 'p') || await measureTypography(page_d, 'body');
    const typoSmall = await measureTypography(page_d, 'small') || await measureTypography(page_d, 'span');
    const spacing = await measureSpacing(page_d, false);
    const colours = await measureColours(page_d);
    const images = await measureImages(page_d, pageConfig.key);
    const motion = await measureMotion(page_d);
    const densityDesktop = pageConfig.key === 'homepage' ? await measureDensity(page_d, { height: 900 }) : null;

    await context_d.close();

    // Mobile pass
    console.log('  Mobile viewport...');
    const context_m = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: UA_MOBILE,
      isMobile: true,
      hasTouch: true,
    });
    const page_m = await context_m.newPage();

    try {
      await page_m.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page_m.waitForTimeout(4000);
      await slowScroll(page_m);
      await page_m.waitForTimeout(1000);
      const title = await page_m.title();
      notes.push(`Page title (mobile): "${title}"`);
    } catch (err) {
      notes.push(`Mobile navigation error: ${err.message}`);
    }

    const screenshotMobile = path.join(pageConfig.dir, 'screenshot-mobile.png');
    try {
      await page_m.screenshot({ path: screenshotMobile, fullPage: true });
      console.log(`  Saved: screenshot-mobile.png`);
    } catch (err) {
      notes.push(`Mobile screenshot error: ${err.message}`);
    }

    const h1Mobile = await measureTypography(page_m, 'h1');
    const spacingMobile = await measureSpacing(page_m, true);
    const densityMobile = pageConfig.key === 'homepage' ? await measureDensity(page_m, { height: 812 }) : null;

    await context_m.close();

    // Merge spacing: desktop padding X from desktop, mobile padding X from mobile
    const mergedSpacing = {
      heroPaddingTopPx: spacing.heroPaddingTopPx,
      heroPaddingBottomPx: spacing.heroPaddingBottomPx,
      eventCardPaddingPx: spacing.eventCardPaddingPx,
      cardGridGapPx: spacing.cardGridGapPx,
      mainContainerPaddingXDesktopPx: spacing.mainContainerPaddingXDesktopPx,
      mainContainerPaddingXMobilePx: spacingMobile.mainContainerPaddingXMobilePx,
    };

    // Build measurements.json
    const measurements = {
      competitor: 'DICE',
      page: pageConfig.key,
      url: pageConfig.url,
      capturedDate: '2026-05-23',
      playwrightWorked,
      typography: {
        h1: typoH1,
        h2: typoH2,
        h3: typoH3,
        body: typoBody,
        small: typoSmall,
      },
      h1FontSizeMobilePx: h1Mobile ? h1Mobile.fontSizePx : null,
      spacing: mergedSpacing,
      colour: colours,
      imageRendering: images,
      motion,
      notes,
    };

    const measPath = path.join(pageConfig.dir, 'measurements.json');
    writeFileSync(measPath, JSON.stringify(measurements, null, 2));
    console.log(`  Saved: measurements.json`);

    // density.json only for homepage
    if (pageConfig.key === 'homepage') {
      const density = {
        competitor: 'DICE',
        page: 'homepage',
        url: pageConfig.url,
        capturedDate: '2026-05-23',
        desktop: densityDesktop || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
        mobile: densityMobile || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
        notes: [
          'DICE geolocates to San Francisco via Firecrawl proxy - AU events not available via server-side scrape',
          'Density measured on actual rendered homepage at each viewport',
        ],
      };
      const densPath = path.join(pageConfig.dir, 'density.json');
      writeFileSync(densPath, JSON.stringify(density, null, 2));
      console.log(`  Saved: density.json`);
    }
  }

  await browser.close();
  console.log('\nCapture complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
