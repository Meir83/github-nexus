# Changelog

All notable changes to AI Discovery Hub (formerly GitHub Nexus) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.1] - 2026-08-18

### Fixed

- **The HuggingFace tab returned HTTP 400 and rendered nothing.** The listing
  asked for `sort=trending`, which is not a valid value: the endpoint sorts by
  properties of `ModelInfo` - `downloads`, `likes`, `lastModified`, `createdAt`,
  `trendingScore` - and there is no `trending` field. The search path was
  unaffected because it already used `sort=downloads`, which is why only
  browsing broke.

  Rather than swap one hardcoded parameter for another, the listing now tries
  `trendingScore`, then `likes`, then `downloads`, falling through only on a
  400/422 - a rejected query is the one case where a different query might
  work. A rate limit or an outage is rethrown immediately instead of burning the
  remaining quota on requests that were never going to succeed. If every
  candidate is rejected the tab says the API has changed rather than showing an
  empty list.

- `fetchJson` now attaches the HTTP status to the errors it throws, so callers
  can tell a bad request apart from an outage.

### Tests

- 8 further checks (82 total) covering the preferred sort being tried first and
  alone, the fallback rendering after a 400, the honest failure when every
  candidate is rejected, and a rate limit not being retried across candidates.

## [2.4.0] - 2026-08-17

### Added

- **Risk signals on repositories.** Prompted by a real incident: a user browsing
  this app found a skill, asked an agent to install it, and it turned out to be a
  typosquatted re-upload that disabled TLS verification and exfiltrated
  cryptocurrency wallet data. v2.3.0 put an install button next to arbitrary
  GitHub repos with no risk information at all; this closes that gap.
  - **On every GitHub card**, from data the listing already returns: repository
    age and star count, shown as a warning chip. No extra API calls.
  - **In the install panel**, when it actually matters: a name-collision check
    that finds an older, far more popular repository with the same name (the
    defining fingerprint of a typosquat) and links to it, plus a root file
    listing that flags committed executables, installers, archives and Python
    bytecode, plus any `SECURITY-NOTICE.md` in the repo. Cached for an hour.
  - **Serious signals hide the install commands** behind an explicit
    "Show install steps anyway" click. Not a block - it is the user's machine -
    but the copy button should not be the first thing within reach.
  - A standing reminder that installing a skill, MCP server or agent means
    running someone else's code, shown regardless of what the checks find.

### Notes on what this deliberately does not do

- **It never declares a repository safe.** With no signals the panel reports
  "No automated signals found - that is not a safety verdict" and explains what
  the checks cannot see. A static page cannot read a repo's code, spot
  obfuscation, or know what a remote endpoint does with your data. A green
  "safe" badge would be worse than no check at all: it would launder precisely
  the repository trying to do harm.
- **Degradation is explicit.** If the checks are rate-limited or fail, the panel
  says they did not complete and marks itself incomplete, rather than showing an
  empty list that reads as all-clear.

### Tests

- 18 further checks (74 total), built on a fixture modelled directly on the real
  attack: a four-day-old, three-star re-upload sharing its name with an older
  4.2k-star project and shipping a committed `.zip` and `__pycache__`. Assertions
  cover every signal firing, the established repo staying unflagged, the steps
  being gated, the wording never claiming safety, and honest degradation under
  rate limiting.

## [2.3.0] - 2026-08-17

### Added

- **"Add to my AI".** GitHub repositories that can actually be installed into an
  AI setup are now detected, badged and actionable: MCP servers, agent skills,
  agent frameworks and general LLM tooling.
  - **Detection is scored, not keyword-matched.** Curated repo topics carry the
    most weight, the repo name less, a description mention least, and a repo must
    clear a threshold before it is badged. This is deliberate: a false positive
    puts an install prompt on something uninstallable. Tests assert that `redis`
    and a travel-booking app called `travel-agent-booking` are both left alone.
  - **My AI Stack** - a collection separate from bookmarks, with a
    want-to-try / installed status per entry, persisted in `localStorage` and
    reachable from the toolbar.
  - **Install panel** with per-tool instructions for Claude Code, Cursor / VS Code
    and everything else, with a copy button on every step. MCP servers get a
    `claude mcp add` scaffold and an editor config snippet; skills get the exact
    `~/.claude/skills/` clone; frameworks get the package-manager line for their
    language.
  - **Guesses are labelled.** Commands derived from the repo URL alone are exact.
    Anything inferred - a published package name, an MCP start command - is
    tagged "needs a look" and linked to the repo README. Shipping a confident
    install line that silently fails would repeat the fabricated-data mistake
    this project just finished removing.
- 20 further smoke checks covering detection, the decoys, the modal, stack status
  transitions and the export round-trip (56 total).

### Changed

- The bookmark export file now carries the AI stack alongside bookmarks, and
  import restores both. Export files written by v2.2.0, which contain only
  bookmarks, still import correctly.
- Card badges are offset clear of the bookmark button, which they previously
  overlapped.

## [2.2.0] - 2026-08-17

Closes the remaining items from `ADVISORY.md`.

### Added

