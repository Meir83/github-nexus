# Changelog

All notable changes to AI Discovery Hub (formerly GitHub Nexus) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
