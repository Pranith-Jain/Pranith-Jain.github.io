# Pranith Jain - Security Intelligence Platform

A professional, multi-purpose web application built with Alpine.js and Tailwind CSS. Designed as a modern security platform dashboard showcasing cybersecurity expertise and professional services.

## 🚀 Features

- **Modern Dashboard Layout**: Sidebar navigation with app-like interface
- **Mega Menu Navigation**: Hover-activated dropdowns with rich descriptions
- **Interactive Components**: Tabbed interfaces, animated cards, and smooth transitions
- **Dark/Light Mode**: Automatic theme detection with manual toggle
- **Responsive Design**: Fully responsive across all devices
- **Glass Morphism UI**: Modern glass-effect components with backdrop blur
- **Animated Backgrounds**: Floating blobs and gradient animations
- **Section-Based Routing**: SPA-like navigation without page reloads
- **AOS Animations**: Scroll-triggered entrance animations

## 🛠️ Tech Stack

- **Alpine.js 3.x** - Lightweight JavaScript framework for interactivity
- **Tailwind CSS** - Utility-first CSS framework
- **AOS (Animate On Scroll)** - Scroll animation library
- **Google Fonts** - Inter & Space Grotesk typography
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

1. **Dashboard** - Welcome hero, feature cards, expertise tabs
2. **About** - Personal profile and background
3. **Experience** - Professional work history
4. **Skills** - Technical expertise by category
5. **Projects** - Featured portfolio work
6. **Certifications** - Professional credentials
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
- Navigation state
- Theme preferences
- Section content (features, experience, skills, projects, certifications)

### Multi-Level Navigation
- **Top Navigation**: Mega menu with hover-activated dropdowns
- **Sidebar Navigation**: Persistent sidebar with quick stats and section links
- **Mobile Menu**: Collapsible hamburger menu for mobile devices

### Animations & Transitions
- Floating background blobs
- Gradient text animations
- Card hover effects with scaling
- Smooth section transitions
- AOS scroll-triggered animations

### Dark Mode
- Automatic system preference detection
- Manual toggle with localStorage persistence
- Glass morphism adapts to both themes

## 🎯 Customization

### Update Content
Edit the data objects in `script.js`:
- `features` - Dashboard feature cards
- `experience` - Work history
- `skillCategories` - Technical skills
- `projects` - Portfolio projects
- `certifications` - Certifications and credentials

### Update Colors
Modify the Tailwind config in `index.html`:
```javascript
colors: {
  primary: { /* your colors */ },
  accent: { /* your colors */ }
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
- Email: pranithjain84@gmail.com

---

Built with ❤️ using Alpine.js, Tailwind CSS, and modern web technologies.