- **Bookmark export and import.** Bookmarks live in `localStorage`, which a
  cleared cache wipes without warning - export is this app's whole backup story,
  so import ships with it. Export downloads a dated JSON file; import merges into
  the existing set rather than replacing it, so restoring on a device that already
  has bookmarks never deletes them. Malformed files are rejected with a message
  and leave existing bookmarks untouched.
- **Tests run in CI.** The Actions workflow now runs `tests/smoke.js` on every
  push and pull request, and the Pages deploy job depends on it - a failing test
  can no longer reach production. Playwright is installed with `--no-save`, so the
  repository still carries no `package.json` or lockfile.
- Smoke coverage for the export/import round-trip, including the malformed-file
  path (36 checks total).

### Changed

- **Split the single file into `index.html` + `css/styles.css` + `js/app.js`.**
  The 1,776-line monolith is now 150 lines of markup, 837 of CSS and 888 of JS.
  There is still no build step and no dependencies: Pages serves the files as-is
  and opening `index.html` from disk behaves identically.

## [2.1.0] - 2026-08-17

### Fixed

- **Production served V1.** GitHub Pages serves `index.html`, which still held the
  legacy V1 app, so visitors never saw the V2 release. V2 is now `index.html`.
  `vercel.json` (which rewrote `/` to `index-v2.html`) is no longer needed and has
  been removed - the rename works on any static host.
- **Cross-site scripting.** Repository names, descriptions, authors, languages,
  topics and URLs from the GitHub and HuggingFace APIs were interpolated straight
  into `innerHTML`, and each card carried an inline `onclick` built from the API's
  URL. All external text now passes through `escapeHtml()`, links are validated by
  `safeUrl()` (http/https only) and cards use a delegated click handler.
- **Rate limits were invisible.** Unauthenticated GitHub search allows only 10
  requests per minute; hitting it produced a generic failure. A shared `fetchJson()`
  wrapper now detects 403/429 and explains the limit, including when to retry.
- **Language filter stayed hidden** after visiting the LLM Arena tab.
- **Bookmarks used the active tab's platform** rather than the item's own, which
  could mis-key bookmarks toggled from the mixed-platform bookmarks view.

### Added

- **Platform-wide search.** The search box previously filtered only the items
  already loaded. Pressing Enter (or clicking "Search all") now queries GitHub or
  HuggingFace directly, so any repository or model is reachable - not just the
  current listing. A banner shows the active scope with a "Back to browse" exit;
  search results are cached for an hour.
- **Browse-scope banner** stating that the GitHub listing shows repositories
  *created* in the selected window, ranked by stars.
- **Browser smoke tests** (`tests/smoke.js`) covering escaping, search, rate-limit
  messaging, navigation and bookmarks. All APIs are mocked; they run offline.
- **`ADVISORY.md`** - project assessment and the roadmap to production.

### Changed

- **LLM Arena no longer ships fabricated data.** The tab shipped hardcoded ELO
  scores (GPT-4 1365, Claude 3.5 Sonnet 1348, Gemini Pro 1320) presented as real
  standings; by 2026 they were badly stale as well as invented. The tab now links to
  the live leaderboard and states plainly that live data needs a server-side proxy.
- Date filters relabelled "Created After" / "Created Before" to match what they query.
- Removed the "Compare" button, which only raised a "coming soon" alert, and replaced
  it with a "Browse" button that returns to the current platform's listing.

### Removed

- `github-shop.html` and the V1 `index.html` (both preserved in git history).
- `vercel.json`.

## [2.0.0] - 2025-01-25

### 🎉 Major Release - Multi-Platform Architecture

This is a major rewrite that transforms GitHub Nexus into AI Discovery Hub, a comprehensive multi-platform discovery tool for developers and AI/ML practitioners.

### Added

#### Multi-Platform Support
- **GitHub Integration** - Full-featured GitHub trending repositories with historical data
- **HuggingFace Integration** - Browse trending AI models and datasets from HuggingFace
- **LLM Arena Integration** - View chatbot arena leaderboard with ELO ratings (mock data)
- Platform switcher with dedicated tabs for each source
- Platform-specific badges on item cards
- Platform-specific statistics and metadata

#### Historical Data & Calendar
- Date range picker for browsing historical trending data
- "Date From" and "Date To" input fields
- Default 7-day lookback period
- Custom date range support for any time window
- Per-date-range caching for performance optimization

#### Bookmarking System
- One-click bookmarking with ☆/⭐ toggle button on each card
- Cross-platform bookmarking support (GitHub, HuggingFace, LLM Arena)
- Persistent storage using localStorage
- Bookmark counter in toolbar showing total saved items
- "Bookmarks" button to view all saved items at once
- Bookmark state persists across browser sessions

#### View Modes
- **Grid View** - Classic card layout with full information (default)
- **List View** - Horizontal layout optimized for quick scanning
- **Compact View** - Dense grid layout showing more items on screen
- View mode switcher buttons in toolbar
- Smooth transitions between view modes
- View mode preference maintained during session

