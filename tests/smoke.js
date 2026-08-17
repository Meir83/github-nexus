// Smoke tests for AI Discovery Hub.
//
// The app talks to third-party APIs, so every request is mocked here - these
// tests never hit the network and are safe to run offline. They cover the
// behaviour that is easy to regress by hand: HTML escaping of API-supplied
// text, platform-wide search, rate-limit messaging, and tab navigation.
//
//   npm install -D playwright && npx playwright install chromium
//   node tests/smoke.js
//
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');

// A repo whose name/description/url are hostile, as a real attacker could craft.
const EVIL = {
  id: 999,
  name: '<img src=x onerror="window.__XSS=1">',
  owner: { login: '"><script>window.__XSS2=1</script>' },
  description: '<svg onload="window.__XSS3=1">',
  html_url: 'javascript:window.__XSS4=1',
  stargazers_count: 5, forks_count: 1, watchers_count: 1, open_issues_count: 0,
  language: 'JS', topics: ['<b>bold</b>'],
  created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-10T00:00:00Z'
};

const GOOD = {
  id: 1, name: 'cool-repo', owner: { login: 'octocat' },
  description: 'A normal repo', html_url: 'https://github.com/octocat/cool-repo',
  stargazers_count: 1234, forks_count: 56, watchers_count: 7, open_issues_count: 3,
  language: 'Python', topics: ['ai'],
  created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-10T00:00:00Z'
};

