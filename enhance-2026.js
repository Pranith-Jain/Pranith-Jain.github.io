// 2026 Design Enhancement Script
// This script dynamically enhances the website with modern 2026 design trends

document.addEventListener('DOMContentLoaded', () => {
  // Apply neon color scheme
  applyNeonColors();
  
  // Add floating animations
  addFloatingAnimations();
  
  // Enhance cards with 3D effects
  enhance3DCards();
  
  // Add chromatic effects to headings
  addChromaticEffects();
  
  // Enhance scroll effects
  enhanceScrollEffects();
  
  // Add horizontal scroll to companies section
  addHorizontalScroll();
  
  // Add interactive glow effects
  addInteractiveGlowEffects();
});

function applyNeonColors() {
  // Update header logo
  const logo = document.querySelector('header a[href="#top"] span:first-of-type');
  if (logo) {
    logo.classList.add('animate-pulse-glow');
    logo.style.background = 'linear-gradient(135deg, var(--brand-primary), var(--neon-cyan), var(--neon-purple))';
    logo.style.boxShadow = '0 0 20px rgba(6, 182, 212, 0.4)';
  }

  // Update badges
  const badges = document.querySelectorAll('span[class*="rounded-full"]');
  badges.forEach((badge, index) => {
    if (badge.textContent.includes('Certified')) {
      badge.style.borderColor = 'var(--neon-cyan)';
      badge.style.background = 'rgba(6, 182, 212, 0.15)';
      badge.style.color = 'var(--neon-cyan)';
      badge.style.fontFamily = 'Space Grotesk, monospace';
      badge.classList.add('badge-dynamic');
    }
  });

  // Update buttons
  const buttons = document.querySelectorAll('a[class*="bg-brand-600"]');
  buttons.forEach(button => {
    button.classList.add('btn-neon');
    button.style.background = 'linear-gradient(135deg, var(--brand-primary), var(--neon-cyan))';
  });
}

function addFloatingAnimations() {
  // Add floating effect to stats cards
  const statsCards = document.querySelectorAll('section div[class*="grid"] > div[class*="glass"]');
  statsCards.forEach((card, index) => {
    card.classList.add('floating-card-3d');
    card.style.animationDelay = `${index * 0.2}s`;

    // Add glow effect based on index - expanded to 5 colors
    const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow', 'neon-green-glow', 'neon-orange-glow'];
    card.addEventListener('mouseenter', () => {
      card.classList.add(glowColors[index % 5]);
    });
    card.addEventListener('mouseleave', () => {
      glowColors.forEach(glow => card.classList.remove(glow));
    });
  });
}

function enhance3DCards() {
  // Enhance skill cards
  const skillCards = document.querySelectorAll('#skills div[class*="rounded-3xl"]');
  skillCards.forEach((card, index) => {
    card.classList.add('skill-card', 'floating-card-3d');

    // Add neon border on hover - expanded to 5 colors for variety
    const neonColors = [
      'rgba(6, 182, 212, 0.5)',
      'rgba(236, 72, 153, 0.5)',
      'rgba(168, 85, 247, 0.5)',
      'rgba(16, 185, 129, 0.5)',
      'rgba(249, 115, 22, 0.5)'
    ];

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = neonColors[index % 5];
      card.style.boxShadow = `0 0 30px ${neonColors[index % 5]}`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    });
  });

  // Enhance certification cards
  const certCards = document.querySelectorAll('#certifications div[class*="rounded-2xl"]');
  certCards.forEach(card => {
    card.classList.add('floating-card-3d', 'glass-morphism');
  });
}

function addChromaticEffects() {
  // Add chromatic effect to main heading
  const mainHeading = document.querySelector('h1');
  if (mainHeading) {
    const gradientSpan = mainHeading.querySelector('span[class*="gradient"]');
    if (gradientSpan) {
      gradientSpan.classList.add('chromatic-text', 'text-neon-glow');
      gradientSpan.style.background = 'linear-gradient(135deg, var(--neon-cyan), var(--brand-primary), var(--neon-pink))';
      gradientSpan.style.webkitBackgroundClip = 'text';
      gradientSpan.style.webkitTextFillColor = 'transparent';
    }
  }

  // Add glow to section headings - using all 5 colors
  const sectionHeadings = document.querySelectorAll('h2');
  sectionHeadings.forEach((heading, index) => {
    const neonVars = ['var(--neon-cyan)', 'var(--neon-pink)', 'var(--neon-purple)', 'var(--neon-green)', 'var(--neon-orange)'];
    heading.style.textShadow = `0 0 15px ${neonVars[index % 5]}40`;
  });
}

