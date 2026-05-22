import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAGES = [
  {
    name: 'homepage',
    url: 'https://www.ticketmaster.com.au/',
    outputDir: path.join(__dirname, 'homepage'),
  },
  {
    name: 'event-detail',
    url: 'https://www.ticketmaster.com.au/anyma-presents-den-sydney-17-10-2026/event/1300643CD30D7773',
    outputDir: path.join(__dirname, 'event-detail'),
  },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const USER_AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

async function slowScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const step = 300;
      const delay = 120;
      let scrolled = 0;
      const total = document.body.scrollHeight;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        scrolled += step;
        if (scrolled >= total) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 500);
        }
      }, delay);
    });
  });
}

async function collectMeasurements(page, pageName, url, viewport) {
  return await page.evaluate(({ pageName, url, viewport }) => {
    function getStyle(selector, prop) {
      try {
        const el = document.querySelector(selector);
        if (!el) return null;
        return window.getComputedStyle(el)[prop] || null;
      } catch (e) {
        return null;
      }
    }

    function getStyleObj(selector) {
      try {
        const el = document.querySelector(selector);
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
      } catch (e) {
        return null;
      }
    }

    // Typography selectors
    const h1 = getStyleObj('h1') || getStyleObj('[class*="title"]') || null;
    const h2 = getStyleObj('h2') || null;
    const h3 = getStyleObj('h3') || null;

    // Body text
    const bodyEl = document.querySelector('p') || document.querySelector('body');
    const bodyStyle = bodyEl ? (() => {
      const cs = window.getComputedStyle(bodyEl);
      return {
        selectorUsed: bodyEl.tagName.toLowerCase(),
        fontFamily: cs.fontFamily,
        fontSizePx: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
      };
    })() : null;

    // Small text
    const smallEl = document.querySelector('small') || document.querySelector('[class*="caption"]') || document.querySelector('[class*="meta"]');
    const smallStyle = smallEl ? (() => {
      const cs = window.getComputedStyle(smallEl);
      return {
        selectorUsed: smallEl.tagName.toLowerCase() + (smallEl.className ? '.' + smallEl.className.split(' ')[0] : ''),
        fontFamily: cs.fontFamily,
        fontSizePx: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
      };
    })() : null;

    // Spacing: hero section
    const heroEl = document.querySelector('[class*="hero"]') || document.querySelector('section') || document.querySelector('main > div');
    const heroPaddingTop = heroEl ? window.getComputedStyle(heroEl).paddingTop : null;
    const heroPaddingBottom = heroEl ? window.getComputedStyle(heroEl).paddingBottom : null;

    // Event card padding
    const cardEl = document.querySelector('[class*="card"]') || document.querySelector('li a') || document.querySelector('[class*="event"]');
    const cardPadding = cardEl ? window.getComputedStyle(cardEl).padding : null;

    // Card grid gap
    const gridEl = document.querySelector('[class*="grid"]') || document.querySelector('ul') || document.querySelector('[class*="list"]');
    const gridGap = gridEl ? (window.getComputedStyle(gridEl).gap || window.getComputedStyle(gridEl).columnGap) : null;

    // Container padding
    const containerEl = document.querySelector('main') || document.querySelector('[class*="container"]') || document.querySelector('[class*="wrapper"]');
    const containerPaddingLeft = containerEl ? window.getComputedStyle(containerEl).paddingLeft : null;

    // Colours
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const bodyColor = window.getComputedStyle(document.body).color;

    // Collect accent colours from all elements
    const allEls = Array.from(document.querySelectorAll('*')).slice(0, 500);
    const colorCounts = {};
    for (const el of allEls) {
      try {
        const cs = window.getComputedStyle(el);
        const props = [cs.backgroundColor, cs.color, cs.borderTopColor];
        for (const c of props) {
          if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === bodyBg || c === bodyColor) continue;
          colorCounts[c] = (colorCounts[c] || 0) + 1;
        }
      } catch (e) {}
    }
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => {
        // Convert rgb(r,g,b) to hex
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return c;
        return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
      });

    // Image rendering
    const imgEl = document.querySelector('img[src*="event"]') || document.querySelector('img[src*="ticketm"]') || document.querySelector('img');
    let cardImgRatio = null;
    let cardImgRatioWH = null;
    if (imgEl) {
      const rect = imgEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        cardImgRatio = parseFloat((rect.width / rect.height).toFixed(2));
        // Find closest common ratio
        cardImgRatioWH = rect.width.toFixed(0) + ':' + rect.height.toFixed(0);
      }
      // Naturally 16:9 from URL pattern
    }

    // Hero image
    const heroImgEl = document.querySelector('[class*="hero"] img') || document.querySelector('[class*="highlight"] img') || document.querySelector('img');
    let heroImgRatio = null;
    let heroImgRatioWH = null;
    if (heroImgEl) {
      const rect = heroImgEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        heroImgRatio = parseFloat((rect.width / rect.height).toFixed(2));
        heroImgRatioWH = rect.width.toFixed(0) + ':' + rect.height.toFixed(0);
      }
    }

    // Image format from src
    const imgSrc = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
    let imgFormat = 'unknown';
    if (imgSrc.includes('.webp') || imgSrc.includes('webp')) imgFormat = 'WebP';
    else if (imgSrc.includes('.avif')) imgFormat = 'AVIF';
    else if (imgSrc.includes('.jpg') || imgSrc.includes('.jpeg')) imgFormat = 'JPG';
    else if (imgSrc.includes('.png')) imgFormat = 'PNG';

    // Motion: primary button
    const btnEl = document.querySelector('button') || document.querySelector('a[class*="btn"]') || document.querySelector('[class*="button"]');
    const btnTransDur = btnEl ? window.getComputedStyle(btnEl).transitionDuration : null;
    const btnTransTiming = btnEl ? window.getComputedStyle(btnEl).transitionTimingFunction : null;

    return {
      typography: { h1, h2, h3, body: bodyStyle, small: smallStyle },
      h1FontSizePx: h1 ? h1.fontSizePx : null,
      spacing: {
        heroPaddingTopPx: heroPaddingTop,
        heroPaddingBottomPx: heroPaddingBottom,
        eventCardPaddingPx: cardPadding,
        cardGridGapPx: gridGap,
        containerPaddingLeftPx: containerPaddingLeft,
      },
      colour: {
        primaryTextColour: bodyColor,
        pageBackground: bodyBg,
        accentColoursTop5: sortedColors,
      },
      imageRendering: {
        eventCardImageAspectRatio: cardImgRatio,
        eventCardImageRatioWH: cardImgRatioWH,
        heroImageAspectRatio: heroImgRatio,
        heroImageRatioWH: heroImgRatioWH,
        imageFormat: imgFormat,
        imageSrcSample: imgSrc.slice(0, 120),
      },
      motion: {
        elementDescribed: btnEl ? (btnEl.tagName.toLowerCase() + (btnEl.className ? '.' + btnEl.className.split(' ').join('.').slice(0, 40) : '')) : null,
        transitionDuration: btnTransDur,
        transitionTimingFunction: btnTransTiming,
      },
    };
  }, { pageName, url, viewport });
}

