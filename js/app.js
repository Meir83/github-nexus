// API Configuration
const GITHUB_API = 'https://api.github.com';
const HUGGINGFACE_API = 'https://huggingface.co/api';
const LLM_ARENA_API = 'https://lmarena.ai/api'; // Note: We'll need to verify the actual endpoint

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week
const SEARCH_CACHE_DURATION = 60 * 60 * 1000; // 1 hour - searches should stay fresh

// Global State
let currentPlatform = 'github';
let currentView = 'grid';
let allItems = [];
let filteredItems = [];
// null while browsing; { platform, query } while showing platform-wide
// search results rather than the curated browse list.
let searchMode = null;
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '{}');

// Utility Functions

// Escape text coming from external APIs before it reaches innerHTML.
// Repo names, descriptions and model IDs are user-supplied upstream.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only http(s) links are allowed through to the DOM, so a crafted
// javascript: or data: URL from an API response can never be opened.
function safeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.href);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch (error) {
        return '';
    }
}

function getWeekNumber(date = new Date()) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCacheKey(platform, params = {}) {
    return `${platform}_${JSON.stringify(params)}`;
}

function isCacheValid(cachedData, duration = CACHE_DURATION) {
    if (!cachedData || !cachedData.timestamp) return false;
    return (Date.now() - cachedData.timestamp) < duration;
}

// Bookmark Functions
function isBookmarked(id, platform) {
    const key = `${platform}_${id}`;
    return bookmarks[key] !== undefined;
}

function toggleBookmark(item, platform) {
    const key = `${platform}_${item.id}`;
    if (bookmarks[key]) {
        delete bookmarks[key];
    } else {
        bookmarks[key] = { ...item, platform, bookmarkedAt: Date.now() };
    }
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    updateBookmarkCount();
    return !bookmarks[key];
}

function updateBookmarkCount() {
    document.getElementById('bookmarkCount').textContent = Object.keys(bookmarks).length;
}

// Bookmarks live in localStorage, which a cleared browser cache wipes without
// warning. Export is this app's entire backup story - so import has to exist
// too, or the backup is one you can never restore from.
const BOOKMARK_EXPORT_VERSION = 1;

function exportBookmarks() {
    const count = Object.keys(bookmarks).length;
    if (count === 0 && Object.keys(aiStack).length === 0) {
        alert('Nothing to export yet. Bookmark an item with ☆, or add one to your AI stack.');
        return;
    }

    const payload = {
        app: 'ai-discovery-hub',
        version: BOOKMARK_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        count,
        bookmarks,
        aiStack
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-discovery-hub-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Accepts either the wrapped export format or a bare bookmarks object, so a
// hand-edited or older file still restores.
function parseBookmarkFile(text) {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('This file does not look like an export from this app.');
    }

    // Keep only entries that actually describe an item, so a malformed file
    // cannot poison the stores with junk that breaks rendering.
    const clean = (source) => {
        const valid = {};
        if (source && typeof source === 'object' && !Array.isArray(source)) {
            Object.entries(source).forEach(([key, item]) => {
                if (item && typeof item === 'object' && item.id !== undefined && item.name) {
                    valid[key] = item;
                }
            });
        }
        return valid;
    };

    // A v1 file is a bare bookmarks object with no wrapper; a v2 file wraps
    // bookmarks and the AI stack together. Both must still restore.
    const wrapped = parsed.bookmarks !== undefined || parsed.aiStack !== undefined;
    const result = {
        bookmarks: clean(wrapped ? parsed.bookmarks : parsed),
        aiStack: clean(parsed.aiStack)
    };

    if (Object.keys(result.bookmarks).length === 0 && Object.keys(result.aiStack).length === 0) {
        throw new Error('No valid bookmarks or AI stack entries found in that file.');
    }

    return result;
}

async function importBookmarks(file) {
    try {
        const incoming = parseBookmarkFile(await file.text());

        const before = Object.keys(bookmarks).length;
        // Merge rather than replace - importing on a device that already has
        // bookmarks should never silently delete them.
        bookmarks = { ...bookmarks, ...incoming.bookmarks };
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));

        let stackAdded = 0;
        if (incoming.aiStack) {
            const stackBefore = Object.keys(aiStack).length;
            aiStack = { ...aiStack, ...incoming.aiStack };
            saveAiStack();
            stackAdded = Object.keys(aiStack).length - stackBefore;
        }

        const added = Object.keys(bookmarks).length - before;
        updateBookmarkCount();
        renderItems(filteredItems);

        const parts = [`${added} new bookmark(s)`];
        if (stackAdded) parts.push(`${stackAdded} new AI stack entr(ies)`);
        alert(`Import complete: ${parts.join(', ')}.`);
    } catch (error) {
        alert(`Import failed: ${error.message}`);
    }
}

// Shared fetch wrapper. Unauthenticated GitHub search allows only
// 10 requests per minute, so rate limiting is a normal condition here,
// not an edge case - it deserves a message that explains itself.
async function fetchJson(url, source) {
    const response = await fetch(url);

    if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        const resetHeader = response.headers.get('x-ratelimit-reset');

        // The x-ratelimit-* headers are only readable when the API
        // exposes them via CORS, so treat an unreadable header as a
        // rate limit too - it is by far the most common cause of a 403
        // on anonymous requests, and a vague message helps nobody.
        if (response.status === 429 || remaining === null || remaining === '0') {
            let waitNote = 'Please wait a minute and try again.';
            if (resetHeader) {
                const secondsLeft = Math.max(0, Math.ceil(Number(resetHeader) * 1000 - Date.now()) / 1000);
                if (Number.isFinite(secondsLeft) && secondsLeft > 0) {
                    waitNote = `Try again in about ${Math.ceil(secondsLeft / 60)} minute(s).`;
                }
            }
            throw new Error(
                `${source} rate limit reached. Anonymous requests are capped ` +
                `(GitHub search allows 10 per minute). ${waitNote} ` +
                `Cached results are reused for a week, so browsing already-loaded data still works.`
            );
        }

        throw new Error(`${source} refused the request (HTTP 403).`);
    }

    if (!response.ok) {
        throw new Error(`${source} error: HTTP ${response.status}`);
    }

    return response.json();
}

// ---------------------------------------------------------------------------
// "Add to my AI" - detection
//
// Decides whether a repository is something you would plug into an AI setup,
// and if so which kind. Scoring rather than a flat keyword match, because a
// repo merely *mentioning* an LLM is not an agent framework: topics are
// curated by the repo owner and are the strongest signal, the name is next,
// and a description mention alone is weak unless the phrase is unambiguous
// (nobody writes "Model Context Protocol" by accident).
//
// Anything scoring below AI_MATCH_THRESHOLD gets no badge and no button - a
// false positive here is worse than a miss, because it puts an install prompt
// on a repo that cannot be installed.

