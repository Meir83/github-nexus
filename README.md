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
- **LLM Arena** - Chatbot Arena leaderboard with ELO ratings
- Easy platform switching with dedicated tabs
- Platform-specific filters and categories

### 📅 Historical Data & Calendar (V2)
- **Date Range Picker** - Browse trending items from any time period
- **Custom Date Ranges** - Select specific from/to dates
- **Flexible Time Windows** - Daily, weekly, monthly, or custom periods
- Per-date-range caching for performance

### ⭐ Bookmarks & Favorites (V2)
- **One-Click Bookmarking** - Save items across all platforms
- **Persistent Storage** - Bookmarks saved in localStorage
- **Quick Access** - View all bookmarks with one click
- **Cross-Platform** - Bookmark GitHub repos, HF models, and LLM entries

### 👁️ Multiple View Modes (V2)
- **Grid View** - Classic card layout with full details
- **List View** - Horizontal layout for quick scanning
- **Compact View** - Dense grid showing more items at once
- Seamless switching between views

### 🎯 Enhanced Filtering (V2)
- **Multi-Language Selection** - Select multiple programming languages simultaneously
- **Category Filters** - AI/ML categories (NLP, Computer Vision, Audio, etc.)
- **Advanced Search** - Search across names, descriptions, and authors
- **Smart Sorting** - Multiple sort criteria with platform-specific options

### Core Functionality
- **Real-time Search** - Instantly filter items by name, description, or author
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
3. **LLM Arena Integration** - View chatbot leaderboard rankings
4. **Bookmarking System** - Save and organize your favorite discoveries
5. **View Modes** - Three different viewing layouts (Grid, List, Compact)
6. **Date Range Selection** - Historical data browsing with custom date ranges
7. **Multi-Language Filter** - Select multiple programming languages at once
8. **Enhanced UI** - Platform-specific badges, improved stats, better mobile support

### Breaking Changes
- Main file renamed from `github-shop.html` to `index-v2.html`
- Cache keys now platform-specific
- New bookmark data structure

See [CHANGELOG.md](CHANGELOG.md) for complete details.

## Demo

### V2 (Latest)
Open `index-v2.html` in any modern web browser

### V1 (Legacy)
Open `index.html` or `github-shop.html` for the original GitHub-only version

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Meir83/github-nexus.git
cd github-nexus
```

2. Open the HTML file:
```bash
# V2 (Recommended)
# On Windows
start index-v2.html

# On macOS
open index-v2.html

# On Linux
xdg-open index-v2.html
```

Or simply drag and drop `index-v2.html` into your browser.

## Usage

### Platform Switching
Click the platform tabs at the top to switch between:
- **GitHub** - Trending repositories
- **HuggingFace** - AI models and datasets
- **LLM Arena** - Chatbot leaderboard

### Date Range Selection (GitHub)
Use the date pickers to browse repositories from specific time periods:
1. Select a "Date From"
2. Select a "Date To"
3. Data automatically refreshes

### Bookmarking
1. Click the ☆ icon on any card to bookmark it
2. Click the "Bookmarks" button to view all saved items
3. Bookmarks persist across browser sessions

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

The GitHub API has rate limits for unauthenticated requests:
- 60 requests per hour per IP address
- The weekly caching system helps stay within these limits

For higher rate limits, you can add a GitHub Personal Access Token to the code.

## Future Enhancements

Potential features for future versions:
- ✅ ~~Saved favorites/bookmarks~~ (Implemented in V2)
- ✅ ~~Trending time ranges~~ (Implemented in V2 with date picker)
- ✅ ~~Multi-platform support~~ (Implemented in V2)
- Side-by-side comparison view (Compare button placeholder)
- User authentication with GitHub/HuggingFace OAuth
- Dark/light theme toggle
- Share specific searches via URL
- Export bookmarks/data to CSV/JSON
- GitHub star/unstar from the app
- More platforms (NPM, PyPI, Docker Hub)
- Actual LLM Arena API integration (currently mock data)
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
