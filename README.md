# Pranith Jain - Portfolio

A unique, multi-purpose web application built with Alpine.js and Tailwind CSS. Designed as a modern security platform dashboard showcasing cybersecurity expertise and professional services.

## 🚀 Features

- **Modern Dashboard Layout**: Fixed sidebar navigation with app-like interface
- **SPA-like Navigation**: Section-based routing without page reloads
- **Interactive Components**: Tabbed interfaces, animated cards, and smooth transitions
- **Dark/Light Mode**: Automatic theme detection with manual toggle
- **Responsive Design**: Fully responsive across all devices with mobile menu
- **Glass Morphism UI**: Modern glass-effect components with backdrop blur
- **Animated Backgrounds**: Floating gradient blobs and glow effects
- **AOS Animations**: Scroll-triggered entrance animations

## 🛠️ Tech Stack

- **Alpine.js 3.x** - Lightweight JavaScript framework for interactivity
- **Tailwind CSS** - Utility-first CSS framework
- **AOS (Animate On Scroll)** - Scroll animation library
- **Google Fonts** - Inter, Poppins, and Space Grotesk typography
- **Pure HTML/JavaScript** - No build step required

## 📁 Project Structure

```
/
├── index.html          # Main HTML with Alpine.js directives
├── script.js           # App data and functionality
├── package.json        # Project metadata
├── wrangler.jsonc      # Cloudflare Pages configuration
├── README.md          # This file
└── dist/              # Build output directory
    ├── index.html
    └── script.js
```

## 🎨 Sections

1. **Dashboard** - Welcome hero, stats, expertise cards, companies
2. **About** - Personal profile and background
3. **Experience** - Career timeline with achievements
4. **Certifications** - Professional credentials and training
5. **Projects** - Featured initiatives and contributions
6. **Featured** - Expert features and industry publications
7. **Contact** - Contact information and CTA

## 🚀 Development

### Local Development

Simply open `index.html` in a web browser. No server or build process required:

```bash
# Open directly
open index.html

# Or use a simple HTTP server
python3 -m http.server 8000
```

### Build for Deployment

```bash
npm run build
```

This copies `index.html` and `script.js` to the `dist/` directory.

## 🌐 Deployment on Cloudflare Pages

1. **Build Command**: `npm run build`
2. **Output Directory**: `dist`
3. **Root Directory**: `/`

Or manually upload:
1. Run `npm run build`
2. Upload contents of `dist/` folder to Cloudflare Pages

## ✨ Key Features Explained

### Alpine.js Data Management
All application state is managed through the `appData()` function in `script.js`, including:
- Navigation state (active section, sidebar toggle)
- Theme preferences with localStorage persistence
- Section content (features, experience, skills, projects, certifications, featured)
- Computed properties for section titles and subtitles

### Multi-Level Navigation
- **Sidebar Navigation**: Persistent sidebar with quick stats and section links
- **Top Navigation**: Secondary horizontal navigation bar
- **Mobile Menu**: Collapsible hamburger menu for mobile devices

### Animations & Transitions
- Floating gradient blobs in background
- Gradient text animations for headings
- Card hover effects with scaling and shadows
- Smooth section transitions with fade and slide effects
- AOS scroll-triggered animations for content cards

### Dark Mode
- Automatic system preference detection
- Manual toggle with localStorage persistence
- Glass morphism adapts to both themes

## 🎯 Customization

### Update Content
Edit the data objects in `script.js`:
- `skills` - Core expertise areas
- `experience` - Work history
- `companies` - Client/employer list
- `certifications` - Certifications and training
- `projects` - Portfolio projects
- `featured` - Featured articles and profiles

### Update Colors
Modify the Tailwind config in `index.html`:
```javascript
colors: {
  brand: { /* your colors */ },
}
```

### Add New Sections
1. Add section ID to `activeSection` state
2. Add content to `script.js`
3. Create section markup in HTML with `x-show="activeSection === 'your-section'"`

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🔧 Troubleshooting

### Alpine.js Not Working
Ensure the script is loaded with `defer` attribute and Alpine CDN is included.

### Build Issues
Make sure `dist/` directory exists and is not tracked in `.gitignore`.

### Theme Not Persisting
Check that localStorage is enabled in your browser.

## 📄 License

MIT License - Feel free to use this template for your own projects!

## 👤 Author

**Pranith Jain**
- [LinkedIn](https://www.linkedin.com/in/pranithjain)
- [GitHub](https://github.com/Pranith-Jain)
- Email: hello@pranithjain.qzz.io

---

Built with ❤️ using Alpine.js, Tailwind CSS, and modern web technologies.