const AI_MATCH_THRESHOLD = 3;

const AI_TYPES = {
    mcp: {
        label: 'MCP Server',
        icon: '🔌',
        topics: ['mcp', 'mcp-server', 'mcp-servers', 'model-context-protocol', 'modelcontextprotocol'],
        namePatterns: [/(^|[-_])mcp([-_]|$)/i],
        strongPhrases: [/model context protocol/i, /\bmcp server\b/i]
    },
    skill: {
        label: 'Agent Skill',
        icon: '🧩',
        topics: ['claude-skill', 'claude-skills', 'agent-skill', 'agent-skills', 'ai-skill', 'ai-skills'],
        namePatterns: [/(^|[-_])skills?([-_]|$)/i],
        strongPhrases: [/\bclaude skill/i, /\bagent skill/i]
    },
    agent: {
        label: 'AI Agent',
        icon: '🤖',
        topics: ['ai-agent', 'ai-agents', 'llm-agent', 'llm-agents', 'autonomous-agents',
                 'agentic', 'agentic-ai', 'agent-framework', 'multi-agent'],
        namePatterns: [/(^|[-_])agents?([-_]|$)/i],
        strongPhrases: [/\bai agents?\b/i, /\bautonomous agents?\b/i, /\bagentic\b/i]
    },
    llmtool: {
        label: 'LLM Tooling',
        icon: '🧠',
        topics: ['llm', 'llms', 'llmops', 'genai', 'generative-ai', 'rag', 'retrieval-augmented-generation',
                 'prompt-engineering', 'embeddings', 'vector-database', 'vector-search',
                 'openai', 'anthropic', 'claude', 'langchain', 'llama', 'transformers'],
        namePatterns: [/(^|[-_])(llm|gpt|rag|prompt)([-_]|$)/i],
        strongPhrases: [/\blarge language models?\b/i, /\bretrieval[- ]augmented\b/i]
    }
};

// Weights: a curated topic outranks a name hit, which outranks prose.
const AI_SCORE_TOPIC = 3;
const AI_SCORE_NAME = 2;
const AI_SCORE_PHRASE = 3;

function scoreAiType(item, config) {
    let score = 0;

    const topics = (item.topics || []).map(t => String(t).toLowerCase());
    if (config.topics.some(t => topics.includes(t))) score += AI_SCORE_TOPIC;

    const name = String(item.name || '');
    if (config.namePatterns.some(re => re.test(name))) score += AI_SCORE_NAME;

    const text = `${item.description || ''} ${name}`;
    if (config.strongPhrases.some(re => re.test(text))) score += AI_SCORE_PHRASE;

    return score;
}

// Returns { type, label, icon, score } or null when the repo is not AI-related.
function detectAiType(item) {
    if (!item) return null;
    // HuggingFace models are already AI by definition, but they are not
    // something you "install into" an AI tool, so they stay out of this.
    if (item.platform !== 'github') return null;

    let best = null;
    Object.entries(AI_TYPES).forEach(([type, config]) => {
        const score = scoreAiType(item, config);
        if (score >= AI_MATCH_THRESHOLD && (!best || score > best.score)) {
            best = { type, label: config.label, icon: config.icon, score };
        }
    });

    return best;
}

// ---------------------------------------------------------------------------
// Repository risk signals
//
// Context: this app puts an install button next to arbitrary GitHub repos, and
// a typosquatted re-upload of a popular skill nearly got installed on a real
// machine. So the button needs to carry risk information.
//
// What this is NOT: a malware scanner. A static page cannot read a repo's code,
// cannot spot obfuscation, and cannot know what an external endpoint does with
// your data. It therefore NEVER declares a repo safe - the absence of signals
// is reported as "nothing automated found", not as a clean bill of health.
// A false reassurance here is worse than no check at all, because it would
// launder exactly the repo that is trying to hurt you.
//
// What it IS: detection of the structural fingerprints of the supply-chain
// re-upload pattern, all of which the malicious repo had - days old, almost no
// stars, sharing a name with a far older and more popular project, and carrying
// committed binaries and archives that source repos have no reason to ship.

const RISK_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const RISK_NEW_REPO_DAYS = 30;
const RISK_LOW_STARS = 50;

// Extensions that a source repository rarely has a legitimate reason to commit,
// and which are the usual delivery vehicle for a dropper.
const RISK_FILE_PATTERNS = [
    { re: /\.(exe|msi|scr|bat|cmd|com)$/i, label: 'Windows executable' },
    { re: /\.(dmg|pkg|app)$/i, label: 'macOS installer' },
    { re: /\.(zip|7z|rar|tar\.gz|tgz)$/i, label: 'archive' },
    { re: /\.(pyc|pyd)$/i, label: 'compiled Python bytecode' },
    { re: /\.(dll|so|dylib)$/i, label: 'binary library' },
    { re: /\.(jar|bin)$/i, label: 'binary' }
];

function daysSince(dateString) {
    const then = new Date(dateString).getTime();
    if (!Number.isFinite(then)) return null;
    return Math.floor((Date.now() - then) / 86400000);
}

// Tier 1: costs nothing. Runs on every card from data the listing already has.
function assessBasicRisk(item) {
    const signals = [];
    if (item.platform !== 'github') return signals;

    const age = daysSince(item.created_at);
    const stars = Number(item.stars) || 0;
    const isNew = age !== null && age <= RISK_NEW_REPO_DAYS;
    const isUnproven = stars < RISK_LOW_STARS;

    if (isNew && isUnproven) {
        signals.push({
            severity: 'high',
            title: `Created ${age} day(s) ago with ${stars} star(s)`,
            detail: 'New and unproven is the normal shape of a malicious re-upload. It is also the normal shape of a genuine new project - so this is a reason to read the code, not a verdict.'
        });
    } else if (isNew) {
        signals.push({
            severity: 'medium',
            title: `Created ${age} day(s) ago`,
            detail: 'Recently created repositories have had little time to be reviewed by anyone.'
        });
    } else if (isUnproven) {
        signals.push({
            severity: 'medium',
            title: `Only ${stars} star(s)`,
            detail: 'Few people have publicly vouched for this repository.'
        });
    }

    return signals;
}

