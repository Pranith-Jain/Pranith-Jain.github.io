# Portfolio Architecture & Component Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Pages Hosting                         │
│                    (Static File Server)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    Serves:
                    ├── index.html (324 lines)
                    │   ├── Embedded CSS (130 lines)
                    │   └── Embedded JavaScript (25 lines)
                    ├── README.md
                    └── ANALYSIS.md
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    ┌────────┐      ┌─────────┐      ┌─────────┐
    │ Browser│      │  CDN    │      │ Browser │
    │ Cache  │      │ Content │      │ Storage │
    └────────┘      └─────────┘      └─────────┘
        │            3 Resources      localStorage
        │            ├── Poppins      │
        │            ├── Material      └─ theme: 'light'|'dark'
        │            │  Symbols
        │            └── Material Web
        │               Components
        └──────────────────┬────────────────┘
                          ▼
            ┌──────────────────────────┐
            │  Rendered Portfolio Page │
            │   (Single Page App)      │
            └──────────────────────────┘
```

## File Structure

```
index.html (324 lines)
│
├─ <head> (lines 3-11)
│  ├── Meta tags
│  ├── External fonts (Google Fonts)
│  ├── External icons (Material Symbols)
│  └── External components (Material Web via CDN)
│
├─ <style> (lines 12-141)
│  ├── CSS Variables (Design System)
│  ├── Light Theme Variables
│  ├── Dark Theme Variables
│  ├── Component Styles
│  │  ├── Navigation styles
│  │  ├── Header styles
│  │  ├── Timeline styles
│  │  ├── Card styles
│  │  ├── Chip styles
│  │  └── Button styles
│  └── Responsive Breakpoints (3x)
│     ├── @media (max-width: 1100px)
│     ├── @media (max-width: 768px)
│     └── @media (max-width: 480px)
│
├─ <body> (lines 143-323)
│  ├── <nav> Navigation (fixed, sticky)
│  │  ├── Logo/Brand
│  │  ├── Links (8x sections)
│  │  ├── Theme Toggle
│  │  └── Hamburger Menu
│  │
│  ├── <header> Hero Section (gradient background)
│  │  ├── H1 Title
│  │  ├── Subtitle
│  │  └── CTA Button
│  │
│  ├── <main> Content (max-width: 1140px)
│  │  ├── #about - Professional bio
│  │  ├── #skills - Skill chips (8x)
│  │  ├── #experience - Timeline
│  │  │  ├── IT Support Specialist
│  │  │  ├── Cloud Security Intern
│  │  │  ├── Security Analyst Trainee
│  │  │  ├── Junior Support Engineer
│  │  │  └── Associate Software Developer
│  │  │
│  │  ├── #education - Degree info
│  │  ├── #coursework - Training programs (6x)
│  │  ├── #certifications - Certifications (13x)
│  │  ├── #projects - Project cards (6x)
│  │  │  ├── Detection-Response-Playbooks
│  │  │  ├── SOC-Automation-Scripts
│  │  │  ├── YARA-Sigma-Rules
│  │  │  ├── CTF-Writeups
│  │  │  ├── Tracelay-Internship
│  │  │  └── Cloud Ransomware Detection
│  │  │
│  │  └── #contact - Contact info
│  │     ├── Email link
│  │     ├── LinkedIn link
│  │     └── Resume button
│  │
│  ├── <footer> Footer
│  │  └── Copyright with dynamic year
│  │
│  └── <script> JavaScript (25 lines)
│     ├── Hamburger menu toggle
│     ├── Theme system
│     │  ├── Dark mode detection
│     │  ├── localStorage persistence
│     │  └── Dynamic theming
│     └── Dynamic year update
```

## Component Relationships

```
┌──────────────────────────────────────────────────────────┐
│                     Page Layout                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Fixed Navigation Bar                   │  │
│  │  [Logo] [Links......] [Theme Toggle] [Menu]      │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Header Section (Gradient)                │  │
│  │         Hero Title & CTA Button                  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Main Content Container (1140px max)      │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │ ABOUT SECTION                              │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ SKILLS SECTION (Chip Layout)                │ │  │
│  │  │ [Chip] [Chip] [Chip] [Chip] [Chip]          │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ EXPERIENCE SECTION (Timeline)               │ │  │
│  │  │ ●─────────────────────────────────────────┐ │ │  │
│  │  │ │ Role 1                                  │ │ │  │
│  │  │ │ • Detail 1                              │ │ │  │
│  │  │ │ • Detail 2                              │ │ │  │
│  │  │ ●─────────────────────────────────────────┐ │ │  │
│  │  │ │ Role 2                                  │ │ │  │
│  │  │ ├─────────────────────────────────────────┤ │ │  │
│  │  │ EDUCATION SECTION                         │ │ │  │
│  │  │ • Degree                                  │ │ │  │
│  │  │ • CGPA                                    │ │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ COURSEWORK SECTION                        │ │ │  │
│  │  │ • Course 1                                │ │ │  │
│  │  │ • Course 2                                │ │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ CERTIFICATIONS SECTION                    │ │ │  │
│  │  │ • Cert 1  • Cert 2  • Cert 3             │ │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ PROJECTS SECTION (Grid)                   │ │ │  │
│  │  │ ┌──────────┐ ┌──────────┐ ┌──────────┐   │ │ │  │
│  │  │ │ Project  │ │ Project  │ │ Project  │   │ │ │  │
│  │  │ │ Card     │ │ Card     │ │ Card     │   │ │ │  │
│  │  │ └──────────┘ └──────────┘ └──────────┘   │ │ │  │
│  │  ├─────────────────────────────────────────────┤ │  │
│  │  │ CONTACT SECTION                           │ │ │  │
│  │  │ • Email                                   │ │ │  │
│  │  │ • LinkedIn                                │ │ │  │
│  │  │ [Resume Button]                           │ │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Footer (Primary Container)           │  │
│  │  © [Year] Pranith Jain • Built with Material    │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Responsive Design Breakpoints

