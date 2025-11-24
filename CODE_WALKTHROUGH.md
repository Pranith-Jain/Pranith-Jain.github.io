# Code Walkthrough - Line-by-Line Analysis

## Document Structure (Lines 1-11)

### Line 1: DOCTYPE
```html
<!DOCTYPE html>
```
- HTML5 document type declaration
- Tells browser to render in standards mode (not quirks mode)
- Essential for modern web applications

### Lines 2-3: HTML Tag & Charset
```html
<html lang="en">
<head>
  <meta charset="UTF-8" />
```
- `lang="en"` - Specifies English language for assistive technologies
- `charset="UTF-8"` - Character encoding (supports emoji, international characters)
- Self-closing meta tag with proper XHTML syntax

### Line 5: Viewport Meta Tag
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
- **Critical for responsive design**
- `width=device-width` - Set viewport to device width (mobile optimization)
- `initial-scale=1.0` - Prevent automatic zoom
- Without this, mobile browsers default to 980px viewport width

### Line 6: Page Title
```html
<title>Pranith Jain | Cybersecurity & MailOps Portfolio</title>
```
- Appears in browser tab and search results
- Good SEO practice with keywords
- Clear, descriptive title

### Lines 8-9: External Google Fonts & Icons
```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24..48,400..700,0..1,0..200" rel="stylesheet" />
```

**Google Fonts (Poppins)**:
- Font weight range: 300 (light) to 700 (bold)
- `display=swap` - Shows fallback font immediately (good for perceived performance)
- Poppins is modern, geometric sans-serif (professional appearance)

**Material Symbols**:
- `opsz` (optical size): 24-48px range
- `wght` (weight): 400-700
- `FILL` (fill): 0-1 (outline to filled)
- `GRAD` (grade): 0-200 (weight variation)
- Allows for flexible icon sizing and styling

### Line 11: Material Web Components
```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@material/web@1.0.0/dist/material-web.min.js"></script>
```
- `type="module"` - Modern JavaScript module syntax
- Version pinned to 1.0.0 (stable)
- Minified for production
- CDN: jsdelivr.net (reliable CDN with good uptime)
- Provides Material Web components (buttons, etc.)

---

## CSS Styling (Lines 12-141)

### Lines 13-18: Icon Styling
```css
.material-symbols-outlined {
  font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;
  vertical-align:middle;
  transition: color .2s;
  color: var(--primary);
}
```
- `font-variation-settings` - Controls Material Symbols appearance
  - `FILL: 0` - Outline style (not filled)
  - `wght: 400` - Regular weight
  - `GRAD: 0` - No grade variation
  - `opsz: 24` - 24px optical size
- `vertical-align: middle` - Aligns with text
- `transition: .2s` - Smooth color changes
- `color: var(--primary)` - Uses primary color variable (purple)

### Lines 19-30: Color System (Design Tokens)

**Light Theme** (Lines 20-24):
```css
:root {
  --primary:#6750a4;                    /* Main brand purple */
  --on-primary:#fff;                    /* Text on primary (white) */
  --primary-container:#eaddff;          /* Light purple bg */
  --on-primary-container:#21005d;       /* Dark text on light purple */
  --secondary-container:#e8def8;        /* Light secondary bg */
  --on-secondary-container:#1d192b;     /* Dark text on secondary */
  --surface:#fef7ff;                    /* Main background */
  --on-surface:#1c1b1f;                 /* Main text color */
  --surface-variant:#e7e0ec;            /* Subtle accent bg */
  --on-surface-variant:#49454f;         /* Secondary text */
  --outline:#79747e;                    /* Borders, dividers */
  --bg:var(--surface);                  /* Alias for surface */
  --card-bg:#fff;                       /* Card backgrounds */
  --link:var(--primary);                /* Link color */
}
```

**Dark Theme** (Lines 25-30):
```css
body.dark {
  --primary:#d0bcff;                    /* Lighter purple for dark bg */
  --on-primary:#381e72;                 /* Dark purple text */
  --primary-container:#4f378b;          /* Dark purple container */
  --on-primary-container:#eaddff;       /* Light text on dark purple */
  --secondary-container:#4a4458;        /* Dark secondary bg */
  --on-secondary-container:#e8def8;     /* Light text */
  --surface:#1c1b1f;                    /* Dark background */
  --on-surface:#e6e1e5;                 /* Light text */
  --surface-variant:#49454f;            /* Subtle dark accent */
  --on-surface-variant:#cac4d0;         /* Light secondary text */
  --outline:#938f99;                    /* Light borders */
  --bg:var(--surface);                  /* Dark bg alias */
  --card-bg:#2b2930;                    /* Dark card bg */
  --link:var(--primary);                /* Light purple links */
}
```

