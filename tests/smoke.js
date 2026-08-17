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
const fs = require('fs');

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

// AI-detection fixtures: three that should be recognised, and two that must
// NOT be - a false positive puts an install prompt on an uninstallable repo.
const AI_REPOS = [
  { id: 201, name: 'mcp-server-postgres', owner: { login: 'modelcontextprotocol' },
    description: 'An MCP server exposing Postgres to any client.',
    html_url: 'https://github.com/modelcontextprotocol/mcp-server-postgres',
    stargazers_count: 4300, forks_count: 210, watchers_count: 9, open_issues_count: 4,
    language: 'TypeScript', topics: ['mcp', 'model-context-protocol'],
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-15T00:00:00Z' },
  { id: 202, name: 'pdf-skill', owner: { login: 'anthropics' },
    description: 'A Claude skill for reading and filling PDF forms.',
    html_url: 'https://github.com/anthropics/pdf-skill',
    stargazers_count: 2100, forks_count: 90, watchers_count: 4, open_issues_count: 1,
    language: 'Python', topics: ['claude-skill', 'agent-skills'],
    created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-14T00:00:00Z' },
  { id: 203, name: 'swarmkit', owner: { login: 'labs' },
    description: 'Framework for building autonomous agents that cooperate.',
    html_url: 'https://github.com/labs/swarmkit',
    stargazers_count: 8800, forks_count: 400, watchers_count: 20, open_issues_count: 12,
    language: 'Python', topics: ['ai-agents', 'agentic'],
    created_at: '2026-08-03T00:00:00Z', updated_at: '2026-08-13T00:00:00Z' },
  // Decoys - plain software that merely sounds vaguely relevant.
  { id: 204, name: 'redis', owner: { login: 'redis' },
    description: 'An in-memory database that persists on disk.',
    html_url: 'https://github.com/redis/redis',
    stargazers_count: 67000, forks_count: 24000, watchers_count: 100, open_issues_count: 40,
    language: 'C', topics: ['database', 'cache'],
    created_at: '2026-08-04T00:00:00Z', updated_at: '2026-08-12T00:00:00Z' },
  { id: 205, name: 'travel-agent-booking', owner: { login: 'acme' },
    description: 'Booking portal for travel agents. No machine learning involved.',
    html_url: 'https://github.com/acme/travel-agent-booking',
    stargazers_count: 120, forks_count: 8, watchers_count: 2, open_issues_count: 0,
    language: 'PHP', topics: ['booking', 'travel'],
    created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-11T00:00:00Z' }
];

// Modelled on the real typosquat that prompted this feature: a days-old
// re-upload of a popular skill, almost no stars, committed archive + bytecode.
const TYPOSQUAT = {
  id: 301, name: 'book-to-skill', owner: { login: 'notTheRealAuthor' },
  description: 'Turn any book into a Claude skill.',
  html_url: 'https://github.com/notTheRealAuthor/book-to-skill',
  stargazers_count: 3, forks_count: 0, watchers_count: 0, open_issues_count: 0,
  language: 'Python', topics: ['claude-skill'],
  created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  updated_at: new Date().toISOString()
};

// The legitimate original: older, vastly more popular, same name.
const LEGIT_ORIGINAL = {
  id: 302, name: 'book-to-skill', owner: { login: 'realAuthor' },
  description: 'Turn any book into a Claude skill.',
  html_url: 'https://github.com/realAuthor/book-to-skill',
  stargazers_count: 4200, forks_count: 180, watchers_count: 20, open_issues_count: 6,
  language: 'Python', topics: ['claude-skill'],
  created_at: '2025-02-01T00:00:00Z', updated_at: '2026-08-10T00:00:00Z'
};

// An established repo that must NOT be alarmed about.
const ESTABLISHED = {
  id: 303, name: 'swarmkit', owner: { login: 'labs' },
  description: 'Framework for building autonomous agents.',
  html_url: 'https://github.com/labs/swarmkit',
  stargazers_count: 8800, forks_count: 400, watchers_count: 20, open_issues_count: 12,
  language: 'Python', topics: ['ai-agents', 'agentic'],
  created_at: '2025-01-01T00:00:00Z', updated_at: '2026-08-13T00:00:00Z'
};

const MALICIOUS_CONTENTS = [
  { name: 'README.md', html_url: 'https://github.com/x/y/blob/main/README.md' },
  { name: 'launch.py', html_url: 'https://github.com/x/y/blob/main/launch.py' },
  { name: 'book-to-skill-ui.zip', html_url: 'https://github.com/x/y/blob/main/ui.zip' },
  { name: '__pycache__', html_url: 'https://github.com/x/y/tree/main/__pycache__' }
];

const CLEAN_CONTENTS = [
  { name: 'README.md', html_url: 'https://github.com/x/y/blob/main/README.md' },
  { name: 'src', html_url: 'https://github.com/x/y/tree/main/src' }
];

// Fixtures are already written in GitHub API shape.
const toApiShape = r => r;

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
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    let rateLimitMode = false;
    let aiMode = false;
    let riskMode = false;

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

      // Root contents listing (deep risk check)
      const contentsMatch = url.match(/\/repos\/([^/]+)\/([^/]+)\/contents/);
      if (contentsMatch) {
        const owner = decodeURIComponent(contentsMatch[1]);
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(owner === 'notTheRealAuthor' ? MALICIOUS_CONTENTS : CLEAN_CONTENTS) });
      }

      // Name-collision search (deep risk check) uses "in:name"
      if (url.includes('in%3Aname')) {
        const items = url.includes('book-to-skill') ? [LEGIT_ORIGINAL, TYPOSQUAT] : [ESTABLISHED];
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ items: items.map(toApiShape) }) });
      }

      const isSearch = !url.includes('created%3A');
      const browseItems = riskMode ? [TYPOSQUAT, ESTABLISHED] : (aiMode ? AI_REPOS : [GOOD, EVIL]);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: isSearch ? [SEARCH_HIT] : browseItems })
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

    console.log('\n[10] Bookmark export / import round-trip');
    // One bookmark is already saved from [9].
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportBtn')
    ]);
    const exportPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    check('export names the app', exported.app === 'ai-discovery-hub');
    check('export contains the bookmark', Object.keys(exported.bookmarks).length === 1);
    check('export filename is dated', /ai-discovery-hub-bookmarks-\d{4}-\d{2}-\d{2}\.json/.test(download.suggestedFilename()), download.suggestedFilename());

    // Wipe bookmarks, then restore from the exported file.
    await page.evaluate(() => { localStorage.removeItem('bookmarks'); });
    await page.reload();
    await page.waitForSelector('.repo-card', { timeout: 10000 });
    check('bookmarks cleared', (await page.locator('#bookmarkCount').textContent()) === '0');

    page.once('dialog', d => d.accept());
    await page.setInputFiles('#importInput', exportPath);
    await page.waitForTimeout(500);
    check('bookmark restored from file', (await page.locator('#bookmarkCount').textContent()) === '1');

    // A junk file must be rejected without destroying existing bookmarks.
    const junk = path.join(require('os').tmpdir(), 'junk-bookmarks.json');
    fs.writeFileSync(junk, JSON.stringify({ nonsense: true }));
    let dialogText = '';
    page.once('dialog', d => { dialogText = d.message(); d.accept(); });
    await page.setInputFiles('#importInput', junk);
    await page.waitForTimeout(500);
    check('malformed import rejected', /Import failed/.test(dialogText), dialogText);
    check('existing bookmarks survived bad import', (await page.locator('#bookmarkCount').textContent()) === '1');

    console.log('\n[11] "Add to my AI" detection and install panel');
    aiMode = true;
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('.repo-card', { timeout: 10000 });

    const badges = await page.locator('.ai-badge').allTextContents();
    check('MCP server detected', badges.some(b => /MCP Server/i.test(b)), badges.join(' | '));
    check('agent skill detected', badges.some(b => /Agent Skill/i.test(b)), badges.join(' | '));
    check('AI agent detected', badges.some(b => /AI Agent/i.test(b)), badges.join(' | '));
    check('exactly 3 repos flagged, decoys ignored', badges.length === 3, `got ${badges.length}: ${badges.join(' | ')}`);

    const redisCard = page.locator('.repo-card:has-text("redis")');
    check('plain database not flagged', await redisCard.locator('.add-to-ai-btn').count() === 0);
    const travelCard = page.locator('.repo-card:has-text("travel-agent-booking")');
    check('non-AI "agent" repo not flagged', await travelCard.locator('.add-to-ai-btn').count() === 0);

    // Open the MCP repo's panel.
    await page.locator('.repo-card:has-text("mcp-server-postgres")').locator('.add-to-ai-btn').click();
    await page.waitForSelector('#aiModal.open', { timeout: 5000 });
    check('modal opened', await page.locator('.modal-card').isVisible());
    check('card did not also open a new tab', ctx.pages().length === 1, `${ctx.pages().length} pages`);

    const cloneCode = await page.locator('.install-code').first().textContent();
    check('clone command is real and repo-specific',
      cloneCode.includes('git clone https://github.com/modelcontextprotocol/mcp-server-postgres.git'), cloneCode);
    check('guessy step is flagged', await page.locator('.install-flag').count() > 0);

    await page.click('.modal-tab:has-text("Cursor")');
    await page.waitForTimeout(300);
    check('Cursor tab shows mcpServers config', /mcpServers/.test(await page.locator('.modal-body').textContent()));

    await page.click('#modalAdd');
    await page.waitForTimeout(300);
    check('added to stack', (await page.locator('#aiStackCount').textContent()) === '1');
    check('status starts as want-to-try', /want to try/i.test(await page.locator('.stack-state').textContent()));

    await page.click('#modalToggleStatus');
    await page.waitForTimeout(200);
    check('status flips to installed', /installed/i.test(await page.locator('.stack-state').textContent()));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes the modal', !(await page.locator('#aiModal').evaluate(el => el.classList.contains('open'))));
    check('card button reflects stack membership',
      /In your AI stack/i.test(await page.locator('.repo-card:has-text("mcp-server-postgres")').locator('.add-to-ai-btn').textContent()));

    console.log('\n[12] Skill repo gets the skills-folder command');
    await page.locator('.repo-card:has-text("pdf-skill")').locator('.add-to-ai-btn').click();
    await page.waitForSelector('#aiModal.open', { timeout: 5000 });
    const skillCode = await page.locator('.install-code').first().textContent();
    check('skill installs into ~/.claude/skills/', skillCode.includes('~/.claude/skills/pdf-skill'), skillCode);
    await page.click('#modalClose');
    await page.waitForTimeout(200);

    console.log('\n[13] AI stack survives export/import');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
    const p2 = await dl2.path();
    const payload2 = JSON.parse(fs.readFileSync(p2, 'utf8'));
    check('export carries the AI stack', Object.keys(payload2.aiStack || {}).length === 1);

    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('.repo-card', { timeout: 10000 });
    check('stack cleared', (await page.locator('#aiStackCount').textContent()) === '0');
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#importInput', p2);
    await page.waitForTimeout(500);
    check('stack restored from file', (await page.locator('#aiStackCount').textContent()) === '1');

    console.log('\n[14] Risk signals — the typosquat scenario');
    riskMode = true; aiMode = false;
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('.repo-card', { timeout: 10000 });

    const squatCard = page.locator('.repo-card:has-text("book-to-skill")');
    const goodCard = page.locator('.repo-card:has-text("swarmkit")');
    check('typosquat card carries a warning chip', await squatCard.locator('.risk-chip.high').count() === 1);
    check('established repo has no warning chip', await goodCard.locator('.risk-chip').count() === 0);
    check('button copy changes on risky repo',
      /Review, then add/i.test(await squatCard.locator('.add-to-ai-btn').textContent()));

    await squatCard.locator('.add-to-ai-btn').click();
    await page.waitForSelector('#aiModal.open', { timeout: 5000 });
    // The panel turns "high" from the basic signals immediately; wait for the
    // deep check to finish before asserting on its findings.
    await page.waitForFunction(() => !document.querySelector('.risk-loading'), null, { timeout: 10000 });
    const panel = await page.locator('.risk-panel').textContent();

    check('flags new + unproven', /day\(s\) ago with 3 star/i.test(panel), panel.slice(0, 200));
    check('flags the name collision', /shares this name/i.test(panel));
    check('names the established rival', /realAuthor\/book-to-skill/.test(panel));
    check('flags committed archive', /book-to-skill-ui\.zip/.test(panel));
    check('flags committed bytecode', /__pycache__/.test(panel));
    check('never claims the repo is safe', !/\bis safe\b|✓ safe|no risk\b/i.test(panel), panel.slice(0, 200));

    check('install steps are gated behind a click', await page.locator('.steps-gate').count() === 1);
    check('no copy buttons before revealing', await page.locator('.copy-btn').count() === 0);
    await page.click('#revealSteps');
    await page.waitForTimeout(300);
    check('steps appear after explicit reveal', await page.locator('.copy-btn').count() > 0);

    await page.click('#modalClose');
    await page.waitForTimeout(200);

    console.log('\n[15] Clean repo: no signals, but no safety promise either');
    await goodCard.locator('.add-to-ai-btn').click();
    await page.waitForSelector('#aiModal.open', { timeout: 5000 });
    await page.waitForFunction(() => !document.querySelector('.risk-loading'), null, { timeout: 10000 });
    const cleanPanel = await page.locator('.risk-panel').textContent();
    check('reports no signals found', /No automated signals found/i.test(cleanPanel));
    check('explicitly disclaims a safety verdict', /not a safety verdict/i.test(cleanPanel));
    check('steps not gated for a clean repo', await page.locator('.steps-gate').count() === 0);
    check('standing warning always shown', /running someone else's code/i.test(cleanPanel));
    await page.click('#modalClose');
    await page.waitForTimeout(200);

    console.log('\n[16] Rate-limited checks degrade honestly');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('.repo-card', { timeout: 10000 });
    rateLimitMode = true;
    await page.locator('.repo-card:has-text("swarmkit")').locator('.add-to-ai-btn').click();
    await page.waitForSelector('#aiModal.open', { timeout: 5000 });
    await page.waitForFunction(() => !document.querySelector('.risk-loading'), null, { timeout: 10000 });
    const degraded = await page.locator('.risk-panel').textContent();
    check('says checks did not complete', /did not complete/i.test(degraded), degraded.slice(0, 200));
    check('does not imply all-clear when degraded', /incomplete/i.test(degraded));
    rateLimitMode = false;
    await page.click('#modalClose');
    await page.waitForTimeout(200);

    check('still no page errors at end', errors.length === 0, errors.join('; '));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
