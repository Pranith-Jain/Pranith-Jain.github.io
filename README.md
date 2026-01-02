# Pranith Jain — Portfolio (React + Tailwind)

A modern, responsive portfolio website for **Pranith Jain** (Certified Cyber Criminologist) built as a small web app using:

- **React** (UI composition)
- **Tailwind CSS** (modern styling + dark mode)
- **Vite** (fast dev server + production builds)

## Features

- **Modern, professional “glass” UI** with a subtle dot-grid background
- **Dark / Light mode** toggle (persisted in `localStorage`)
- **Viewer count** (global when available):
  - Uses **CountAPI** (`api.countapi.xyz`) to increment/return views
  - Falls back to a local counter if the network is unavailable
- **Calendly meeting link**: https://calendly.com/pranithjain84/30min
- Updated content from LinkedIn profile: summary, experience, skills and certifications

## Getting started

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
npm run preview
```

## Notes

- The viewer count increments **once per browser session** to avoid inflating numbers on refresh.
- For static hosting (GitHub Pages, Netlify, Vercel, etc.), deploy the `dist/` folder produced by `npm run build`.
