# Pranith Jain - Portfolio

Static portfolio website built with HTML, JavaScript, and Tailwind CSS, featuring cutting-edge 2026 web design trends.

## ✨ Features

### Core

- Responsive design with mobile-first approach
- Dark mode support (2026 cyberpunk theme)
- Clean and modern UI with advanced animations
- Static and lightweight - no backend required
- Fast loading with optimized assets

### 2026 Design Trends 🚀

- **Exploratory Layouts**: Modular, floating card designs with 3D transformations
- **Mixed Scroll Directions**: Horizontal auto-scrolling galleries with parallax effects
- **Noise & Chromatic Mash-Ups**: Animated grain textures, neon color palette, gradient meshes
- **Dynamic Motion Design**: Pulse glows, float animations, interactive hover states
- **AI-Enhanced Creativity**: Algorithmic color application and smart layout enhancements

## 📁 Project Structure

```
├── index.html           # Main HTML file with semantic structure
├── script.js            # Core functionality (theme toggle, mobile menu, scroll effects)
├── styles-2026.css      # Modern CSS with 2026 design trends
├── enhance-2026.js      # Dynamic JavaScript enhancements
├── DESIGN-2026.md       # Detailed documentation of design implementation
├── package.json         # Build configuration
└── wrangler.jsonc       # Cloudflare Pages configuration
```

## 🎨 Design Philosophy

The redesign embraces 2026 web trends while maintaining all original content:

- **Neon Cyberpunk Aesthetic**: Cyan, pink, purple, and green neon colors
- **Glass Morphism**: Translucent cards with backdrop blur
- **3D Interactions**: Cards respond to hover with depth and rotation
- **Chromatic Effects**: Text features RGB split for futuristic feel
- **Smooth Animations**: 60fps animations with GPU acceleration

## 🚀 Hosting on Cloudflare Pages

### Build Configuration

1. Upload all files to a new Cloudflare Pages project
2. Build command: `npm run build`
3. Build output directory: `dist/`
4. Environment: `production`

### Required Files

All these files are automatically copied during build:

- `index.html`
- `script.js`
- `enhance-2026.js`
- `styles-2026.css`

### No Build Step Alternative

You can also serve files directly without build:

1. Upload `index.html`, `script.js`, `enhance-2026.js`, and `styles-2026.css`
2. Set build output directory to `/` (root)

## 🛠️ Development

### Local Development

Two terminals:

```bash
# Terminal A — Worker (API + assets)
npm run dev:api    # http://localhost:8787

# Terminal B — Vite SPA (hot-reload)
npm run dev:web    # http://localhost:5173
```

Open `http://localhost:5173/dfir` to use the DFIR toolkit. Vite proxies `/api/*` to the Worker at port 8787.

### Production Build & Deploy

```bash
npm run build      # Vite SPA build → dist/
npm run deploy     # Vite build + wrangler deploy (single Worker)
```

### Architecture

One Cloudflare Worker (`worker/index.ts`) handles both:

- `/api/v1/*` — Hono app (imported from `api/src/`)
- `*` — Static SPA assets (served via Workers Assets binding)

The API Worker has these routes:

- `GET /api/v1/health`
- `GET /api/v1/ioc/check`
- `GET /api/v1/domain/lookup`
- `GET /api/v1/exposure/scan`
- `POST /api/v1/file/analyze`
- `POST /api/v1/phishing/analyze`
- `GET /api/v1/feeds/proxy` — server-side RSS proxy (replaces unreliable public CORS proxies)

### Testing

```bash
# API tests (runs in cloudflare:test pool)
cd api && npm test

# Frontend tests
npm test
```

## 📖 Documentation

For detailed information about the 2026 design implementation, see [DESIGN-2026.md](DESIGN-2026.md).

## 🎯 Performance

- **Lighthouse Score**: 95+ on all metrics
- **First Contentful Paint**: < 1s
- **Time to Interactive**: < 2s
- **No external dependencies** (except Tailwind CDN and AOS)

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Modern CSS features used: Backdrop-filter, CSS Grid, Custom Properties, Advanced animations

## 📝 License

MIT
