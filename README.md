# AI Discovery Hub (formerly GitHub Nexus)

A futuristic, cyberpunk-themed multi-platform web application that showcases trending repositories, AI models, and LLM leaderboards with advanced filtering, search, and bookmarking capabilities.

![AI Discovery Hub](https://img.shields.io/badge/Status-Active-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0-blue)
![License](https://img.shields.io/badge/License-MIT-blue)

## 🆕 Version 2.0 Released!

AI Discovery Hub V2 expands beyond GitHub to become a comprehensive discovery platform for AI/ML resources across multiple platforms. [See what's new](#whats-new-in-v20)

## Features

### 🌐 Multi-Platform Support (V2)
- **GitHub** - Trending repositories with full statistics
- **HuggingFace** - Trending AI models and datasets with download counts
- **LLM Arena** - not connected yet; the tab links to the live leaderboard
  rather than showing placeholder numbers
- Easy platform switching with dedicated tabs
- Platform-specific filters and categories

### 📅 Historical Data & Calendar (V2)
- **Date Range Picker** - Browse trending items from any time period
- **Custom Date Ranges** - Select specific from/to dates
- **Flexible Time Windows** - Daily, weekly, monthly, or custom periods
- Per-date-range caching for performance

### 🤖 Add to my AI

The feature this app exists for. While browsing GitHub, repositories that are
actually *installable into an AI setup* are detected and badged:

| Badge | What it means |
|---|---|
| 🔌 MCP Server | A Model Context Protocol server you can register with a client |
| 🧩 Agent Skill | A skill folder you can drop into `~/.claude/skills/` |
| 🤖 AI Agent | An agent framework or autonomous-agent toolkit |
| 🧠 LLM Tooling | RAG, embeddings, prompt and vector tooling |

Detection is **scored, not keyword-matched**: repository topics (curated by the
owner) outweigh the repo name, which outweighs a passing mention in the
description. A repo has to clear a threshold before it earns a badge, because a
false positive puts an install prompt on something that cannot be installed —
`redis` and a travel-booking app named `travel-agent-booking` are both correctly
left alone, and there are tests that keep it that way.

Clicking **+ Add to my AI** does two things:

1. **Saves it to your AI stack** — a list separate from bookmarks, with a
   want-to-try / installed status, persisted in `localStorage` and included in
   the same export file as your bookmarks.
2. **Shows the install commands** for Claude Code, Cursor / VS Code, or any
   other setup — with a copy button per step.

**On honesty in the install panel:** commands derived purely from the repository
URL (a `git clone`, a skill dropped into `~/.claude/skills/`) are exact and shown
plainly. Anything that requires a guess — a published package name, an MCP
server's start command — is tagged **needs a look** and paired with a link to the
repo's README. This app used to ship fabricated leaderboard data; printing a
confident install line that silently fails would be the same mistake in a new
place.

### ⚠️ Risk signals

Because "Add to my AI" puts an install button next to arbitrary GitHub repos, it
carries risk information. Every GitHub card is checked, and the install panel
runs deeper checks before showing you any command.

**What is checked**

| Signal | Why it matters |
|---|---|
| Repository age | A days-old repo has had no time to be reviewed by anyone |
| Star count | Few people have publicly vouched for it |
| **Name collision** | An older, far more popular repo with the *same name* is the core fingerprint of a typosquat re-upload |
| **Committed binaries** | `.exe`, `.zip`, `.pyc`, `__pycache__`, installers — source projects rarely commit these; droppers usually do |
| Security notices | A `SECURITY-NOTICE.md` in the repo is surfaced immediately |

When serious signals fire, the install commands are **hidden behind a deliberate
click** — not blocked, it's your machine, but the copy button shouldn't be the
first thing your hand reaches.

**What this is not.** It is not a malware scanner, and it will never tell you a
repository is safe. A static page cannot read a repo's code, cannot spot
obfuscation, and cannot know what an external endpoint does with your data. When
nothing fires, the panel says *"No automated signals found — that is not a safety
verdict"*, and if the checks are rate-limited it says they did not complete
rather than implying all-clear. A green "safe" badge would be worse than no check
at all, because it would launder exactly the repo trying to hurt you.

Installing a skill, MCP server or agent means running someone else's code with
your permissions. Read the source, and prefer the original project over a
re-upload.

### ⭐ Bookmarks & Favorites (V2)
- **One-Click Bookmarking** - Save items across all platforms
- **Persistent Storage** - Bookmarks saved in localStorage
- **Quick Access** - View all bookmarks with one click
- **Cross-Platform** - Bookmark GitHub repos and HuggingFace models
- **Export / Import** - Download your bookmarks *and your AI stack* as one JSON
  file and restore them on another browser or after clearing your cache.
  Importing merges rather than replaces, so restoring never deletes entries you
  already have. Older export files that contain only bookmarks still restore.

### 👁️ Multiple View Modes (V2)
- **Grid View** - Classic card layout with full details
- **List View** - Horizontal layout for quick scanning
- **Compact View** - Dense grid showing more items at once
- Seamless switching between views

### 🔍 Platform-Wide Search
- **Filter as you type** - narrows the results currently on screen
- **Search everywhere** - press Enter (or click "Search all") to query the whole
  platform, so you can find any repository or model, not just the ones already loaded
- Works on GitHub and HuggingFace, with results cached for an hour
- "Back to browse" returns to the normal listing

### 🎯 Enhanced Filtering (V2)
- **Multi-Language Selection** - Select multiple programming languages simultaneously
- **Category Filters** - AI/ML categories (NLP, Computer Vision, Audio, etc.)
- **Advanced Search** - Search across names, descriptions, and authors
- **Smart Sorting** - Multiple sort criteria with platform-specific options

### Core Functionality
- **Real-time Search** - Instantly filter items by name, description, or author,
  or search the whole platform with Enter
- **Smart Caching** - Platform and date-specific cache system
- **Multiple Sort Options** - Sort by stars, forks, recently updated, created, or issues
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile

### Repository Information
Each repository card displays:
- Repository name and author
- Description
- Star count, fork count, and watchers
- Open issues count
- Programming language
- Creation and last update timestamps (relative time)
- Topic tags (up to 3)
- Ranking badge

### Design
- **Futuristic Cyberpunk Theme** - Neon blue and cyan color scheme
- **Glassmorphism Effects** - Frosted glass aesthetic with backdrop blur
- **Smooth Animations** - Staggered card animations and glow effects
- **Responsive Design** - Fully mobile-friendly layout
- **Interactive Elements** - Hover effects and smooth transitions

## What's New in V2.0

### Major Changes
1. **Multi-Platform Architecture** - Completely restructured to support multiple data sources
2. **HuggingFace Integration** - Browse trending AI models and datasets
3. **LLM Arena tab** - links out to the live leaderboard (no live data source yet)
4. **Bookmarking System** - Save and organize your favorite discoveries
5. **View Modes** - Three different viewing layouts (Grid, List, Compact)
6. **Date Range Selection** - Historical data browsing with custom date ranges
7. **Multi-Language Filter** - Select multiple programming languages at once
8. **Enhanced UI** - Platform-specific badges, improved stats, better mobile support

### Breaking Changes
- Main file renamed from `github-shop.html` to `index.html`
- Cache keys now platform-specific
- New bookmark data structure

See [CHANGELOG.md](CHANGELOG.md) for complete details.

## Demo

Open `index.html` in any modern web browser, or visit the deployed GitHub Pages site.

The V1 GitHub-only version (`github-shop.html`) has been removed; it remains in git history.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Meir83/github-nexus.git
cd github-nexus
```

2. Open the HTML file:
```bash
# On Windows
start index.html

# On macOS
open index.html

# On Linux
xdg-open index.html
```

Or simply drag and drop `index.html` into your browser.

## Usage

### Platform Switching
Click the platform tabs at the top to switch between:
- **GitHub** - Trending repositories
- **HuggingFace** - AI models and datasets
- **LLM Arena** - links to the live leaderboard

### Date Range Selection (GitHub)
Use the date pickers to browse repositories from specific time periods:
1. Select a "Date From"
2. Select a "Date To"
3. Data automatically refreshes

### Bookmarking
1. Click the ☆ icon on any card to bookmark it
2. Click the "Bookmarks" button to view all saved items
3. Bookmarks persist across browser sessions
4. Use "Export" for a JSON backup and "Import" to restore it

### Adding to your AI
1. Look for the coloured badge (🔌 MCP Server, 🧩 Agent Skill, 🤖 AI Agent, 🧠 LLM Tooling)
2. Click **+ Add to my AI** on that card
3. Pick your tool tab — Claude Code, Cursor / VS Code, or anything else — and copy the steps
4. **Read the risk panel** before copying anything — it runs when the panel opens
5. Mark it **installed** once it is set up; "My AI Stack" in the toolbar shows everything you've added

### View Modes
Switch between three viewing layouts:
- **Grid** - Classic card layout with full information
- **List** - Horizontal rows for easy scanning
- **Compact** - Dense grid to see more items at once

### Search & Filter
- **Search Box** - Type to filter by name, description, or author
- **Language Filter** - Ctrl+Click to select multiple languages (GitHub/HuggingFace)
- **Category Filter** - Filter by AI/ML category (HuggingFace only)
- **Sort By** - Choose sorting criteria

### Smart Caching
- Data is cached per platform and date range
- Cache automatically refreshes after 7 days
- Manual refresh: clear browser localStorage

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Custom properties, animations, glassmorphism, CSS Grid/Flexbox
- **Vanilla JavaScript** - No frameworks or dependencies
- **GitHub REST API** - Repository data
- **HuggingFace API** - AI models and datasets
- **LLM Arena API** - Leaderboard data (mock implementation)
- **LocalStorage API** - Client-side caching and bookmarks

## Fonts

- **Orbitron** - Headings and titles
- **Sora** - Body text
- **Oxanium** - Labels and metadata

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## API Rate Limits

The GitHub API rate-limits unauthenticated requests:
- **10 requests per minute** for the search endpoints this app uses
- 60 requests per hour for other REST endpoints

Results are cached in `localStorage` for a week (searches for an hour), which keeps
normal browsing well inside those limits. When a limit is hit the app says so
explicitly, including roughly how long to wait.

Raising the limit means holding a token, which a purely client-side app cannot do
safely - a token shipped in the page is a public token. The supported route is a small
server-side proxy that holds the credential; see `ADVISORY.md`.

## Project Structure

```
index.html        Markup only
css/styles.css    All styling
js/app.js         All behaviour
tests/smoke.js    Browser smoke tests
```

No build step and no runtime dependencies - GitHub Pages serves these files as-is,
and opening `index.html` from disk works identically.

## Testing

Browser smoke tests live in `tests/smoke.js`. All third-party APIs are mocked, so the
tests run offline:

```bash
npm install -D playwright && npx playwright install chromium
node tests/smoke.js
```

They cover HTML escaping of API-supplied text, platform-wide search, rate-limit
messaging, tab navigation, the bookmark export/import round-trip, the
"Add to my AI" detector — including the decoy repos that must *not* be flagged —
and the risk signals, using a fixture modelled on a real typosquat attack.

CI runs the same suite on every push and pull request, and the GitHub Pages deploy
job will not run unless the tests pass.

## Future Enhancements

Potential features for future versions:
- ✅ ~~Saved favorites/bookmarks~~ (Implemented in V2)
- ✅ ~~Trending time ranges~~ (Implemented in V2 with date picker)
- ✅ ~~Multi-platform support~~ (Implemented in V2)
- ✅ ~~Search across the whole platform, not just loaded results~~ (Implemented)
- ✅ ~~Export bookmarks to JSON~~ (Implemented, with import)
- ✅ ~~"Add to my AI" for MCP servers, skills and agent frameworks~~ (Implemented)
- ✅ ~~Risk signals on repositories before install~~ (Implemented)
- Side-by-side comparison view
- User authentication with GitHub/HuggingFace OAuth
- Dark/light theme toggle
- Share specific searches via URL
- GitHub star/unstar from the app
- More platforms (NPM, PyPI, Docker Hub)
- Actual LLM Arena data (needs a server-side proxy; the tab currently links out)
- Advanced data visualizations and charts
- Browser extension version

## Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- GitHub API for providing repository data
- Google Fonts for the beautiful typography
- The open-source community for inspiration

## Author

Created with Claude Code

---

**Note:** This is a client-side only application. No backend or server setup is required.

**Security note:** All text coming from third-party APIs is HTML-escaped before it
reaches the DOM, and outbound links are restricted to `http(s)` URLs. If you extend
`renderCard()`, keep new fields going through `escapeHtml()` / `safeUrl()`.
