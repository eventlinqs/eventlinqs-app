import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_DIR = __dirname;
const HOMEPAGE_URL = 'https://www.eventbrite.com.au/';
const EVENT_DETAIL_URL = 'https://www.eventbrite.com.au/e/sounds-on-sunday-june-long-weekend-2026-tickets-1982642744821';

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };

const USER_AGENT_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const USER_AGENT_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function slowScroll(page) {
  await page.evaluate(async () => {
    const totalHeight = document.body.scrollHeight;
    const step = 400;
    for (let pos = 0; pos < totalHeight; pos += step) {
      window.scrollTo(0, pos);
      await new Promise(r => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));
  });
}

async function collectMeasurements(page, viewport) {
  return await page.evaluate((vp) => {
    const getStyle = (selector, prop) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return window.getComputedStyle(el)[prop] || null;
    };
    const getEl = (selector) => document.querySelector(selector);

    // Typography helpers
    const typographyFor = (selector) => {
      const el = getEl(selector);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        selectorUsed: selector,
        fontFamily: cs.fontFamily,
        fontSizePx: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
      };
    };

    // Try multiple selectors for h1
    const h1Selectors = ['h1', '[data-testid="event-title"]', '.event-title'];
    let h1Data = null;
    for (const sel of h1Selectors) {
      h1Data = typographyFor(sel);
      if (h1Data) break;
    }

    const h2Selectors = ['h2', 'section h2'];
    let h2Data = null;
    for (const sel of h2Selectors) {
      h2Data = typographyFor(sel);
      if (h2Data) break;
    }

    const h3Selectors = ['h3', 'section h3'];
    let h3Data = null;
    for (const sel of h3Selectors) {
      h3Data = typographyFor(sel);
      if (h3Data) break;
    }

    const bodySelectors = ['p', 'body', 'main p', '.eds-text-bs'];
    let bodyData = null;
    for (const sel of bodySelectors) {
      bodyData = typographyFor(sel);
      if (bodyData) break;
    }

    const smallSelectors = ['small', 'caption', '[class*="caption"]', '[class*="small"]', 'footer small'];
    let smallData = null;
    for (const sel of smallSelectors) {
      smallData = typographyFor(sel);
      if (smallData) break;
    }

    // Spacing
    let heroPaddingTop = null, heroPaddingBottom = null;
    const heroSelectors = ['[class*="hero"]', 'header', '.eds-hero', '[class*="Hero"]', 'section:first-of-type'];
    for (const sel of heroSelectors) {
      const el = getEl(sel);
      if (el) {
        const cs = window.getComputedStyle(el);
        heroPaddingTop = cs.paddingTop;
        heroPaddingBottom = cs.paddingBottom;
        break;
      }
    }

    let cardPadding = null;
    const cardSelectors = ['[class*="event-card"]', '[class*="EventCard"]', '[data-testid="event-card"]', '.search-event-card', 'article', '[class*="card"]'];
    for (const sel of cardSelectors) {
      const el = getEl(sel);
      if (el) {
        cardPadding = window.getComputedStyle(el).padding;
        break;
      }
    }

    let cardGridGap = null;
    const gridSelectors = ['[class*="grid"]', '[class*="card-list"]', '[class*="event-list"]', 'ul[class*="event"]'];
    for (const sel of gridSelectors) {
      const el = getEl(sel);
      if (el) {
        const cs = window.getComputedStyle(el);
        cardGridGap = cs.gap || cs.columnGap || cs.gridColumnGap || null;
        break;
      }
    }

    let containerPaddingX = null;
    const containerSelectors = ['main', '[class*="container"]', '[class*="Container"]', '.page-content', '[class*="layout"]'];
    for (const sel of containerSelectors) {
      const el = getEl(sel);
      if (el) {
        containerPaddingX = window.getComputedStyle(el).paddingLeft;
        break;
      }
    }

    // Colour analysis
    const bodyCs = window.getComputedStyle(document.body);
    const primaryTextColour = bodyCs.color;
    const pageBackground = bodyCs.backgroundColor;

    const accentCounts = {};
    const allEls = document.querySelectorAll('button, a, [class*="btn"], [class*="accent"], [class*="cta"], nav a, header button');
    allEls.forEach(el => {
      const cs = window.getComputedStyle(el);
      [cs.backgroundColor, cs.color, cs.borderColor].forEach(c => {
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && c !== primaryTextColour && c !== pageBackground) {
          accentCounts[c] = (accentCounts[c] || 0) + 1;
        }
      });
    });
    const sortedAccents = Object.entries(accentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([colour]) => colour);

    // Image measurements
    let cardImgAspect = null, cardImgFormat = null;
    const cardImgSelectors = ['[class*="event-card"] img', 'article img', '[class*="card"] img'];
    for (const sel of cardImgSelectors) {
      const img = document.querySelector(sel);
      if (img && img.naturalWidth > 0) {
        cardImgAspect = (img.naturalWidth / img.naturalHeight).toFixed(3);
        const src = img.currentSrc || img.src || '';
        if (src.includes('.avif')) cardImgFormat = 'AVIF';
        else if (src.includes('.webp') || src.includes('webp')) cardImgFormat = 'WebP';
        else if (src.includes('.jpg') || src.includes('.jpeg')) cardImgFormat = 'JPG';
        else if (src.includes('.png')) cardImgFormat = 'PNG';
        else cardImgFormat = 'unknown';
        break;
      }
    }

    let heroImgAspect = null;
    const heroImgSelectors = ['[class*="hero"] img', 'header img', '.eds-hero img', 'section:first-of-type img'];
    for (const sel of heroImgSelectors) {
      const img = document.querySelector(sel);
      if (img && img.naturalWidth > 0) {
        heroImgAspect = (img.naturalWidth / img.naturalHeight).toFixed(3);
        break;
      }
    }

    // Motion
    let motionEl = null, transitionDuration = null, transitionTimingFunction = null, elementDescribed = null;
    const motionSelectors = ['button', 'a[class*="btn"]', '[class*="cta"]', '[class*="event-card"] a'];
    for (const sel of motionSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = window.getComputedStyle(el);
        transitionDuration = cs.transitionDuration;
        transitionTimingFunction = cs.transitionTimingFunction;
        elementDescribed = sel + ' (' + (el.textContent || '').trim().slice(0, 40) + ')';
        motionEl = el;
        break;
      }
    }

    // Density (above-fold counting)
    const eventCardEls = document.querySelectorAll('article, [class*="event-card"], [data-testid*="event"], [class*="EventCard"]');
    let eventsAboveFold = 0;
    eventCardEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vp.height && rect.bottom > 0) eventsAboveFold++;
    });

    const filterEls = document.querySelectorAll('[class*="filter"], [class*="category"], [class*="tab"], nav a, [class*="chip"], [class*="pill"]');
    let filtersAboveFold = 0;
    filterEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vp.height && rect.bottom > 0) filtersAboveFold++;
    });

    const ctaEls = document.querySelectorAll('button, a[class*="btn"], a[class*="cta"], [role="button"]');
    let ctasAboveFold = 0;
    ctaEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vp.height && rect.bottom > 0) ctasAboveFold++;
    });

    return {
      typography: { h1: h1Data, h2: h2Data, h3: h3Data, body: bodyData, small: smallData },
      spacing: {
        heroPaddingTopPx: heroPaddingTop,
        heroPaddingBottomPx: heroPaddingBottom,
        eventCardPaddingPx: cardPadding,
        cardGridGapPx: cardGridGap,
        containerPaddingX: containerPaddingX,
      },
      colour: {
        primaryTextColour,
        pageBackground,
        accentColoursTop5: sortedAccents,
      },
      imageRendering: {
        cardImgAspect,
        cardImgFormat,
        heroImgAspect,
      },
      motion: {
        elementDescribed,
        transitionDuration,
        transitionTimingFunction,
      },
      density: {
        eventsAboveFold,
        filterOptionsVisible: filtersAboveFold,
        ctasAboveFold,
      },
    };
  }, viewport);
}