```
Mobile (< 480px)          Tablet (480-768px)       Desktop (> 768px)
┌──────────────┐         ┌──────────────────┐     ┌─────────────────────┐
│ ☰ [Nav]      │         │ [Nav Links] ☰    │     │ [Full Nav] ☰        │
│ [Content]    │         │ [Content]        │     │ [All Features]      │
│ Full Width   │         │ 1-2 Columns      │     │ Multi-Column Grid   │
│ [Mobile Menu]│         │ [Mobile Menu]    │     │ No Menu            │
│              │         │                  │     │                     │
└──────────────┘         └──────────────────┘     └─────────────────────┘

1100px+: Main container switches to 98vw
```

## Data Flow

```
User Action                  JavaScript Handler            DOM Update
─────────────────────────────────────────────────────────────────────

1. Page Load
   └─► Detect dark mode preference ────► Apply .dark class ────► Render dark theme
   └─► Check localStorage.theme ────────► Override if exists
   └─► Set footer year ────────────────► document.getElementById('year')

2. Click Theme Toggle Button
   └─► #themeToggle click handler ─────► setTheme(boolean) ────► Toggle .dark class
   └─► Save to localStorage ───────────► localStorage.theme
   └─► Update icon ────────────────────► Change icon SVG

3. Click Hamburger Menu
   └─► #hamburger click handler ───────► Toggle 'show' class ──► Expand/collapse menu

4. Smooth Scroll Navigation
   └─► Click nav link ─────────────────► HTML scroll-behavior ─► Smooth scroll to section
   └─► (Browser native, no JS needed)

5. External Link Click
   └─► User clicks GitHub/LinkedIn ────► Opens in new tab ─────► External site loads

CSS Variable Update Flow:
   Theme Toggle
       │
       ▼
   setTheme() function
       │
       ├─► document.body.classList.toggle('dark')
       │
       └─► CSS applies :root.dark variables
           │
           └─► All elements automatically update via var() references
```

## State Management

```
Application State (Minimal)

Client-side Storage:
├── localStorage.theme
│   ├── Value: 'dark' | 'light' | undefined
│   ├── Persistence: Across sessions
│   └── Read on: Page load, updated on: Theme toggle
│
└── DOM State
    ├── document.body.classList
    │   └── Contains 'dark' class when dark mode active
    │
    ├── #navLinks.classList
    │   └── Contains 'show' class when hamburger menu open
    │
    └── #themeIcon.textContent
        └── 'dark_mode' | 'light_mode'

No:
❌ Backend API calls
❌ Database queries
❌ User authentication
❌ Form submissions
❌ Session state (beyond localStorage)
```

## CSS Architecture