**Why This System Works**:
- Follows Material Design 3 color system
- Easy theme switching via single class toggle
- All colors update automatically via CSS cascade
- No JavaScript color manipulation needed

### Line 31: Box Sizing Reset
```css
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
```
- `box-sizing: border-box` - Padding/border included in width calculations
- `margin:0;padding:0` - Removes default browser margins/padding
- Applies to all elements including pseudo-elements
- **Impact**: Consistent layout calculations across all elements

### Line 32: Smooth Scrolling
```css
html{scroll-behavior:smooth;}
```
- Enables smooth scroll animation when clicking anchor links
- CSS-only solution (no JavaScript needed)
- Improves UX for single-page navigation
- Browser support: Modern browsers (IE not supported)

### Line 33: Body Styling
```css
body{font-family:'Poppins',sans-serif;background:var(--bg);color:var(--on-surface);transition:background .3s,color .3s;line-height:1.6;}
```
- `font-family: 'Poppins'` - Primary font with sans-serif fallback
- `background: var(--bg)` - Uses CSS variable for theming
- `color: var(--on-surface)` - Text color from theme
- `transition: .3s` - Smooth theme transition animation
- `line-height: 1.6` - 1.6x text height for readability (standard practice is 1.4-1.8)

### Lines 34-40: Link & Navigation Styling
```css
a{color:var(--link);text-decoration:none;}
a:hover{text-decoration:underline;}

nav{position:fixed;top:0;left:0;width:100%;
   background:rgba(255,255,255,.8);backdrop-filter:blur(10px);
   border-bottom:1px solid var(--outline);z-index:1000;}
body.dark nav{background:rgba(28,27,31,.8);}
```

**Link Styling**:
- `color: var(--link)` - Purple links
- No underline by default (cleaner look)
- Underline only on hover (provides hover feedback)

**Navigation**:
- `position: fixed` - Always visible when scrolling
- `z-index: 1000` - Above all content
- `rgba(255,255,255,.8)` - Semi-transparent white (80% opacity)
- `backdrop-filter: blur(10px)` - **Glassmorphism effect**
  - Blurs content behind navigation
  - Modern, trendy look
  - Requires modern browser
- `border-bottom: 1px solid` - Subtle divider
- Dark mode version: Semi-transparent dark background

### Lines 37-42: Navigation Container & Links
```css
.nav-container{max-width:1140px;margin:auto;display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;}
.nav-brand{display:flex;align-items:center;gap:.4rem;font-weight:700;font-size:1.3rem;color:var(--primary);}
.nav-links{display:flex;gap:1rem;}
.nav-links a{display:flex;align-items:center;gap:.25rem;padding:.35rem .6rem;border-radius:.5rem;font-weight:500;transition:background .2s;}
.nav-links a:hover{background:var(--secondary-container);}
```

**Container**:
- `max-width: 1140px` - Prevents content from stretching too wide
- `display: flex; justify-content: space-between` - Space between logo and links
- Centered with `margin: auto`

**Brand**:
- Flexbox for icon + text alignment
- Font weight 700 (bold)
- Color: primary purple

**Links**:
- Flexbox with gap for spacing
- Each link is a flex container (icon + text aligned)
- `gap: .25rem` - Small space between icon and text
- `padding: .35rem .6rem` - Comfortable click target
- `border-radius: .5rem` - Subtle rounded corners
- `transition: .2s` - Smooth background color change
- Hover: Light purple background from secondary-container

### Lines 42-44: Hamburger Menu & Theme Toggle
```css
.hamburger{display:none;flex-direction:column;gap:.25rem;cursor:pointer;}
.hamburger span{width:24px;height:2px;background:var(--on-surface);transition:.3s;}
.theme-toggle{cursor:pointer;display:flex;align-items:center;background:none;border:none;padding:0;}
```

**Hamburger**:
- `display: none` - Hidden on desktop
- `flex-direction: column` - Stacks 3 lines vertically
- Each span is 24px × 2px (the hamburger lines)
- `transition: .3s` - Animates on toggle (if CSS animation added)