function highestSeverity(signals) {
    if (signals.some(s => s.severity === 'high')) return 'high';
    if (signals.some(s => s.severity === 'medium')) return 'medium';
    return signals.length ? 'info' : null;
}

// Tier 2: costs API calls, so it runs only when the user opens the install
// panel - the moment the answer actually matters.
async function runDeepRiskCheck(item) {
    const cacheKey = `risk_${item.platform}_${item.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        if (isCacheValid(parsed, RISK_CACHE_DURATION)) return parsed.result;
    }

    const owner = item.author;
    const name = item.name;
    const signals = [];
    let degraded = null;

    try {
        // 1. Name collision. This is the signal that catches a typosquat: an
        //    older, far more popular repository with the very same name.
        const dupUrl = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(`${name} in:name`)}&sort=stars&order=desc&per_page=5`;
        const dupes = await fetchJson(dupUrl, 'GitHub');
        const rival = (dupes.items || []).find(r =>
            r.name.toLowerCase() === String(name).toLowerCase() &&
            r.owner.login.toLowerCase() !== String(owner).toLowerCase() &&
            r.stargazers_count > Math.max(20, (Number(item.stars) || 0) * 10) &&
            new Date(r.created_at) < new Date(item.created_at)
        );

        if (rival) {
            signals.push({
                severity: 'high',
                title: `Another repo shares this name and is far more established`,
                detail: `${rival.owner.login}/${rival.name} has ${formatNumber(rival.stargazers_count)} stars and is older. Re-uploading a popular project under a new owner is the core of a typosquat attack. Check which one you actually meant.`,
                link: rival.html_url,
                linkLabel: `Open ${rival.owner.login}/${rival.name}`
            });
        }

        // 2. Root file listing. Committed binaries and archives in a source
        //    repository are the usual way a payload gets delivered.
        const contents = await fetchJson(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/`, 'GitHub');
        const flagged = [];
        (Array.isArray(contents) ? contents : []).forEach(entry => {
            const match = RISK_FILE_PATTERNS.find(p => p.re.test(entry.name));
            if (match) flagged.push(`${entry.name} (${match.label})`);
            if (entry.name === '__pycache__') flagged.push('__pycache__ (committed bytecode)');
        });

        if (flagged.length) {
            signals.push({
                severity: 'high',
                title: 'Executables or archives committed to the repository',
                detail: `Found: ${flagged.slice(0, 6).join(', ')}. Source projects rarely commit binaries; droppers usually do. Inspect these before running anything.`
            });
        }

        // 3. A security notice in the repo is worth surfacing loudly, whichever
        //    side of the incident this repo is on.
        const notice = (Array.isArray(contents) ? contents : []).find(e => /^security[-_ ]?notice/i.test(e.name));
        if (notice) {
            signals.push({
                severity: 'high',
                title: `This repository contains ${notice.name}`,
                detail: 'Read it before doing anything else - a maintainer published it for a reason.',
                link: notice.html_url,
                linkLabel: 'Read the notice'
            });
        }
    } catch (error) {
        // Rate limited or offline. Say so rather than implying all-clear.
        degraded = error.message || 'The checks could not be completed.';
    }

    const result = { signals, degraded, checkedAt: Date.now() };
    localStorage.setItem(cacheKey, JSON.stringify({ result, timestamp: Date.now() }));
    return result;
}

// ---------------------------------------------------------------------------
// "Add to my AI" - install recipes
//
// Ground rule, and the reason this file has an `exact` flag: a command that is
// derived purely from the repo URL (a clone, a skill drop into ~/.claude/skills)
// is always correct and is shown plainly. A command that has to guess something
// the repo alone does not tell us - the published package name, the server's
// start command - is marked and paired with a link to the README. Printing a
// confident install line that silently does not work would be the same mistake
// as the fabricated leaderboard this app used to ship.

function repoSlug(item) {
    return String(item.name || 'tool').toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

function repoCloneUrl(item) {
    const url = safeUrl(item.url);
    return url ? `${url}.git` : '';
}

function packageManagerStep(item) {
    const lang = String(item.language || '').toLowerCase();
    const slug = repoSlug(item);

    if (lang === 'python') {
        return { label: 'Install the package', code: `pip install ${slug}`, exact: false,
                 note: 'Assumes the PyPI name matches the repo name - check the README.' };
    }
    if (['javascript', 'typescript'].includes(lang)) {
        return { label: 'Install the package', code: `npm install ${slug}`, exact: false,
                 note: 'Assumes the npm name matches the repo name - check the README.' };
    }
    return null;
}

function cloneStep(item) {
    return { label: 'Clone it', code: `git clone ${repoCloneUrl(item)}`, exact: true };
}

// Returns { tabs: [{ id, label, steps: [...] }] }
function buildInstallRecipe(item, ai) {
    const slug = repoSlug(item);
    const clone = cloneStep(item);
    const pkg = packageManagerStep(item);

    if (ai.type === 'mcp') {
        return { tabs: [
            { id: 'claude', label: 'Claude Code', steps: [
                clone,
                { label: 'Register the server', code: `claude mcp add ${slug} -- <start command from the README>`,
                  exact: false,
                  note: 'Every MCP server starts differently (npx, uvx, node, python). Copy the exact run command out of the README and drop it in place of the placeholder.' }
            ]},
            { id: 'cursor', label: 'Cursor / VS Code', steps: [
                clone,
                { label: 'Add to your MCP config', exact: false,
                  code: `{\n  "mcpServers": {\n    "${slug}": {\n      "command": "<command from the README>",\n      "args": []\n    }\n  }\n}`,
                  note: 'Goes in .cursor/mcp.json (Cursor) or your editor\'s MCP settings. Fill in the command from the README.' }
            ]},
            { id: 'generic', label: 'Anything else', steps: [
                clone,
                { label: 'Follow the setup docs', code: `open ${safeUrl(item.url)}#readme`, exact: true,
                  note: 'MCP works the same everywhere: run the server, point your client at it.' }
            ]}
        ]};
    }

    if (ai.type === 'skill') {
        return { tabs: [
            { id: 'claude', label: 'Claude Code', steps: [
                { label: 'Drop it into your skills folder',
                  code: `git clone ${repoCloneUrl(item)} ~/.claude/skills/${slug}`, exact: true,
                  note: 'Skills are just folders. Restart Claude Code and it will be picked up.' }
            ]},
            { id: 'cursor', label: 'Cursor / VS Code', steps: [
                clone,
                { label: 'Adapt the instructions', code: `open ${safeUrl(item.url)}#readme`, exact: true,
                  note: 'Skills are a Claude convention. In other tools, paste the skill\'s instructions into your rules or system prompt.' }
            ]},
            { id: 'generic', label: 'Anything else', steps: [clone] }
        ]};
    }

    // Agent frameworks and general LLM tooling install like normal libraries.
    const libSteps = pkg ? [pkg, clone] : [clone];
    return { tabs: [
        { id: 'claude', label: 'Claude Code', steps: libSteps.concat([
            { label: 'Point Claude at it', code: `claude "read the README in ./${slug} and set it up for me"`,
              exact: false, note: 'Once it is on disk, let the agent do the wiring.' }
        ])},
        { id: 'cursor', label: 'Cursor / VS Code', steps: libSteps },
        { id: 'generic', label: 'Anything else', steps: [clone,
            { label: 'Read the setup docs', code: `open ${safeUrl(item.url)}#readme`, exact: true }]}
    ]};
}