async function capturePage(browser, url, outputDir, label, viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    userAgent: isMobile ? USER_AGENT_MOBILE : USER_AGENT_DESKTOP,
  });
  const page = await context.newPage();

  console.log(`  Loading ${label} (${isMobile ? 'mobile' : 'desktop'}) - ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`  Navigation warning: ${e.message} - continuing anyway`);
  }

  await page.waitForTimeout(4000);

  // Check if blocked
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log(`  Page title: ${title}`);
  const isBlocked = title.toLowerCase().includes('captcha') || title.toLowerCase().includes('access denied') || title.toLowerCase().includes('blocked');
  if (isBlocked) {
    console.log(`  WARNING: Page may be blocked. Title: ${title}`);
  }

  await slowScroll(page);

  const viewport_suffix = isMobile ? 'mobile' : 'desktop';
  const screenshotPath = path.join(outputDir, `screenshot-${viewport_suffix}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Screenshot saved: ${screenshotPath}`);

  const measurements = await collectMeasurements(page, viewport);
  await context.close();

  return { measurements, isBlocked, title };
}

async function main() {
  console.log('Starting Eventbrite capture...');

  const browser = await chromium.launch({ headless: true });

  // ---- HOMEPAGE ----
  console.log('\n=== HOMEPAGE ===');
  const homepageDir = path.join(BASE_DIR, 'homepage');

  const { measurements: hpDesktop, isBlocked: hpDesktopBlocked, title: hpDesktopTitle } =
    await capturePage(browser, HOMEPAGE_URL, homepageDir, 'homepage', DESKTOP_VIEWPORT, false);

  const { measurements: hpMobile, isBlocked: hpMobileBlocked, title: hpMobileTitle } =
    await capturePage(browser, HOMEPAGE_URL, homepageDir, 'homepage', MOBILE_VIEWPORT, true);

  // Build homepage measurements.json
  const homepageMeasurements = {
    competitor: 'eventbrite',
    page: 'homepage',
    url: HOMEPAGE_URL,
    capturedDate: '2026-05-23',
    playwrightWorked: !hpDesktopBlocked,
    typography: {
      h1: hpDesktop.typography.h1 || null,
      h2: hpDesktop.typography.h2 || null,
      h3: hpDesktop.typography.h3 || null,
      body: hpDesktop.typography.body || null,
      small: hpDesktop.typography.small || null,
    },
    h1FontSizeMobilePx: hpMobile.typography.h1 ? hpMobile.typography.h1.fontSizePx : null,
    spacing: {
      heroPaddingTopPx: hpDesktop.spacing.heroPaddingTopPx,
      heroPaddingBottomPx: hpDesktop.spacing.heroPaddingBottomPx,
      eventCardPaddingPx: hpDesktop.spacing.eventCardPaddingPx,
      cardGridGapPx: hpDesktop.spacing.cardGridGapPx,
      mainContainerPaddingXDesktopPx: hpDesktop.spacing.containerPaddingX,
      mainContainerPaddingXMobilePx: hpMobile.spacing.containerPaddingX,
    },
    colour: {
      primaryTextColour: hpDesktop.colour.primaryTextColour,
      pageBackground: hpDesktop.colour.pageBackground,
      accentColoursTop5: hpDesktop.colour.accentColoursTop5,
    },
    imageRendering: {
      eventCardImageAspectRatio: hpDesktop.imageRendering.cardImgAspect,
      eventCardImageRatioWH: hpDesktop.imageRendering.cardImgAspect ? `${parseFloat(hpDesktop.imageRendering.cardImgAspect).toFixed(2)}:1` : null,
      heroImageAspectRatio: hpDesktop.imageRendering.heroImgAspect,
      heroImageRatioWH: hpDesktop.imageRendering.heroImgAspect ? `${parseFloat(hpDesktop.imageRendering.heroImgAspect).toFixed(2)}:1` : null,
      imageFormat: hpDesktop.imageRendering.cardImgFormat,
    },
    motion: {
      elementDescribed: hpDesktop.motion.elementDescribed,
      transitionDuration: hpDesktop.motion.transitionDuration,
      transitionTimingFunction: hpDesktop.motion.transitionTimingFunction,
    },
    notes: [
      hpDesktopBlocked ? `Desktop load blocked/captcha. Title: ${hpDesktopTitle}` : `Desktop loaded OK. Title: ${hpDesktopTitle}`,
      hpMobileBlocked ? `Mobile load blocked/captcha. Title: ${hpMobileTitle}` : `Mobile loaded OK. Title: ${hpMobileTitle}`,
      'Card images served via Eventbrite CDN image proxy (img.evbuc.com) with format=auto; WebP delivered to modern browsers',
      'Homepage geo-defaults to Pyrmont (Sydney) based on IP location',
    ],
  };

  writeFileSync(path.join(homepageDir, 'measurements.json'), JSON.stringify(homepageMeasurements, null, 2));
  console.log('  measurements.json saved for homepage');

  // Build homepage density.json
  const homepageDensity = {
    competitor: 'eventbrite',
    page: 'homepage',
    url: HOMEPAGE_URL,
    capturedDate: '2026-05-23',
    desktop: {
      eventsAboveFold: hpDesktop.density.eventsAboveFold,
      filterOptionsVisible: hpDesktop.density.filterOptionsVisible,
      ctasAboveFold: hpDesktop.density.ctasAboveFold,
    },
    mobile: {
      eventsAboveFold: hpMobile.density.eventsAboveFold,
      filterOptionsVisible: hpMobile.density.filterOptionsVisible,
      ctasAboveFold: hpMobile.density.ctasAboveFold,
    },
    notes: [
      'Density counted at initial viewport (before scroll) at domcontentloaded + 4s wait',
      'Desktop viewport 1440x900, mobile viewport 375x812',
      'Filter count includes nav category links, time filter tabs (All/For you/Today/This weekend), and category pill links',
      'CTA count includes nav links, sign-in buttons, and any prominent action elements above fold',
    ],
  };

  writeFileSync(path.join(homepageDir, 'density.json'), JSON.stringify(homepageDensity, null, 2));
  console.log('  density.json saved for homepage');

  // ---- EVENT DETAIL ----
  console.log('\n=== EVENT DETAIL ===');
  const eventDir = path.join(BASE_DIR, 'event-detail');

  const { measurements: evDesktop, isBlocked: evDesktopBlocked, title: evDesktopTitle } =
    await capturePage(browser, EVENT_DETAIL_URL, eventDir, 'event-detail', DESKTOP_VIEWPORT, false);

  const { measurements: evMobile, isBlocked: evMobileBlocked, title: evMobileTitle } =
    await capturePage(browser, EVENT_DETAIL_URL, eventDir, 'event-detail', MOBILE_VIEWPORT, true);

  // Build event-detail measurements.json
  const eventDetailMeasurements = {
    competitor: 'eventbrite',
    page: 'event-detail',
    url: EVENT_DETAIL_URL,
    capturedDate: '2026-05-23',
    playwrightWorked: !evDesktopBlocked,
    typography: {
      h1: evDesktop.typography.h1 || null,
      h2: evDesktop.typography.h2 || null,
      h3: evDesktop.typography.h3 || null,
      body: evDesktop.typography.body || null,
      small: evDesktop.typography.small || null,
    },
    h1FontSizeMobilePx: evMobile.typography.h1 ? evMobile.typography.h1.fontSizePx : null,
    spacing: {
      heroPaddingTopPx: evDesktop.spacing.heroPaddingTopPx,
      heroPaddingBottomPx: evDesktop.spacing.heroPaddingBottomPx,
      eventCardPaddingPx: evDesktop.spacing.eventCardPaddingPx,
      cardGridGapPx: evDesktop.spacing.cardGridGapPx,
      mainContainerPaddingXDesktopPx: evDesktop.spacing.containerPaddingX,
      mainContainerPaddingXMobilePx: evMobile.spacing.containerPaddingX,
    },
    colour: {
      primaryTextColour: evDesktop.colour.primaryTextColour,
      pageBackground: evDesktop.colour.pageBackground,
      accentColoursTop5: evDesktop.colour.accentColoursTop5,
    },
    imageRendering: {
      eventCardImageAspectRatio: evDesktop.imageRendering.cardImgAspect,
      eventCardImageRatioWH: evDesktop.imageRendering.cardImgAspect ? `${parseFloat(evDesktop.imageRendering.cardImgAspect).toFixed(2)}:1` : null,
      heroImageAspectRatio: evDesktop.imageRendering.heroImgAspect,
      heroImageRatioWH: evDesktop.imageRendering.heroImgAspect ? `${parseFloat(evDesktop.imageRendering.heroImgAspect).toFixed(2)}:1` : null,
      imageFormat: evDesktop.imageRendering.cardImgFormat,
    },
    motion: {
      elementDescribed: evDesktop.motion.elementDescribed,
      transitionDuration: evDesktop.motion.transitionDuration,
      transitionTimingFunction: evDesktop.motion.transitionTimingFunction,
    },
    notes: [
      evDesktopBlocked ? `Desktop load blocked/captcha. Title: ${evDesktopTitle}` : `Desktop loaded OK. Title: ${evDesktopTitle}`,
      evMobileBlocked ? `Mobile load blocked/captcha. Title: ${evMobileTitle}` : `Mobile loaded OK. Title: ${evMobileTitle}`,
      'Event: Sounds On Sunday - June Long Weekend 2026. Music event, North Sydney AU, Sun 7 June 2026',
      'Hero image on event detail is event cover art (2:1 crop), not a separate section hero',
      '"Get tickets" sticky CTA visible on right side column (desktop) and bottom bar (mobile)',
    ],
  };

  writeFileSync(path.join(eventDir, 'measurements.json'), JSON.stringify(eventDetailMeasurements, null, 2));
  console.log('  measurements.json saved for event-detail');

  await browser.close();
  console.log('\nCapture complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