**Theme Toggle**:
- `background: none; border: none` - Removes button defaults
- `cursor: pointer` - Shows it's clickable
- `display: flex` - Aligns icon

### Lines 45-48: Header Hero Section
```css
header{background:linear-gradient(135deg,var(--primary)0%,var(--primary-container)100%);
       color:var(--on-primary);text-align:center;padding:9rem 1rem 6rem;
       clip-path:ellipse(150% 100% at 50% 0%);}
header h1{font-size:clamp(2.6rem,5vw,3.6rem);margin-bottom:.5rem;}
header p{font-size:1.15rem;max-width:760px;margin:0 auto;}
```

**Header Container**:
- `linear-gradient(135deg)` - Diagonal gradient (purple to light purple)
- `clip-path: ellipse()` - **Curved bottom edge**
  - Creates visual interest
  - Responsive with percentage values
  - Fancy but not essential

**Heading**:
- `clamp(2.6rem, 5vw, 3.6rem)` - **Responsive sizing**
  - Minimum: 2.6rem (mobile)
  - Preferred: 5% of viewport width
  - Maximum: 3.6rem (desktop)
  - Scales smoothly across screen sizes

**Paragraph**:
- `max-width: 760px` - Limits line length for readability
- Centered with `margin: 0 auto`

### Lines 49-50: Button & Main Content
```css
.cta{margin-top:2.5rem;}
md-filled-tonal-button{--md-filled-tonal-button-container-color:var(--secondary-container);--md-filled-tonal-button-label-text-color:var(--on-secondary-container);}
main{max-width:1140px;margin:auto;padding:3rem 1rem;}
```

**CTA Container**:
- Just adds top margin to space from heading

**Material Button**:
- Custom Material Web component properties
- `--md-filled-tonal-button-container-color` - Button background
- `--md-filled-tonal-button-label-text-color` - Button text
- Uses theme variables for consistency

**Main**:
- `max-width: 1140px` - Consistent container width
- `padding: 3rem 1rem` - Vertical and horizontal padding

### Lines 51-56: Section Styling & Chips
```css
section{margin-bottom:4rem;}
section h2{font-size:1.75rem;margin-bottom:1rem;color:var(--primary);position:relative;}
section h2::after{content:'';position:absolute;left:0;bottom:-4px;width:48px;height:3px;background:var(--primary);border-radius:2px;}
#about p{max-width:800px;margin:auto;}
.skills{display:flex;flex-wrap:wrap;gap:.5rem;}
.chip{display:inline-flex;align-items:center;gap:.25rem;background:var(--secondary-container);color:var(--on-secondary-container);padding:.35rem .75rem;border-radius:9999px;font-size:.85rem;}
```

**Section Spacing**:
- `margin-bottom: 4rem` - Space between sections

**Heading Styling**:
- `font-size: 1.75rem` - Large, prominent
- `position: relative` - For pseudo-element positioning

**Heading Underline** (::after pseudo-element):
- `position: absolute; bottom: -4px` - Positioned below text
- `width: 48px; height: 3px` - Small decorative line
- `border-radius: 2px` - Slightly rounded ends
- Purple color from primary

**About Paragraph**:
- `max-width: 800px` - Readable line length
- Centered

**Skills Container**:
- `display: flex; flex-wrap: wrap` - Wraps to next line
- `gap: .5rem` - Space between chips

**Chip Component**:
- `display: inline-flex` - Shrinks to content
- `border-radius: 9999px` - Fully rounded (pill shape)
- `gap: .25rem` - Space between icon and text
- Light purple background from secondary-container
- Small font size (0.85rem)

### Lines 58-94: Timeline Component (Complex)

**Timeline Container** (Lines 58-62):
```css
.timeline{
  border-left: 3px solid var(--primary);
  padding-left: 2.2rem;
  position: relative;
}
```
- Left border: 3px purple line
- Padding: Space for content away from line
- Creates the vertical timeline spine

**Timeline Item** (Lines 63-66):
```css
.timeline-item{
  margin-bottom:2rem;
  position:relative;
  padding-left:0;
}
```
- Space between items
- Relative positioning for pseudo-element