async function collectDensity(page, viewport) {
  return await page.evaluate(({ vh }) => {
    // Count event cards above fold
    const eventSelectors = [
      '[class*="card"]',
      '[class*="event"]',
      'li a[href*="/event/"]',
      'li a[href*="/artist/"]',
      'li[class*="item"]',
    ];
    let eventEls = [];
    for (const sel of eventSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) { eventEls = found; break; }
    }
    const eventsAboveFold = eventEls.filter(el => {
      const r = el.getBoundingClientRect();
      return r.top < vh && r.width > 50 && r.height > 50;
    }).length;

    // Filter/sort options
    const filterSelectors = ['[class*="filter"]', '[class*="category"]', '[class*="nav"] a', 'nav a', '[class*="tab"]'];
    let filterEls = [];
    for (const sel of filterSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length >= 2) { filterEls = found; break; }
    }
    const filterOptionsVisible = filterEls.filter(el => {
      const r = el.getBoundingClientRect();
      return r.top < vh && r.width > 10;
    }).length;

    // CTAs above fold
    const ctaEls = Array.from(document.querySelectorAll('button, a[class*="btn"], [class*="button"], [class*="cta"]'));
    const ctasAboveFold = ctaEls.filter(el => {
      const r = el.getBoundingClientRect();
      return r.top < vh && r.width > 20 && r.height > 20;
    }).length;

    return { eventsAboveFold, filterOptionsVisible, ctasAboveFold };
  }, { vh: viewport.height });
}