// ---------------------------------------------------------------------------
// "Add to my AI" - the stack

let aiStack = JSON.parse(localStorage.getItem('aiStack') || '{}');

function aiStackKey(item) {
    return `${item.platform}_${item.id}`;
}

function inAiStack(item) {
    return aiStack[aiStackKey(item)] !== undefined;
}

function saveAiStack() {
    localStorage.setItem('aiStack', JSON.stringify(aiStack));
    updateAiStackCount();
}

function addToAiStack(item, ai) {
    const key = aiStackKey(item);
    if (aiStack[key]) return false;
    aiStack[key] = { ...item, aiType: ai.type, aiLabel: ai.label, status: 'want-to-try', addedAt: Date.now() };
    saveAiStack();
    return true;
}

function removeFromAiStack(item) {
    delete aiStack[aiStackKey(item)];
    saveAiStack();
}

function setAiStackStatus(item, status) {
    const entry = aiStack[aiStackKey(item)];
    if (entry) {
        entry.status = status;
        saveAiStack();
    }
}

function updateAiStackCount() {
    const el = document.getElementById('aiStackCount');
    if (el) el.textContent = Object.keys(aiStack).length;
}

// ---------------------------------------------------------------------------
// "Add to my AI" - modal

let modalItem = null;
let modalAi = null;
let modalTab = 'claude';
let modalRisk = null;        // { signals, degraded } once the deep check returns
let modalRiskLoading = false;
let modalStepsRevealed = false;

function renderInstallSteps(steps) {
    return steps.map((step, i) => `
        <div class="install-step">
            <div class="install-step-head">
                <span class="install-step-num">${i + 1}</span>
                <span class="install-step-label">${escapeHtml(step.label)}</span>
                ${step.exact ? '' : '<span class="install-flag" title="This line contains a guess - confirm it against the repo README">needs a look</span>'}
            </div>
            <pre class="install-code"><code>${escapeHtml(step.code)}</code></pre>
            <button class="copy-btn" data-copy="${escapeHtml(step.code)}">Copy</button>
            ${step.note ? `<p class="install-note">${escapeHtml(step.note)}</p>` : ''}
        </div>
    `).join('');
}

function renderRiskSignal(sig) {
    return `
        <li class="risk-signal ${escapeHtml(sig.severity)}">
            <div class="risk-signal-title">${escapeHtml(sig.title)}</div>
            <div class="risk-signal-detail">${escapeHtml(sig.detail)}</div>
            ${sig.link ? `<a class="risk-signal-link" href="${escapeHtml(safeUrl(sig.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(sig.linkLabel || 'Open')} →</a>` : ''}
        </li>
    `;
}

function renderRiskPanel(basicSignals) {
    const deep = modalRisk ? modalRisk.signals : [];
    const all = basicSignals.concat(deep);
    const level = highestSeverity(all);

    const body = modalRiskLoading
        ? '<div class="risk-loading">Running checks…</div>'
        : `
            ${all.length ? `<ul class="risk-list">${all.map(renderRiskSignal).join('')}</ul>` : ''}
            ${!all.length ? `
                <p class="risk-none">
                    No automated signals found. <strong>That is not a safety verdict.</strong>
                    These checks look at repository age, popularity, name collisions and
                    committed binaries — they cannot read the code or tell you what it does
                    once it runs.
                </p>
            ` : ''}
            ${modalRisk && modalRisk.degraded ? `
                <p class="risk-degraded">⚠ The deeper checks did not complete: ${escapeHtml(modalRisk.degraded)}
                Treat this panel as incomplete.</p>
            ` : ''}
        `;

    return `
        <div class="risk-panel ${level ? escapeHtml(level) : 'clear'}">
            <div class="risk-panel-head">
                <span class="risk-panel-icon">${level === 'high' ? '⛔' : level === 'medium' ? '⚠' : '🔍'}</span>
                <h3>${level === 'high' ? 'Serious risk signals' : level === 'medium' ? 'Worth a look first' : 'Safety checks'}</h3>
            </div>
            ${body}
            <p class="risk-always">
                Whatever this panel says, installing a skill, MCP server or agent means
                running someone else's code with your permissions. Read the source, and
                prefer the original project over a re-upload.
            </p>
        </div>
    `;
}

function renderAiModal() {
    const overlay = document.getElementById('aiModal');
    if (!modalItem || !modalAi) {
        overlay.classList.remove('open');
        overlay.innerHTML = '';
        return;
    }

    const recipe = buildInstallRecipe(modalItem, modalAi);
    const tab = recipe.tabs.find(t => t.id === modalTab) || recipe.tabs[0];
    const inStack = inAiStack(modalItem);
    const entry = aiStack[aiStackKey(modalItem)];

    const basicSignals = assessBasicRisk(modalItem);
    const allSignals = basicSignals.concat(modalRisk ? modalRisk.signals : []);
    const riskLevel = highestSeverity(allSignals);
    // Serious signals put the commands behind one deliberate click. Not a
    // block - you own the machine - but the copy button should not be the
    // first thing your hand reaches for.
    const gateSteps = riskLevel === 'high' && !modalStepsRevealed;

    overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Add to my AI">
            <button class="modal-close" id="modalClose" aria-label="Close">✕</button>

            <div class="modal-head">
                <span class="ai-badge ${escapeHtml(modalAi.type)}">${modalAi.icon} ${escapeHtml(modalAi.label)}</span>
                <h2>${escapeHtml(modalItem.name)}</h2>
                <div class="modal-author">by ${escapeHtml(modalItem.author)}</div>
                <p class="modal-desc">${escapeHtml(modalItem.description) || 'No description available'}</p>
            </div>

            <div class="modal-stack-row">
                ${inStack
                    ? `<span class="stack-state">In your AI stack — ${escapeHtml(entry.status === 'installed' ? 'installed' : 'want to try')}</span>
                       <button class="toolbar-button" id="modalToggleStatus">${entry.status === 'installed' ? '↩ Mark as want to try' : '✓ Mark as installed'}</button>
                       <button class="toolbar-button" id="modalRemove">Remove</button>`
                    : `<button class="toolbar-button primary" id="modalAdd">+ Add to my AI</button>`}
            </div>

            ${renderRiskPanel(basicSignals)}

            ${gateSteps ? `
                <div class="steps-gate">
                    <p>Install steps are hidden because of the signals above.</p>
                    <button class="toolbar-button" id="revealSteps">Show install steps anyway</button>
                </div>
            ` : `
                <div class="modal-tabs">
                    ${recipe.tabs.map(t => `
                        <button class="modal-tab ${t.id === tab.id ? 'active' : ''}" data-tab="${escapeHtml(t.id)}">
                            ${escapeHtml(t.label)}
                        </button>
                    `).join('')}
                </div>

                <div class="modal-body">
                    ${renderInstallSteps(tab.steps)}
                </div>
            `}

            <p class="modal-footnote">
                Commands marked <em>needs a look</em> contain something this app had to guess —
                a package name or a start command. Confirm them against the
                <a href="${escapeHtml(safeUrl(modalItem.url))}#readme" target="_blank" rel="noopener noreferrer">repo README</a>.
            </p>
        </div>
    `;
    overlay.classList.add('open');
    wireAiModal();
}

