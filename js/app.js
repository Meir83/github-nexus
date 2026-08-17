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
    if (count === 0) {
        alert('No bookmarks to export yet. Click the ☆ icon on any item first.');
        return;
    }

    const payload = {
        app: 'ai-discovery-hub',
        version: BOOKMARK_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        count,
        bookmarks
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
    const incoming = parsed && parsed.bookmarks ? parsed.bookmarks : parsed;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        throw new Error('This file does not look like a bookmarks export.');
    }

    // Keep only entries that actually describe an item, so a malformed file
    // cannot poison the bookmark store with junk that breaks rendering.
    const valid = {};
    Object.entries(incoming).forEach(([key, item]) => {
        if (item && typeof item === 'object' && item.id !== undefined && item.name) {
            valid[key] = item;
        }
    });

    if (Object.keys(valid).length === 0) {
        throw new Error('No valid bookmarks found in that file.');
    }

    return valid;
}

async function importBookmarks(file) {
    try {
        const incoming = parseBookmarkFile(await file.text());

        const before = Object.keys(bookmarks).length;
        // Merge rather than replace - importing on a device that already has
        // bookmarks should never silently delete them.
        bookmarks = { ...bookmarks, ...incoming };
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));

        const added = Object.keys(bookmarks).length - before;
        updateBookmarkCount();
        renderItems(filteredItems);

        alert(`Imported ${Object.keys(incoming).length} bookmark(s): ${added} new, ` +
              `${Object.keys(incoming).length - added} already saved.`);
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

    return `
        <div class="repo-card" data-url="${escapeHtml(url)}">
            <div class="bookmark-btn ${bookmarked ? 'bookmarked' : ''}" data-item-id="${escapeHtml(item.id)}">
                ${bookmarked ? '⭐' : '☆'}
            </div>
            <div class="repo-rank">${index + 1}</div>

            <div class="platform-badge ${escapeHtml(item.platform)}">${escapeHtml(item.platform)}</div>

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
    setupEventListeners();

    // Load GitHub by default
    await switchPlatform('github');
}

// Run on page load
init();