#### Enhanced Filtering
- **Multi-Language Selection** - Select multiple programming languages simultaneously
- **Category Filters** - AI/ML categories for HuggingFace (NLP, Computer Vision, Audio, Multimodal, RL, Tabular)
- Platform-specific filter visibility (languages for GitHub/HF, categories for HF only)
- Improved filter controls layout with CSS Grid
- Real-time filter application

#### UI/UX Improvements
- Renamed from "GitHub Nexus" to "AI Discovery Hub"
- Updated header with "Multi-Platform Discovery" subtitle
- Platform tabs with "NEW" badges for HuggingFace and LLM Arena
- Toolbar section with view modes and action buttons
- Enhanced color scheme with platform-specific colors
  - GitHub: Neon Blue (#0066ff)
  - HuggingFace: Yellow (#FFD21E)
  - LLM Arena: Purple (#9d4edd)
- Improved responsive design for mobile devices
- Better card hover effects and animations
- Enhanced stats display with platform-specific metrics
- Results counter showing filtered item count

#### Additional Stats & Information
- **GitHub**: Issues count, watchers, topics, creation/update dates
- **HuggingFace**: Downloads count, pipeline tags, categories, likes
- **LLM Arena**: ELO rating, vote count
- Relative timestamps with tooltip showing full date
- Platform-specific stat icons

### Changed

#### Architecture
- Complete code restructure to support multiple platforms
- Modular API functions for each platform
- Platform-agnostic rendering system
- Unified item data structure across platforms
- Cache keys now include platform identifier
- Separated filter logic by platform

#### Performance
- Per-platform caching strategy
- Date-range-specific cache for GitHub
- Optimized rendering for different view modes
- Lazy loading preparation (structure in place)

#### Styling
- Updated CSS variables with new color palette
- Responsive grid system for filters
- Improved card layouts for all view modes
- Enhanced mobile breakpoints
- Better spacing and typography

#### File Structure
- Main V2 file: `index-v2.html`
- V1 files preserved: `index.html`, `github-shop.html`
- Backward compatibility maintained

### Technical Details

#### New Functions
- `switchPlatform(platform)` - Handle platform switching
- `switchView(view)` - Handle view mode changes
- `fetchHuggingFaceModels()` - Fetch HF trending models
- `fetchLLMArenaLeaderboard()` - Fetch LLM Arena data (mock)
- `toggleBookmark(item, platform)` - Bookmark management
- `isBookmarked(id, platform)` - Check bookmark status
- `updateBookmarkCount()` - Update bookmark counter
- `getCacheKey(platform, params)` - Generate platform-specific cache keys

#### Updated Functions
- `renderItems()` - Now supports multiple view modes
- `renderCard()` - Platform-specific rendering
- `applyFiltersAndSort()` - Multi-platform filtering
- `populateLanguageFilter()` - Dynamic language population
- `init()` - Platform initialization logic

#### API Endpoints
- GitHub: `https://api.github.com/search/repositories`
- HuggingFace: `https://huggingface.co/api/models?sort=trending`
- LLM Arena: Mock data (API endpoint TBD)

### Deprecated
- Single-platform architecture (GitHub only)
- Weekly-only cache system (still available for V1)

### Notes

#### Known Limitations
- LLM Arena currently uses mock data - actual API endpoint needs verification
- Compare functionality is placeholder (button present, feature TBD)
- No user authentication yet (planned for future release)

#### Migration from V1
- V1 files remain functional and untouched
- Bookmarks use new data structure (not compatible with V1)
- Cache keys changed - V1 cache will not be used by V2
- No automatic migration tool (manual bookmark re-creation needed)

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance Metrics
- Initial load time: <2s (cached)
- Platform switch time: <1s (cached)
- Date range change: ~2s (API dependent)
- View mode switch: Instant

---

## [1.0.0] - 2025-01-24

### Initial Release - GitHub Nexus

#### Added
- GitHub trending repositories viewer
- Weekly trending data with automatic caching
- Real-time search functionality
- Language filtering (single selection)
- Sort options (stars, forks, updated, created, issues)
- Repository statistics (stars, forks, watchers, issues)
- Topics/tags display
- Futuristic cyberpunk theme
- Glassmorphism effects
- Responsive design
- Smooth animations and transitions

#### Features
- Weekly cache system with automatic refresh
- Repository cards with hover effects
- Ranking badges
- Relative timestamps
- Filter controls section
- Results counter

#### Tech Stack
- Pure HTML/CSS/JavaScript
- GitHub REST API
- LocalStorage for caching
- Google Fonts (Orbitron, Sora, Oxanium)

---

## Future Versions

### [3.0.0] - Planned
- User authentication (GitHub OAuth, HuggingFace)
- Advanced comparison view
- Data export (CSV/JSON)
- URL sharing with query parameters
- More platforms (NPM, PyPI, Docker Hub)
- Actual LLM Arena API integration
- Data visualizations and charts
- Theme customization

### Ideas for Consideration
- Browser extension
- Desktop application (Electron)
- API for programmatic access
- Community features (comments, ratings)
- Personal dashboard
- Email notifications for bookmarks
- Integration with development tools

---

[2.0.0]: https://github.com/Meir83/github-nexus/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Meir83/github-nexus/releases/tag/v1.0.0