async function openAiModal(item, ai) {
    modalItem = item;
    modalAi = ai;
    modalTab = 'claude';
    modalRisk = null;
    modalStepsRevealed = false;
    modalRiskLoading = true;
    renderAiModal();

    const result = await runDeepRiskCheck(item);

    // The user may have closed the panel or opened another repo while the
    // checks were in flight - never paint stale results over a new repo.
    if (modalItem !== item) return;

    modalRisk = result;
    modalRiskLoading = false;
    renderAiModal();
}

function closeAiModal() {
    modalItem = null;
    modalAi = null;
    renderAiModal();
}

function wireAiModal() {
    const overlay = document.getElementById('aiModal');

    document.getElementById('modalClose').addEventListener('click', closeAiModal);

    overlay.querySelectorAll('.modal-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            modalTab = btn.dataset.tab;
            renderAiModal();
        });
    });

    overlay.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.copy;
            try {
                await navigator.clipboard.writeText(text);
                btn.textContent = 'Copied';
            } catch (error) {
                // Clipboard access can be denied (insecure context, permissions).
                // Select the text instead so the user can copy it by hand.
                const code = btn.previousElementSibling;
                const range = document.createRange();
                range.selectNodeContents(code);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                btn.textContent = 'Select + copy';
            }
            setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
        });
    });

    const revealBtn = document.getElementById('revealSteps');
    if (revealBtn) {
        revealBtn.addEventListener('click', () => {
            modalStepsRevealed = true;
            renderAiModal();
        });
    }

    const addBtn = document.getElementById('modalAdd');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            addToAiStack(modalItem, modalAi);
            renderAiModal();
            renderItems(filteredItems);
        });
    }

    const toggleBtn = document.getElementById('modalToggleStatus');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const entry = aiStack[aiStackKey(modalItem)];
            setAiStackStatus(modalItem, entry.status === 'installed' ? 'want-to-try' : 'installed');
            renderAiModal();
        });
    }

    const removeBtn = document.getElementById('modalRemove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            removeFromAiStack(modalItem);
            renderAiModal();
            renderItems(filteredItems);
        });
    }
}

// API Functions - GitHub
async function fetchGitHubRepos() {
    try {
        const dateFrom = document.getElementById('dateFrom').value || getDefaultDateFrom();
        const dateTo = document.getElementById('dateTo').value || getDefaultDateTo();

        const cacheKey = getCacheKey('github', { dateFrom: dateFrom, dateTo: dateTo });
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            const cachedData = JSON.parse(cached);
            if (isCacheValid(cachedData)) {
                console.log('Using cached GitHub data');
                return cachedData.items;
            }
        }

        const query = `created:${dateFrom}..${dateTo}`;
        const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`;

        const data = await fetchJson(url, 'GitHub');
        const items = (data.items || []).map(repo => ({
            id: repo.id,
            name: repo.name,
            author: repo.owner.login,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            watchers: repo.watchers_count,
            issues: repo.open_issues_count,
            language: repo.language,
            topics: repo.topics || [],
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            platform: 'github'
        }));

        localStorage.setItem(cacheKey, JSON.stringify({ items, timestamp: Date.now() }));
        return items;
    } catch (error) {
        console.error('Error fetching GitHub repos:', error);
        throw error;
    }
}

// API Functions - HuggingFace
async function fetchHuggingFaceModels() {
    try {
        const cacheKey = getCacheKey('huggingface');
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            const cachedData = JSON.parse(cached);
            if (isCacheValid(cachedData)) {
                console.log('Using cached HuggingFace data');
                return cachedData.items;
            }
        }

        // HuggingFace trending models endpoint
        const url = `${HUGGINGFACE_API}/models?sort=trending&limit=30`;
        const data = await fetchJson(url, 'HuggingFace');
        const items = data.map(model => ({
            id: model.id || model.modelId,
            name: model.modelId || model.id,
            author: model.author || 'Unknown',
            description: model.description || model.cardData?.description || 'No description available',
            url: `https://huggingface.co/${model.modelId || model.id}`,
            stars: model.likes || 0,
            downloads: model.downloads || 0,
            language: model.pipeline_tag || 'N/A',
            topics: model.tags || [],
            created_at: model.createdAt || model.created_at,
            updated_at: model.lastModified || model.updated_at,
            platform: 'huggingface',
            category: model.pipeline_tag
        }));

        localStorage.setItem(cacheKey, JSON.stringify({ items, timestamp: Date.now() }));
        return items;
    } catch (error) {
        console.error('Error fetching HuggingFace models:', error);
        throw error;
    }
}

