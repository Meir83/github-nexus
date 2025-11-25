# GitHub Nexus

A futuristic, cyberpunk-themed web application that showcases trending GitHub repositories with advanced filtering and search capabilities.

![GitHub Nexus](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

### Core Functionality
- **Weekly Trending Repositories** - Automatically fetches repositories created in the last week, sorted by stars
- **Smart Caching** - Weekly cache system to minimize API calls and improve performance
- **Real-time Search** - Instantly filter repositories by name, description, or author
- **Language Filtering** - Filter repositories by programming language
- **Multiple Sort Options** - Sort by stars, forks, recently updated, recently created, or open issues

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

## Demo

Simply open `github-shop.html` in any modern web browser to see the application in action.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/github-nexus.git
cd github-nexus
```

2. Open the HTML file:
```bash
# On Windows
start github-shop.html

# On macOS
open github-shop.html

# On Linux
xdg-open github-shop.html
```

Or simply drag and drop `github-shop.html` into your browser.

## Usage

### Search
Type in the search box to filter repositories by:
- Repository name
- Description text
- Author/owner username

### Filter by Language
Use the language dropdown to show only repositories written in a specific programming language.

### Sort Options
Choose from multiple sorting options:
- **Most Stars** - Repositories with the highest star count
- **Most Forks** - Most forked repositories
- **Recently Updated** - Last modified repositories
- **Recently Created** - Newest repositories
- **Most Issues** - Repositories with the most open issues

### Weekly Cache
The application caches repository data for the current week to reduce GitHub API calls. The cache automatically refreshes when a new week begins.

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Custom properties, animations, glassmorphism
- **Vanilla JavaScript** - No frameworks or dependencies
- **GitHub REST API** - Repository data source
- **LocalStorage API** - Client-side caching

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
- User authentication with GitHub OAuth
- Saved favorites/bookmarks
- Trending time ranges (daily, monthly, yearly)
- Dark/light theme toggle
- Share functionality
- More detailed repository stats
- Export data to CSV/JSON

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