const SEARCH_HIT = {
  id: 42, name: 'needle-repo', owner: { login: 'finder' },
  description: 'Found by global search only', html_url: 'https://github.com/finder/needle-repo',
  stargazers_count: 99, forks_count: 2, watchers_count: 1, open_issues_count: 0,
  language: 'Rust', topics: [],
  created_at: '2020-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

(async () => {
  // PLAYWRIGHT_CHROMIUM lets CI point at a preinstalled browser.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
  );

  // ---- Scenario 1: normal load + XSS payloads ----
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let rateLimitMode = false;

    await page.route('**/api.github.com/**', async route => {
      if (rateLimitMode) {
        return route.fulfill({
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 300),
            'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ message: 'API rate limit exceeded' })
        });
      }
      const url = route.request().url();
      const isSearch = !url.includes('created%3A');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: isSearch ? [SEARCH_HIT] : [GOOD, EVIL] })
      });
    });
    await page.route('**/huggingface.co/api/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'meta/llama', modelId: 'meta/llama', author: 'meta', likes: 10, downloads: 500, pipeline_tag: 'text-generation', tags: ['nlp'], createdAt: '2026-01-01T00:00:00Z', lastModified: '2026-02-01T00:00:00Z' }])
    }));

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    console.log('\n[1] Load + XSS handling');
    await page.goto(FILE);
    await page.waitForSelector('.repo-card', { timeout: 10000 });

    check('cards rendered', await page.locator('.repo-card').count() === 2);
    check('no page errors', errors.length === 0, errors.join('; '));

    const xss = await page.evaluate(() => [window.__XSS, window.__XSS2, window.__XSS3, window.__XSS4]);
    check('no XSS payload executed', xss.every(v => v === undefined), JSON.stringify(xss));

    const evilName = await page.locator('.repo-card').nth(1).locator('.repo-name').textContent();
    check('hostile name rendered as text', evilName.includes('<img src=x'), evilName);
    check('no injected img element', await page.locator('.repo-card img').count() === 0);
    check('no injected svg element', await page.locator('.repo-card svg').count() === 0);
    check('no inline onclick attribute', await page.locator('.repo-card[onclick]').count() === 0);

    const evilUrl = await page.locator('.repo-card').nth(1).getAttribute('data-url');
    check('javascript: URL stripped', evilUrl === '', JSON.stringify(evilUrl));
    const goodUrl = await page.locator('.repo-card').nth(0).getAttribute('data-url');
    check('https URL preserved', goodUrl === 'https://github.com/octocat/cool-repo', goodUrl);

    console.log('\n[2] Browse-scope banner (trending mislabel fix)');
    const banner = await page.locator('#searchScopeBanner').textContent();
    check('banner says "created"', /created/i.test(banner), banner.trim().slice(0, 80));

    console.log('\n[3] Global search finds repos not in the loaded list');
    check('needle absent before search', !(await page.locator('.repo-card').allTextContents()).join(' ').includes('needle-repo'));
    await page.fill('#searchInput', 'needle');
    await page.press('#searchInput', 'Enter');
    await page.waitForSelector('.repo-card:has-text("needle-repo")', { timeout: 10000 });
    check('search returned platform-wide result', (await page.locator('.repo-card').allTextContents()).join(' ').includes('needle-repo'));
    check('search banner shown', /Searching all of GitHub/i.test(await page.locator('#searchScopeBanner').textContent()));

    console.log('\n[4] Back to browse');
    await page.click('#clearSearchBtn');
    await page.waitForSelector('.repo-card:has-text("cool-repo")', { timeout: 10000 });
    check('returned to browse list', (await page.locator('.repo-card').allTextContents()).join(' ').includes('cool-repo'));
    check('search input cleared', await page.inputValue('#searchInput') === '');

    console.log('\n[5] LLM Arena shows notice, not fake ELOs');
    await page.click('.platform-tab[data-platform="llmarena"]');
    await page.waitForSelector('.notice-panel', { timeout: 10000 });
    const noticeText = await page.locator('.notice-panel').textContent();
    check('notice panel shown', noticeText.includes('not connected yet'));
    check('no fabricated ELO numbers', !/1365|1348|1320/.test(await page.content()));
    check('links to real leaderboard', (await page.locator('.notice-link').getAttribute('href')).includes('lmarena.ai'));

    console.log('\n[6] HuggingFace tab still works');
    await page.click('.platform-tab[data-platform="huggingface"]');
    await page.waitForSelector('.repo-card', { timeout: 10000 });
    check('HF card rendered', (await page.locator('.repo-card').allTextContents()).join(' ').includes('meta/llama'));

    console.log('\n[7] Rate limit produces a readable message');
    rateLimitMode = true;
    await page.evaluate(() => localStorage.clear());
    await page.click('.platform-tab[data-platform="github"]');
    await page.waitForSelector('.error-message', { timeout: 10000 });
    const err = await page.locator('.error-message').textContent();
    check('rate limit explained', /rate limit/i.test(err) && /10 per minute/.test(err), err.trim().slice(0, 160));
    check('reset time surfaced', /minute\(s\)/.test(err), err.trim().slice(0, 160));

    console.log('\n[8] Controls restored after leaving LLM Arena');
    rateLimitMode = false;
    await page.click('.platform-tab[data-platform="llmarena"]');
    await page.waitForSelector('.notice-panel', { timeout: 10000 });
    check('search hidden on LLM Arena', !(await page.locator('.search-group').isVisible()));
    await page.click('.platform-tab[data-platform="github"]');
    await page.waitForSelector('.repo-card', { timeout: 10000 });
    check('search visible again', await page.locator('.search-group').isVisible());
    check('language filter visible again', await page.locator('#languageGroup').isVisible());
    check('sort visible again', await page.locator('#sortGroup').isVisible());

    console.log('\n[9] Bookmarks round-trip');
    await page.locator('.repo-card').first().locator('.bookmark-btn').click();
    check('bookmark counter incremented', (await page.locator('#bookmarkCount').textContent()) === '1');
    await page.click('#bookmarksBtn');
    await page.waitForTimeout(300);
    check('bookmarks view shows one item', await page.locator('.repo-card').count() === 1);
    await page.click('#browseBtn');
    await page.waitForTimeout(500);
    check('browse restores full list', await page.locator('.repo-card').count() === 2);

    check('still no page errors at end', errors.length === 0, errors.join('; '));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