// Global Search
//
// The search box filters whatever is currently loaded. These functions
// do the other thing people expect: query the platform itself, so you
// can find any repo or model, not only the ones already on screen.
async function searchGitHubRepos(query) {
    const cacheKey = getCacheKey('github_search', { q: query });
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        const cachedData = JSON.parse(cached);
        if (isCacheValid(cachedData, SEARCH_CACHE_DURATION)) {
            console.log('Using cached GitHub search results');
            return cachedData.items;
        }
    }

    const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`;
    const data = await fetchJson(url, 'GitHub');

    const items = (data.items || []).map(repo => ({
        id: repo.id,
        name: repo.name,
        author: repo.owner.login,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.watchers_count,
        issues: repo.open_issues_count,
        language: repo.language,
        topics: repo.topics || [],
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        platform: 'github'
    }));

    localStorage.setItem(cacheKey, JSON.stringify({ items, timestamp: Date.now() }));
    return items;
}

async function searchHuggingFaceModels(query) {
    const cacheKey = getCacheKey('huggingface_search', { q: query });
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        const cachedData = JSON.parse(cached);
        if (isCacheValid(cachedData, SEARCH_CACHE_DURATION)) {
            console.log('Using cached HuggingFace search results');
            return cachedData.items;
        }
    }

    const url = `${HUGGINGFACE_API}/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=30`;
    const data = await fetchJson(url, 'HuggingFace');

    const items = data.map(model => ({
        id: model.id || model.modelId,
        name: model.modelId || model.id,
        author: model.author || (model.modelId || model.id || '').split('/')[0] || 'Unknown',
        description: model.description || model.cardData?.description || 'No description available',
        url: `https://huggingface.co/${model.modelId || model.id}`,
        stars: model.likes || 0,
        downloads: model.downloads || 0,
        language: model.pipeline_tag || 'N/A',
        topics: model.tags || [],
        created_at: model.createdAt || model.created_at,
        updated_at: model.lastModified || model.updated_at,
        platform: 'huggingface',
        category: model.pipeline_tag
    }));

    localStorage.setItem(cacheKey, JSON.stringify({ items, timestamp: Date.now() }));
    return items;
}

function renderSearchScopeBanner() {
    const banner = document.getElementById('searchScopeBanner');

    if (!searchMode) {
        // Browsing GitHub means "repos created in this window, ranked by
        // stars" - which is not the same as trending. Say so plainly
        // rather than letting the UI imply otherwise.
        if (currentPlatform === 'github') {
            const from = document.getElementById('dateFrom').value;
            const to = document.getElementById('dateTo').value;
            banner.innerHTML = `
                <div class="search-scope-banner">
                    <div class="scope-text">
                        🔭 Browsing repositories <strong>created</strong> between
                        <span class="scope-query">${escapeHtml(from)}</span> and
                        <span class="scope-query">${escapeHtml(to)}</span>, ranked by stars.
                        Looking for a specific repo? Type it above and press Enter.
                    </div>
                </div>
            `;
        } else {
            banner.innerHTML = '';
        }
        return;
    }

    const platformLabel = searchMode.platform === 'huggingface' ? 'HuggingFace' : 'GitHub';
    banner.innerHTML = `
        <div class="search-scope-banner">
            <div class="scope-text">
                🔍 Searching all of ${platformLabel} for
                <span class="scope-query">"${escapeHtml(searchMode.query)}"</span>
                — date range and browse filters don't apply here.
            </div>
            <button class="toolbar-button" id="clearSearchBtn">✕ Back to browse</button>
        </div>
    `;

    document.getElementById('clearSearchBtn').addEventListener('click', exitSearchMode);
}

async function runGlobalSearch() {
    const query = document.getElementById('searchInput').value.trim();

    if (!query) {
        exitSearchMode();
        return;
    }

    if (currentPlatform === 'llmarena') {
        renderLLMArenaNotice();
        return;
    }

    searchMode = { platform: currentPlatform, query };
    renderSearchScopeBanner();
    document.getElementById('contentContainer').innerHTML =
        '<div class="loading">Searching ' + escapeHtml(query) + '</div>';

    try {
        allItems = currentPlatform === 'huggingface'
            ? await searchHuggingFaceModels(query)
            : await searchGitHubRepos(query);

        populateLanguageFilter();

        // The search term already selected these results upstream, so
        // re-filtering by the same text client-side would only hide
        // matches that live in fields the API searched and we don't.
        filteredItems = allItems;
        applyFiltersAndSort({ skipTextFilter: true });
    } catch (error) {
        renderError(error);
    }
}

function exitSearchMode() {
    if (!searchMode) return;
    searchMode = null;
    document.getElementById('searchInput').value = '';
    renderSearchScopeBanner();
    switchPlatform(currentPlatform);
}

// LLM Arena
//
// This tab previously shipped hardcoded placeholder ELO scores that were
// presented as real leaderboard standings. Publishing invented benchmark
// numbers under a real leaderboard's name is worse than publishing
// nothing, so the fake data has been removed. Until a real data source is
// wired up, the tab links to the live leaderboard instead.
const LLM_ARENA_URL = 'https://lmarena.ai/leaderboard';

function renderLLMArenaNotice() {
    document.getElementById('searchScopeBanner').innerHTML = '';
    document.getElementById('resultsCount').textContent = '0';
    document.getElementById('contentContainer').innerHTML = `
        <div class="notice-panel">
            <div class="notice-icon">\u{1F3C6}</div>
            <h2>LLM Arena \u2014 not connected yet</h2>
            <p>
                Live ELO standings aren't wired into this app yet. Rather than show
                placeholder numbers that look real, this tab points you at the source.
            </p>
            <a class="notice-link" href="${LLM_ARENA_URL}" target="_blank" rel="noopener noreferrer">
                Open the live LMArena leaderboard \u2192
            </a>
            <p class="notice-footnote">
                Fetching real standings needs a small server-side proxy (the public
                leaderboard has no browser-accessible API). It's on the roadmap.
            </p>
        </div>
    `;
}

// Date helpers
function getDefaultDateFrom() {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
}

function getDefaultDateTo() {
    return new Date().toISOString().split('T')[0];
}