**Timeline Dot** (Lines 68-80):
```css
.timeline-item::before{
  content:'';
  position:absolute;
  left:-2.1rem;
  top: 0.65rem;
  width:0.82rem;
  height:0.82rem;
  background:var(--primary);
  border-radius:50%;
  border:2.5px solid var(--primary-container);
  box-sizing:border-box;
  z-index:1;
}
```
- `::before` pseudo-element creates circular dot
- `position: absolute; left: -2.1rem` - Positioned on the timeline line
- `width: 0.82rem; height: 0.82rem` - Small circle
- `border-radius: 50%` - Perfect circle
- `border: 2.5px solid` - Light purple ring
- `background: var(--primary)` - Dark purple fill
- `z-index: 1` - Above the line

**Timeline Text** (Lines 81-98):
```css
.timeline-item h3{
  font-size:1.13rem;
  margin-bottom:.32rem;
  font-weight:700;
  line-height:1.35;
  padding-left:0;
}
.timeline-item span{
  font-size:1rem;
  color:var(--on-surface-variant);
  margin-bottom:.4rem;
  display:block;
  margin-left:0;
}
.timeline-item ul{
  margin-left:1.2rem;
  list-style:disc;
  font-size:1.12rem;
}
```
- Heading: Bold, prominent
- Span (date): Smaller, secondary color
- List: Indented with bullets

### Lines 99-118: Projects Grid & Cards
```css
.list{list-style:disc inside;}
.projects-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;}
.project-card{background:var(--card-bg);border-radius:1rem;padding:1rem;box-shadow:0 3px 6px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:.6rem;transition:transform .2s,box-shadow .2s;}
.project-card:hover{transform:translateY(-4px);box-shadow:0 6px 12px rgba(0,0,0,.1);}
.project-card h3{font-size:1.05rem;color:var(--primary);display:flex;align-items:center;gap:.3rem;margin:0;}
.project-card p{font-size:.9rem;color:var(--on-surface-variant);flex-grow:1;}
.project-card a{font-weight:600;}
```

**Grid Layout**:
- `display: grid` - Modern CSS Grid
- `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))`
  - `auto-fit` - Responsive: fits as many columns as possible
  - `minmax(260px, 1fr)` - Minimum 260px, grows to fill space
  - Creates responsive 1-3 column layout

**Card**:
- `background: var(--card-bg)` - White/dark bg
- `border-radius: 1rem` - Rounded corners (16px)
- `box-shadow: 0 3px 6px rgba(0,0,0,.06)` - Subtle shadow
- `display: flex; flex-direction: column` - Stacks content vertically
- `gap: .6rem` - Space between elements

**Card Hover**:
- `transform: translateY(-4px)` - **Lift effect** (moves up 4px)
- Enhanced shadow (stronger)
- `transition: .2s` - Smooth animation

**Card Content**:
- Heading: Purple, flexbox for icon alignment
- Paragraph: Secondary color, `flex-grow: 1` takes available space
- Link: Bold font weight

### Lines 106-118: Contact & Resume Button
```css
.contact-info{display:flex;flex-direction:column;gap:.8rem;font-size:.95rem;}
.contact-info a{display:inline-flex;align-items:center;gap:.3rem;}
.resume-btn{
  display:inline-flex;align-items:center;gap:.5rem;
  padding:.75rem 1.2rem;
  background:var(--primary);color:var(--on-primary);
  border-radius:.7rem;font-weight:600;
  box-shadow:0 2px 6px rgba(80,40,160,.08);
  font-size:1.08rem;
  margin-top:1.5rem;
  transition:background .2s;
}
.resume-btn:hover{background:var(--primary-container);color:var(--on-primary-container);}
```

**Contact Info**:
- Column layout with gap
- Links are flex for icon + text

**Resume Button**:
- Purple background (`var(--primary)`)
- White text (`var(--on-primary)`)
- Rounded corners
- Subtle shadow
- Hover: Changes to light purple background
- Smooth transition animation

### Lines 119-120: Footer
```css
footer{text-align:center;padding:2.5rem 1rem;background:var(--primary-container);color:var(--on-primary-container);display:flex;flex-direction:column;gap:1rem;align-items:center;}
body.dark footer{background:#312f36;color:var(--on-surface-variant);}
```
- Light purple background (light mode)
- Centered text
- Dark override for dark mode
- Flexbox for column layout

### Lines 121-140: Responsive Media Queries

**1100px Breakpoint** (Line 121-123):
```css
@media(max-width:1100px){
  .nav-container, main { max-width: 98vw;}
}
```
- Increases container width to 98% viewport
- Prevents narrow gaps on mid-size screens