function enhanceScrollEffects() {
  // Enhanced scroll progress bar
  const scrollProgress = document.getElementById('scroll-progress');
  if (scrollProgress) {
    scrollProgress.style.background = 'linear-gradient(90deg, var(--neon-cyan), var(--brand-primary), var(--neon-pink))';
    scrollProgress.style.boxShadow = '0 0 10px rgba(6, 182, 212, 0.8)';
  }

  // Add parallax effect to background blobs
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const blobs = document.querySelectorAll('div[class*="blur-"]');

    blobs.forEach((blob, index) => {
      const speed = 0.5 + (index * 0.1);
      const yPos = -(scrolled * speed);
      blob.style.transform = `translateY(${yPos}px)`;
    });
  });
}

function addHorizontalScroll() {
  const companiesSection = document.querySelector('#companies div[class*="flex-wrap"]');
  if (companiesSection) {
    // Create horizontal scrolling container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'overflow-hidden py-8';
    scrollContainer.style.position = 'relative';

    const scrollContent = document.createElement('div');
    scrollContent.className = 'horizontal-scroll';

    // Clone company badges
    const companies = Array.from(companiesSection.children);
    companies.forEach(company => {
      const clone1 = company.cloneNode(true);
      const clone2 = company.cloneNode(true);

      clone1.classList.add('glass-morphism', 'flex-shrink-0');
      clone2.classList.add('glass-morphism', 'flex-shrink-0');

      // Add neon glow on hover - using all 5 colors
      [clone1, clone2].forEach((clone, idx) => {
        const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow', 'neon-green-glow', 'neon-orange-glow'];
        clone.addEventListener('mouseenter', () => {
          clone.classList.add(glowColors[idx % 5]);
        });
        clone.addEventListener('mouseleave', () => {
          glowColors.forEach(glow => clone.classList.remove(glow));
        });
      });

      scrollContent.appendChild(clone1);
      scrollContent.appendChild(clone2);
    });

    scrollContainer.appendChild(scrollContent);
    companiesSection.parentElement.replaceChild(scrollContainer, companiesSection);
  }
}

function addInteractiveGlowEffects() {
  // Add interactive glow to links
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => {
    link.addEventListener('mouseenter', () => {
      link.style.color = 'var(--neon-cyan)';
      link.style.textShadow = '0 0 10px rgba(6, 182, 212, 0.8)';
    });

    link.addEventListener('mouseleave', () => {
      link.style.color = '';
      link.style.textShadow = '';
    });
  });

  // Add glow effect to social icons
  const socialIcons = document.querySelectorAll('a[aria-label*="LinkedIn"], a[aria-label*="GitHub"], a[aria-label*="Email"]');
  socialIcons.forEach((icon, index) => {
    const glowColors = [
      'rgba(6, 182, 212, 0.8)',
      'rgba(236, 72, 153, 0.8)',
      'rgba(168, 85, 247, 0.8)'
    ];

    icon.addEventListener('mouseenter', () => {
      icon.style.filter = `drop-shadow(0 0 10px ${glowColors[index % 3]})`;
      icon.style.transform = 'scale(1.2) translateY(-2px)';
    });

    icon.addEventListener('mouseleave', () => {
      icon.style.filter = '';
      icon.style.transform = '';
    });
  });

  // Add pulse effect to featured articles
  const featuredCards = document.querySelectorAll('#featured a');
  featuredCards.forEach((card, index) => {
    card.classList.add('floating-card-3d', 'glass-morphism');

    const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow', 'neon-green-glow', 'neon-orange-glow'];
    card.addEventListener('mouseenter', () => {
      card.classList.add(glowColors[index % 5]);
    });

    card.addEventListener('mouseleave', () => {
      glowColors.forEach(glow => card.classList.remove(glow));
    });
  });
}

// Add noise animation to background
function addNoiseAnimation() {
  const noiseOverlay = document.querySelector('.noise-texture-overlay');
  if (noiseOverlay) {
    setInterval(() => {
      noiseOverlay.style.backgroundPosition = `${Math.random() * 100}% ${Math.random() * 100}%`;
    }, 100);
  }
}

// Initialize noise animation
addNoiseAnimation();

// Add modular grid layout to certifications
function enhanceModularGrid() {
  const certGrid = document.querySelector('#certifications > div > div[class*="grid"]');
  if (certGrid) {
    certGrid.classList.add('modular-grid');
  }
  
  const skillGrid = document.querySelector('#skills > div[class*="grid"]');
  if (skillGrid) {
    skillGrid.classList.add('modular-grid');
  }
}

enhanceModularGrid();

// Add scroll reveal animations with intersection observer
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

// Observe all sections
document.querySelectorAll('section').forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(section);
});

console.log('🎨 2026 Design Enhancements Applied! Featuring: Mixed Scroll Directions, Chromatic Effects, Dynamic Motion Design & AI-Enhanced Creativity');