// Render Functions
function renderItems(items) {
    const container = document.getElementById('contentContainer');

    if (!items || items.length === 0) {
        document.getElementById('resultsCount').textContent = '0';
        container.innerHTML = searchMode
            ? `<div class="error-message">No ${escapeHtml(searchMode.platform === 'huggingface' ? 'HuggingFace' : 'GitHub')} results for "${escapeHtml(searchMode.query)}".</div>`
            : '<div class="error-message">No items match your filters.</div>';
        return;
    }

    document.getElementById('resultsCount').textContent = items.length;

    const viewClass = `repo-${currentView}`;
    let html = `<div class="${viewClass}">`;

    items.forEach((item, index) => {
        html += renderCard(item, index);
    });

    html += '</div>';
    container.innerHTML = html;

    // Update last update timestamp
    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Card click handlers - the URL lives in a data attribute and has
    // already been validated by safeUrl(), so nothing executable can
    // reach the DOM from an API response.
    container.querySelectorAll('.repo-card').forEach(card => {
        const url = card.dataset.url;
        if (!url) return;
        card.addEventListener('click', () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    });

    // "Add to my AI" buttons - stopPropagation so the card does not also
    // open the repo in a new tab underneath the modal.
    container.querySelectorAll('.add-to-ai-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = items.find(i => String(i.id) === btn.dataset.aiId);
            if (!item) return;
            const ai = detectAiType(item);
            if (ai) openAiModal(item, ai);
        });
    });

    // Add bookmark click handlers
    container.querySelectorAll('.bookmark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.dataset.itemId;
            const item = items.find(i => String(i.id) === itemId);
            if (item) {
                // Use the item's own platform, not the active tab - the
                // bookmarks view mixes items from several platforms.
                toggleBookmark(item, item.platform || currentPlatform);
                btn.classList.toggle('bookmarked');
                btn.textContent = btn.classList.contains('bookmarked') ? '⭐' : '☆';
            }
        });
    });
}

function renderCard(item, index) {
    const bookmarked = isBookmarked(item.id, item.platform);
    const url = safeUrl(item.url);
    const ai = detectAiType(item);
    const inStack = ai && inAiStack(item);
    // Risk signals are shown on every GitHub card, not only AI ones - the
    // warning is about the repo, not about what you plan to do with it.
    const riskSignals = assessBasicRisk(item);
    const riskLevel = highestSeverity(riskSignals);

    return `
        <div class="repo-card" data-url="${escapeHtml(url)}">
            <div class="bookmark-btn ${bookmarked ? 'bookmarked' : ''}" data-item-id="${escapeHtml(item.id)}">
                ${bookmarked ? '⭐' : '☆'}
            </div>
            <div class="repo-rank">${index + 1}</div>

            <div class="platform-badge ${escapeHtml(item.platform)}">${escapeHtml(item.platform)}</div>
            ${ai ? `<div class="ai-badge ${escapeHtml(ai.type)}">${ai.icon} ${escapeHtml(ai.label)}</div>` : ''}
            ${riskLevel ? `<div class="risk-chip ${escapeHtml(riskLevel)}" title="${escapeHtml(riskSignals.map(sig => sig.title).join(' · '))}">⚠ ${riskLevel === 'high' ? 'Check before installing' : 'Unproven'}</div>` : ''}

            <h3 class="repo-name">${escapeHtml(item.name)}</h3>
            <div class="repo-author">by ${escapeHtml(item.author)}</div>
            <p class="repo-description">${escapeHtml(item.description) || 'No description available'}</p>

            ${item.platform === 'github' || item.platform === 'huggingface' ? `
                <div class="repo-meta">
                    <div class="repo-meta-item" title="Created ${new Date(item.created_at).toLocaleDateString()}">
                        📅 ${formatRelativeTime(item.created_at)}
                    </div>
                    <div class="repo-meta-item" title="Last updated ${new Date(item.updated_at).toLocaleDateString()}">
                        🔄 ${formatRelativeTime(item.updated_at)}
                    </div>
                    ${item.issues > 0 ? `
                        <div class="repo-meta-item">
                            🔧 ${formatNumber(item.issues)} issues
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <div class="repo-stats">
                ${item.stars !== undefined ? `
                    <div class="stat">
                        <span class="stat-icon">★</span>
                        <span>${formatNumber(item.stars)}</span>
                    </div>
                ` : ''}
                ${item.forks !== undefined ? `
                    <div class="stat">
                        <span class="stat-icon">⑂</span>
                        <span>${formatNumber(item.forks)}</span>
                    </div>
                ` : ''}
                ${item.downloads !== undefined ? `
                    <div class="stat">
                        <span class="stat-icon">⬇</span>
                        <span>${formatNumber(item.downloads)}</span>
                    </div>
                ` : ''}
                ${item.elo !== undefined ? `
                    <div class="stat">
                        <span class="stat-icon">🏆</span>
                        <span>ELO: ${item.elo}</span>
                    </div>
                ` : ''}
                ${item.votes !== undefined ? `
                    <div class="stat">
                        <span class="stat-icon">🗳️</span>
                        <span>${formatNumber(item.votes)} votes</span>
                    </div>
                ` : ''}
            </div>

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                ${item.language ? `<div class="repo-language">${escapeHtml(item.language)}</div>` : ''}
                ${item.topics && item.topics.length > 0 ? `
                    <div class="repo-topics">
                        ${item.topics.slice(0, 3).map(topic =>
                            `<span class="topic-tag">${escapeHtml(topic)}</span>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>

            ${ai ? `
                <button class="add-to-ai-btn ${inStack ? 'added' : ''} ${riskLevel === 'high' ? 'risky' : ''}" data-ai-id="${escapeHtml(item.id)}">
                    ${inStack ? '✓ In your AI stack' : (riskLevel === 'high' ? '⚠ Review, then add to my AI' : '+ Add to my AI')}
                </button>
            ` : ''}
        </div>
    `;
}

// Filter and Sort
function populateLanguageFilter() {
    const languages = [...new Set(allItems.map(item => item.language).filter(Boolean))].sort();
    const select = document.getElementById('languageFilter');

    select.innerHTML = '';
    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        select.appendChild(option);
    });
}

function applyFiltersAndSort({ skipTextFilter = false } = {}) {
    const searchTerm = skipTextFilter ? '' : document.getElementById('searchInput').value.toLowerCase();
    const selectedLanguages = Array.from(document.getElementById('languageFilter').selectedOptions).map(opt => opt.value);
    const selectedCategory = document.getElementById('categoryFilter').value;
    const sortBy = document.getElementById('sortBy').value;

    // Filter items
    filteredItems = allItems.filter(item => {
        const matchesSearch = !searchTerm ||
            item.name.toLowerCase().includes(searchTerm) ||
            (item.description && item.description.toLowerCase().includes(searchTerm)) ||
            item.author.toLowerCase().includes(searchTerm);

        const matchesLanguage = selectedLanguages.length === 0 || selectedLanguages.includes(item.language);
        const matchesCategory = !selectedCategory || item.category === selectedCategory;

        return matchesSearch && matchesLanguage && matchesCategory;
    });

    // Sort items
    filteredItems.sort((a, b) => {
        switch (sortBy) {
            case 'stars':
                return (b.stars || b.elo || 0) - (a.stars || a.elo || 0);
            case 'forks':
                return (b.forks || 0) - (a.forks || 0);
            case 'updated':
                return new Date(b.updated_at) - new Date(a.updated_at);
            case 'created':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'issues':
                return (b.issues || 0) - (a.issues || 0);
            default:
                return 0;
        }
    });

    renderItems(filteredItems);
}

// Platform Switching
function renderError(error) {
    document.getElementById('contentContainer').innerHTML = `
        <div class="error-message">
            <strong>Unable to load data</strong><br>
            ${escapeHtml(error && error.message ? error.message : 'Please try again later.')}
        </div>
    `;
}

async function switchPlatform(platform) {
    const platformChanged = platform !== currentPlatform;
    currentPlatform = platform;

    // Switching platforms leaves search results behind.
    if (platformChanged && searchMode) {
        searchMode = null;
        document.getElementById('searchInput').value = '';
        renderSearchScopeBanner();
    }

    // Update active tab
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.platform === platform);
    });

    // Show/hide relevant filters
    document.querySelector('.search-group').style.display = 'flex';
    document.getElementById('sortGroup').style.display = 'flex';
    document.getElementById('languageGroup').style.display = 'flex';

    if (platform === 'huggingface') {
        document.getElementById('categoryGroup').style.display = 'flex';
        document.getElementById('dateRangeGroup').style.display = 'none';
        document.getElementById('dateToGroup').style.display = 'none';
    } else if (platform === 'llmarena') {
        document.getElementById('categoryGroup').style.display = 'none';
        document.getElementById('dateRangeGroup').style.display = 'none';
        document.getElementById('dateToGroup').style.display = 'none';
        document.getElementById('languageGroup').style.display = 'none';
        // Nothing to search or sort while the tab has no data source.
        document.querySelector('.search-group').style.display = 'none';
        document.getElementById('sortGroup').style.display = 'none';
    } else {
        document.getElementById('categoryGroup').style.display = 'none';
        document.getElementById('dateRangeGroup').style.display = 'flex';
        document.getElementById('dateToGroup').style.display = 'flex';
    }

    // LLM Arena has no live data source yet - show the notice instead
    // of pretending to load something.
    if (platform === 'llmarena') {
        allItems = [];
        filteredItems = [];
        renderLLMArenaNotice();
        return;
    }

    // Show loading
    document.getElementById('contentContainer').innerHTML = '<div class="loading">Loading discoveries</div>';

    try {
        // Fetch data based on platform
        if (platform === 'github') {
            allItems = await fetchGitHubRepos();
        } else if (platform === 'huggingface') {
            allItems = await fetchHuggingFaceModels();
        }

        filteredItems = allItems;
        populateLanguageFilter();
        renderSearchScopeBanner();
        applyFiltersAndSort();
    } catch (error) {
        renderError(error);
    }
}