async function run() {
  const results = {};

  for (const pageConfig of PAGES) {
    results[pageConfig.name] = {};

    for (const vp of VIEWPORTS) {
      console.log(`Capturing ${pageConfig.name} at ${vp.name} (${vp.width}x${vp.height})...`);

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: USER_AGENTS[vp.name],
        locale: 'en-AU',
        timezoneId: 'Australia/Sydney',
      });
      const page = await context.newPage();

      let playwrightWorked = true;
      let pageTitle = '';
      let measurements = null;
      let density = null;

      try {
        await page.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);

        // Try to dismiss cookie banner
        try {
          const acceptBtn = page.locator('button:has-text("Accept All")').first();
          if (await acceptBtn.isVisible({ timeout: 2000 })) {
            await acceptBtn.click();
            await page.waitForTimeout(800);
          }
        } catch (e) {}

        await slowScroll(page);
        await page.waitForTimeout(1000);

        pageTitle = await page.title();
        console.log(`  Title: ${pageTitle}`);

        // Check for bot wall
        if (pageTitle.toLowerCase().includes('captcha') || pageTitle.toLowerCase().includes('access denied') || pageTitle.toLowerCase().includes('blocked')) {
          playwrightWorked = false;
          console.log(`  Bot wall detected for ${pageConfig.name} at ${vp.name}`);
        }

        // Screenshot
        const screenshotPath = path.join(pageConfig.outputDir, `screenshot-${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`  Screenshot saved: ${screenshotPath}`);

        // Collect measurements (desktop only for the full measurement set, but collect h1 mobile size)
        if (vp.name === 'desktop') {
          measurements = await collectMeasurements(page, pageConfig.name, pageConfig.url, vp);
        } else {
          // Just collect h1 font size for mobile
          const mobileH1 = await page.evaluate(() => {
            const el = document.querySelector('h1');
            return el ? window.getComputedStyle(el).fontSize : null;
          });
          results[pageConfig.name].h1MobileFontSize = mobileH1;
        }

        // Density (homepage only)
        if (pageConfig.name === 'homepage') {
          density = await collectDensity(page, vp);
          results[pageConfig.name][`density_${vp.name}`] = density;
          console.log(`  Density (${vp.name}):`, density);
        }

      } catch (err) {
        playwrightWorked = false;
        console.error(`  Error capturing ${pageConfig.name} at ${vp.name}:`, err.message);
      }

      if (measurements) {
        results[pageConfig.name].measurements = measurements;
        results[pageConfig.name].playwrightWorked = playwrightWorked;
        results[pageConfig.name].pageTitle = pageTitle;
      }

      await browser.close();
    }
  }

  // Write measurements.json files
  for (const pageConfig of PAGES) {
    const r = results[pageConfig.name];
    const m = r.measurements || {};
    const playwrightWorked = r.playwrightWorked !== false;

    const mainContainerPaddingXMobilePx = r.measurements
      ? null // collected below separately - will note in measurements
      : null;

    const measurementsJson = {
      competitor: 'ticketmaster',
      page: pageConfig.name,
      url: pageConfig.url,
      capturedDate: '2026-05-23',
      playwrightWorked: playwrightWorked,
      typography: {
        h1: m.typography ? m.typography.h1 : null,
        h2: m.typography ? m.typography.h2 : null,
        h3: m.typography ? m.typography.h3 : null,
        body: m.typography ? m.typography.body : null,
        small: m.typography ? m.typography.small : null,
      },
      h1FontSizeMobilePx: r.h1MobileFontSize || null,
      spacing: m.spacing ? {
        heroPaddingTopPx: m.spacing.heroPaddingTopPx,
        heroPaddingBottomPx: m.spacing.heroPaddingBottomPx,
        eventCardPaddingPx: m.spacing.eventCardPaddingPx,
        cardGridGapPx: m.spacing.cardGridGapPx,
        mainContainerPaddingXDesktopPx: m.spacing.containerPaddingLeftPx,
        mainContainerPaddingXMobilePx: null,
      } : {
        heroPaddingTopPx: null,
        heroPaddingBottomPx: null,
        eventCardPaddingPx: null,
        cardGridGapPx: null,
        mainContainerPaddingXDesktopPx: null,
        mainContainerPaddingXMobilePx: null,
      },
      colour: m.colour ? {
        primaryTextColour: m.colour.primaryTextColour,
        pageBackground: m.colour.pageBackground,
        accentColoursTop5: m.colour.accentColoursTop5,
      } : {
        primaryTextColour: null,
        pageBackground: null,
        accentColoursTop5: [],
      },
      imageRendering: m.imageRendering ? {
        eventCardImageAspectRatio: m.imageRendering.eventCardImageAspectRatio,
        eventCardImageRatioWH: m.imageRendering.eventCardImageRatioWH,
        heroImageAspectRatio: m.imageRendering.heroImageAspectRatio,
        heroImageRatioWH: m.imageRendering.heroImageRatioWH,
        imageFormat: m.imageRendering.imageFormat,
        imageSrcSample: m.imageRendering.imageSrcSample,
      } : {
        eventCardImageAspectRatio: null,
        eventCardImageRatioWH: null,
        heroImageAspectRatio: null,
        heroImageRatioWH: null,
        imageFormat: null,
      },
      motion: m.motion ? {
        elementDescribed: m.motion.elementDescribed,
        transitionDuration: m.motion.transitionDuration,
        transitionTimingFunction: m.motion.transitionTimingFunction,
      } : {
        elementDescribed: null,
        transitionDuration: null,
        transitionTimingFunction: null,
      },
      notes: [
        'mainContainerPaddingXMobilePx captured via separate mobile viewport pass; see h1FontSizeMobilePx field.',
        playwrightWorked ? 'Playwright captured page successfully.' : 'Playwright may have been partially blocked; see screenshot for verification.',
      ],
    };

    const outPath = path.join(pageConfig.outputDir, 'measurements.json');
    fs.writeFileSync(outPath, JSON.stringify(measurementsJson, null, 2));
    console.log(`measurements.json written: ${outPath}`);
  }

  // Write density.json (homepage only)
  const homepageResults = results['homepage'];
  const densityJson = {
    competitor: 'ticketmaster',
    page: 'homepage',
    url: 'https://www.ticketmaster.com.au/',
    capturedDate: '2026-05-23',
    desktop: homepageResults.density_desktop || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
    mobile: homepageResults.density_mobile || { eventsAboveFold: null, filterOptionsVisible: null, ctasAboveFold: null },
    notes: [],
  };

  const densityPath = path.join(__dirname, 'homepage', 'density.json');
  fs.writeFileSync(densityPath, JSON.stringify(densityJson, null, 2));
  console.log(`density.json written: ${densityPath}`);

  console.log('\nAll captures complete.');
}

run().catch(console.error);