**768px Breakpoint** (Lines 124-130):
```css
@media(max-width:768px){
  .nav-links{position:absolute;top:64px;left:0;width:100%;flex-direction:column;background:var(--bg);padding:1rem 0;display:none;}
  .nav-links.show{display:flex;}
  .hamburger{display:flex;}
  .timeline{padding-left:1.3rem;}
  .timeline-item::before{left:-1.3rem;}
}
```
- Nav links become absolute positioned dropdown
- Hidden by default, shown with `.show` class
- Hamburger menu becomes visible
- Timeline adjusts padding for smaller screens

**480px Breakpoint** (Lines 131-140):
```css
@media(max-width:480px){
  .projects-grid { grid-template-columns: 1fr !important; }
  .skills { overflow-x: auto; padding-bottom: 0.5rem; }
  .cta md-filled-tonal-button { width: 100%; }
  .contact-info a { width: 100%; padding: 0.5rem 0; justify-content: center; }
  main { padding: 2rem 0.5rem; }
  header { padding: 6rem 1rem 4rem; }
  .timeline{padding-left:1rem;}
  .timeline-item::before{left:-1rem;}
}
```
- Single column grid for projects
- Horizontal scrolling for skills
- Full-width buttons and links
- Reduced padding/margins
- Timeline adjusts further

---

## HTML Body Content (Lines 143-297)

### Navigation (Lines 145-165)

```html
<nav>
  <div class="nav-container">
    <div class="nav-brand">
      <span class="material-symbols-outlined">verified_user</span>
      Pranith Jain
    </div>
    <div class="nav-links" id="navLinks">
      <a href="#about">...</a>
      ...
    </div>
    <div style="display:flex;align-items:center;gap:.8rem;">
      <button id="themeToggle" class="theme-toggle" aria-label="Toggle theme">
        <span class="material-symbols-outlined" id="themeIcon">dark_mode</span>
      </button>
      <div class="hamburger" id="hamburger">
        <span></span><span></span><span></span>
      </div>
    </div>
  </div>
</nav>
```

**Structure**:
- Fixed navigation bar with three sections:
  1. **Brand** (left): Logo icon + name
  2. **Links** (center): 8 navigation anchors
  3. **Controls** (right): Theme toggle + hamburger menu

**Navigation Links** (8 total):
1. #about - About
2. #skills - Skills
3. #experience - Experience
4. #education - Education
5. #coursework - Coursework
6. #certifications - Certifications
7. #projects - Projects
8. #contact - Hire Me

**Accessibility**:
- `aria-label="Toggle theme"` - Screen reader label
- Semantic `<button>` tag
- Proper link structure with icons

### Header (Lines 166-170)

```html
<header>
  <h1>Hi, I'm Pranith Jain</h1>
  <p>MailOps Specialist & Cloud Security Enthusiast blending deliverability mastery with GenAI-driven automation.</p>
  <div class="cta"><md-filled-tonal-button href="#contact" label="Let's Connect"></md-filled-tonal-button></div>
</header>
```

**Content**:
- H1: Main headline
- P: Subtitle/tagline
- Material Web button: CTA linking to contact section

### Main Content (Lines 172-293)