// View Mode Switching
function switchView(view) {
    currentView = view;
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    renderItems(filteredItems);
}

// Event Listeners
function setupEventListeners() {
    // Platform tabs
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.addEventListener('click', () => switchPlatform(tab.dataset.platform));
    });

    // View mode buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Search: typing filters the loaded results; Enter (or the button)
    // searches the whole platform. While viewing search results the box
    // holds the query, so typing alone must not re-filter them.
    document.getElementById('searchInput').addEventListener('input', () => {
        if (searchMode) return;
        applyFiltersAndSort();
    });

    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            runGlobalSearch();
        }
    });

    document.getElementById('globalSearchBtn').addEventListener('click', runGlobalSearch);

    // Filters
    document.getElementById('languageFilter').addEventListener('change', applyFiltersAndSort);
    document.getElementById('categoryFilter').addEventListener('change', applyFiltersAndSort);
    document.getElementById('sortBy').addEventListener('change', applyFiltersAndSort);
    ['dateFrom', 'dateTo'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            // Date range only applies to browsing, so changing it exits search.
            if (searchMode) {
                searchMode = null;
                document.getElementById('searchInput').value = '';
                renderSearchScopeBanner();
            }
            switchPlatform(currentPlatform);
        });
    });

    // Bookmarks button
    document.getElementById('bookmarksBtn').addEventListener('click', () => {
        if (Object.keys(bookmarks).length === 0) {
            alert('No bookmarks yet! Click the ☆ icon on any item to bookmark it.');
            return;
        }

        // Viewing bookmarks is its own scope - drop any active search.
        searchMode = null;
        document.getElementById('searchInput').value = '';
        renderSearchScopeBanner();

        const bookmarkedItems = Object.values(bookmarks);
        allItems = bookmarkedItems;
        filteredItems = bookmarkedItems;
        populateLanguageFilter();
        applyFiltersAndSort();
    });

    // My AI Stack view
    document.getElementById('aiStackBtn').addEventListener('click', () => {
        const entries = Object.values(aiStack);
        if (entries.length === 0) {
            alert('Your AI stack is empty. Look for the "+ Add to my AI" button on agent, skill and MCP repos.');
            return;
        }

        searchMode = null;
        document.getElementById('searchInput').value = '';
        renderSearchScopeBanner();

        // Newest first - the thing you just added is the thing you want to see.
        const sorted = entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        allItems = sorted;
        filteredItems = sorted;
        populateLanguageFilter();
        applyFiltersAndSort({ skipTextFilter: true });
    });

    // Modal dismissal
    document.getElementById('aiModal').addEventListener('click', (e) => {
        // Only a click on the backdrop itself closes it, not one inside the card.
        if (e.target.id === 'aiModal') closeAiModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAiModal();
    });

    // Bookmark backup
    document.getElementById('exportBtn').addEventListener('click', exportBookmarks);

    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importInput').click();
    });

    document.getElementById('importInput').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importBookmarks(file);
        // Reset so re-picking the same file fires the event again.
        e.target.value = '';
    });

    // Browse button - leaves bookmarks/search results and reloads the
    // current platform's normal listing.
    document.getElementById('browseBtn').addEventListener('click', () => {
        searchMode = null;
        document.getElementById('searchInput').value = '';
        renderSearchScopeBanner();
        switchPlatform(currentPlatform);
    });
}

// Initialize
async function init() {
    // Set default dates
    document.getElementById('dateFrom').value = getDefaultDateFrom();
    document.getElementById('dateTo').value = getDefaultDateTo();

    updateBookmarkCount();
    updateAiStackCount();
    setupEventListeners();

    // Load GitHub by default
    await switchPlatform('github');
}

// Run on page load
init();