```
Cascading Style System
│
├─ CSS Variables (Custom Properties)
│  ├── Light Theme (default)
│  │   ├── --primary: #6750a4
│  │   ├── --secondary-container: #e8def8
│  │   ├── --surface: #fef7ff
│  │   └── ... (10+ more)
│  │
│  └── Dark Theme (body.dark)
│      ├── --primary: #d0bcff
│      ├── --secondary-container: #4a4458
│      ├── --surface: #1c1b1f
│      └── ... (10+ more)
│
├─ Global Styles
│  ├── *, *::before, *::after {box-sizing}
│  ├── html {scroll-behavior}
│  ├── body {font-family, background, color, transition}
│  └── a {color, text-decoration}
│
├─ Layout Components
│  ├── nav - Fixed sticky header
│  ├── header - Gradient hero section
│  ├── main - Container with max-width
│  ├── section - Spacing and typography
│  └── footer - Bottom section
│
├─ Content Components
│  ├── .nav-links - Navigation link styling
│  ├── .skills - Flex container for chips
│  ├── .chip - Badge/pill styling
│  ├── .timeline - Vertical timeline layout
│  ├── .timeline-item - Individual timeline item
│  ├── .projects-grid - Responsive grid
│  ├── .project-card - Card component
│  └── .contact-info - Contact list styling
│
├─ Interactive States
│  ├── :hover - Link underline, card lift, button color
│  ├── .show - Hamburger menu visibility
│  ├── .dark - Dark theme styles
│  └── transition - Smooth animations
│
└─ Responsive Design
   ├── @media (max-width: 1100px) - Container adjust
   ├── @media (max-width: 768px) - Hamburger, timeline adjust
   └── @media (max-width: 480px) - Mobile optimizations
```

## External Dependencies Chart

```
index.html (Single HTML File)
│
├─ Google Fonts CDN
│  └─ Poppins font (wght: 300,400,600,700)
│     └─ Used for all typography
│
├─ Google Icons CDN
│  └─ Material Symbols Outlined
│     └─ 40+ semantic icons throughout site
│
└─ Material Web CDN
   └─ Material Web v1.0.0
      └─ <md-filled-tonal-button> component
         └─ CTA button styling/behavior
```

## Performance Waterfall

```
1. HTML Request & Parse (19KB)
   ├─ Parse HTML document
   ├─ Parse embedded CSS
   ├─ Parse embedded JavaScript
   └─ Identify external resources

2. Parallel Resource Loading
   ├─ Google Fonts Stylesheet
   │  └─ Poppins font files (async)
   ├─ Material Symbols Stylesheet
   │  └─ Symbol definitions
   └─ Material Web Components
      └─ Web component definitions & polyfills

3. Render
   ├─ Style: Apply cascading styles
   ├─ Layout: Calculate positions (Flexbox/Grid)
   └─ Paint: Render pixels

4. Interactive
   ├─ JavaScript execution
   │  ├─ Hamburger menu listeners
   │  ├─ Theme toggle listeners
   │  └─ Footer year update
   └─ User interactions enabled
```

## Integration Points

```
External Services & APIs:
│
├─ GitHub Pages Hosting
│  └─ Serves static files
│
├─ GitHub Links (External)
│  ├─ 6 GitHub projects
│  └─ GitHub profile
│
├─ LinkedIn
│  └─ LinkedIn profile link
│
├─ Email
│  └─ mailto: link
│
├─ Resume Service (Rezi.ai)
│  └─ External resume viewer
│
└─ Google CDNs
   ├─ Fonts
   ├─ Icons
   └─ Material Web Components
```

## Accessibility Architecture

```
Accessibility Features:
│
├─ Semantic HTML
│  ├─ <nav>, <header>, <main>, <section>, <footer>
│  ├─ <h1>, <h2>, <h3> hierarchy
│  └─ <a>, <button> with proper roles
│
├─ ARIA Attributes
│  ├─ aria-label="Toggle theme"
│  └─ aria-label="Hamburger menu"
│
├─ Keyboard Navigation
│  ├─ Tab through links (native)
│  ├─ Enter on buttons (native)
│  └─ Smooth scrolling to anchors (native)
│
├─ Visual Design
│  ├─ Color contrast (AA compliant mostly)
│  ├─ Text sizing with responsive units
│  ├─ Focus indicators (default browser)
│  └─ Icon labels/descriptions
│
├─ Motion & Animation
│  ├─ Smooth scroll (respects prefers-reduced-motion concept)
│  └─ Transitions on hover/theme change
│
└─ Mobile Accessibility
   ├─ Touch targets (44px minimum)
   ├─ Hamburger menu for mobile
   ├─ Readable font sizes
   └─ Adequate spacing
```

---

This architecture demonstrates a clean, single-page application design focused on simplicity, performance, and maintainability.