#### 1. About Section (Lines 172-175)
```html
<section id="about">
  <h2>About</h2>
  <p>I believe security shouldn't merely put out fires...</p>
</section>
```
- ID matches navigation anchor (#about)
- Professional bio paragraph
- Establishes expertise and mission

#### 2. Skills Section (Lines 176-188)
```html
<section id="skills">
  <h2>Skills</h2>
  <div class="skills">
    <span class="chip"><span class="material-symbols-outlined">visibility</span>Threat Detection</span>
    ...
  </div>
</section>
```
- 8 skill chips with icons
- Icons provide visual interest
- Easy to scan list

**Skills Listed**:
1. Threat Detection
2. Incident Response
3. SIEM (Sumo Logic, Elastic)
4. OSINT & MITRE ATT&CK
5. Email Deliverability
6. GCP IAM & 2FA
7. Python, Bash, SQL
8. Vibe Coding

#### 3. Experience Section (Lines 189-233)
```html
<section id="experience">
  <h2>Experience</h2>
  <div class="timeline">
    <div class="timeline-item">
      <h3>IT Support Specialist — Qubit Capital (Full Time)</h3>
      <span>Jul 2024 – Present · Remote</span>
      <ul>
        <li>Lead MailOps for 500+ domains...</li>
      </ul>
    </div>
    ...
  </div>
</section>
```

**Timeline Structure**:
- Container with `.timeline` class
- Multiple `.timeline-item` divs
- Each item has: title, date, bullet points

**Experiences** (5 total, reverse chronological):
1. IT Support Specialist @ Qubit Capital (Jul 2024 - Present)
2. Cloud Security Intern @ ZeroRisk Labs (May 2025 - Jul 2025)
3. Security Analyst Trainee @ Tracelay (Jul 2024 - Oct 2024)
4. Junior Support Engineer @ GlowTouch Technologies (Sep 2023 - Jul 2024)
5. Associate Software Developer @ TekWorks (Mar 2023 - Sep 2023)

#### 4. Education Section (Lines 234-239)
```html
<section id="education">
  <h2>Education</h2>
  <ul class="list">
    <li>Bachelor of Engineering in Computer Science Engineering | VTU | Bengaluru | 2023 | CGPA: 6.81</li>
  </ul>
</section>
```
- Single degree listed
- Uses `<ul>` with `.list` class for styling
- CGPA included

#### 5. Coursework Section (Lines 240-250)
```html
<section id="coursework">
  <h2>Coursework</h2>
  <ul class="list">
    <li>GCLP '25 Google Cloud Cybersecurity Scholar...</li>
    ...
  </ul>
</section>
```
- 6 training programs/courses listed
- Recent dates (2025, 2024)
- Shows commitment to continuous learning

#### 6. Certifications Section (Lines 251-268)
```html
<section id="certifications">
  <h2>Certifications</h2>
  <ul class="list">
    <li>Proofpoint Certified Email Authentication Specialist | 2025</li>
    ...
  </ul>
</section>
```
- 13 certifications (impressive number)
- Mostly from 2025, some from 2024
- Mix of security, cloud, AI, and specialized certifications

#### 7. Projects Section (Lines 269-279)
```html
<section id="projects">
  <h2>Projects</h2>
  <div class="projects-grid">
    <div class="project-card">
      <h3><span class="material-symbols-outlined">playbook</span>Detection-Response-Playbooks</h3>
      <p>SOC playbooks for phishing analysis, ransomware containment & more.</p>
      <a href="https://github.com/pranithjainbp84/Detection-Response-Playbooks" target="_blank">View on GitHub →</a>
    </div>
    ...
  </div>
</section>
```

**Projects** (6 total):
1. Detection-Response-Playbooks - SOC playbooks
2. SOC-Automation-Scripts - Automation scripts
3. YARA-Sigma-Rules - Detection rules
4. CTF-Writeups - CTF write-ups
5. Tracelay-Internship - Internship projects
6. Cloud Ransomware Detection (GCP) - GCP-based detection

**Card Structure**:
- Icon + title heading
- Description
- GitHub link with arrow

#### 8. Contact Section (Lines 280-293)
```html
<section id="contact">
  <h2>Hire Me</h2>
  <p>If you're looking to fortify deliverability...</p>
  <div class="contact-info">
    <a href="mailto:pranithjainbp84@gmail.com"><span class="material-symbols-outlined">mail</span>pranithjainbp84@gmail.com</a>
    <a href="https://www.linkedin.com/in/pranithjain" target="_blank"><span class="material-symbols-outlined">launch</span>linkedin.com/in/pranithjain</a>
  </div>
  <a href="https://app.rezi.ai/s/pranithjain" target="_blank" class="resume-btn">
    <span class="material-symbols-outlined">description</span>
    View Resume
  </a>
</section>
```

**Contact Methods**:
1. Email: Direct mailto link
2. LinkedIn: Profile link
3. Resume: External link to Rezi.ai

### Footer (Lines 295-297)

```html
<footer>
  <p>© <span id="year"></span> Pranith Jain • Built with Material You & hosted on GitHub Pages</p>
</footer>
```
- Copyright notice
- Dynamic year (updated by JavaScript)
- Attribution to Material Design & GitHub Pages

---

## JavaScript (Lines 298-322)

### Section 1: Hamburger Menu Toggle (Lines 300-302)

```javascript
document.getElementById('hamburger').addEventListener('click', () =>
  document.getElementById('navLinks').classList.toggle('show')
);
```

**Functionality**:
- Listens for click on hamburger button
- Toggles 'show' class on navigation links
- Shows/hides mobile menu

**CSS Impact**:
- `.nav-links.show { display: flex; }`
- Makes menu visible

### Section 2: Theme System (Lines 304-319)

```javascript
const btn = document.getElementById('themeToggle');
const icon = document.getElementById('themeIcon');

function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  localStorage.theme = dark ? 'dark' : 'light';
  icon.textContent = dark ? 'light_mode' : 'dark_mode';
  icon.style.color = getComputedStyle(document.body).getPropertyValue('--primary');
}

(function () {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = localStorage.theme === 'dark' || (!localStorage.theme && prefersDark);
  setTheme(dark);
})();

btn.addEventListener('click', () => {
  setTheme(!document.body.classList.contains('dark'));
});
```

**Components**:

1. **setTheme() Function**:
   - `document.body.classList.toggle('dark', dark)` - Applies/removes dark class
   - `localStorage.theme = ...` - Persists preference
   - `icon.textContent = ...` - Changes icon (sun/moon)
   - `icon.style.color = ...` - Updates icon color

2. **Initialization IIFE** (Immediately Invoked Function Expression):
   - `window.matchMedia('(prefers-color-scheme: dark)')` - Detects OS dark mode preference
   - Checks localStorage for saved preference
   - Defaults to system preference if no saved preference
   - Calls setTheme() to apply

3. **Toggle Button Listener**:
   - Toggles dark mode on click
   - Inverts current state: `!document.body.classList.contains('dark')`

**Flow**:
```
Page Load
  ↓
Check localStorage.theme
  ↓
If not found, check system preference
  ↓
Apply appropriate theme
  ↓
User clicks theme toggle
  ↓
Invert theme
  ↓
Save to localStorage
  ↓
Update UI (icon, colors via CSS variables)
```

### Section 3: Dynamic Year (Line 321)

```javascript
document.getElementById('year').textContent = new Date().getFullYear();
```

**Functionality**:
- Gets current year: `new Date().getFullYear()`
- Sets footer copyright year
- Auto-updates every year (no manual maintenance)

**Example**:
```html
<!-- In footer -->
<span id="year"></span>

<!-- After JavaScript runs -->
© 2025 Pranith Jain • ...
```

---

## Performance Characteristics

### Bundle Size Analysis

| Component | Size | Type |
|-----------|------|------|
| HTML content | ~15KB | Markup |
| Embedded CSS | ~4KB | Styles |
| Embedded JavaScript | ~1KB | Logic |
| **Total HTML file** | **~19KB** | Single request |
| Google Fonts | ~30KB | CDN (cached) |
| Material Symbols | ~50KB | CDN (cached) |
| Material Web | ~100KB | CDN (cached) |
| **Total** | **~199KB** | Cacheable |

### Rendering Performance

1. **First Paint**: Fast (HTML + embedded CSS)
2. **First Contentful Paint**: Depends on font loading
3. **Time to Interactive**: JavaScript is small (minimal parse time)
4. **Cumulative Layout Shift**: Minimal (fixed nav, no ads, no dynamic content)

### Browser Processing

```
1. Parse HTML (0ms - already embedded CSS/JS)
2. Download external fonts (parallel)
3. Download Material Symbols (parallel)
4. Download Material Web (parallel)
5. Apply CSS (includes fonts once loaded)
6. Execute JavaScript (~25 lines, instant)
7. Render page (smooth, no layout thrashing)
```

---

## Semantic HTML Analysis

### Document Outline

```
<html>
├─ <head> Metadata
├─ <body>
   ├─ <nav> Navigation landmark
   ├─ <header> Header landmark
   ├─ <main> Main content landmark
   │  ├─ <section id="about"> About me
   │  ├─ <section id="skills"> My skills
   │  ├─ <section id="experience"> Work history
   │  ├─ <section id="education"> Education
   │  ├─ <section id="coursework"> Training
   │  ├─ <section id="certifications"> Certifications
   │  ├─ <section id="projects"> Projects
   │  └─ <section id="contact"> Contact info
   └─ <footer> Footer landmark
```

### Accessibility Features

**Landmarks**: All major regions have semantic landmarks
**Headings**: Proper h1 (once), h2 (8x), h3 (titles)
**Links**: All links have descriptive text or ARIA labels
**Lists**: Proper use of `<ul>` and `<li>`
**Buttons**: Proper `<button>` element with labels

---

This comprehensive walkthrough explains every line of code, its purpose, and impact on the final product.
