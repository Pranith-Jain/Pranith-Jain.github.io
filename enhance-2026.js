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
    logo.style.background = 'linear-gradient(135deg, #00fff9, #2c3ee5, #ff006e)';
    logo.style.boxShadow = '0 0 20px rgba(0, 255, 249, 0.6), 0 0 40px rgba(0, 255, 249, 0.4)';
  }
  
  // Update badges
  const badges = document.querySelectorAll('span[class*="rounded-full"]');
  badges.forEach((badge, index) => {
    if (badge.textContent.includes('Certified')) {
      badge.style.borderColor = 'rgba(0, 255, 249, 0.4)';
      badge.style.background = 'rgba(0, 255, 249, 0.1)';
      badge.style.color = '#00fff9';
      badge.style.fontFamily = 'Space Grotesk, monospace';
      badge.classList.add('badge-dynamic');
    }
  });
  
  // Update buttons
  const buttons = document.querySelectorAll('a[class*="bg-brand-600"]');
  buttons.forEach(button => {
    button.classList.add('btn-neon');
    button.style.background = 'linear-gradient(135deg, #2c3ee5, #00fff9)';
  });
}

function addFloatingAnimations() {
  // Add floating effect to stats cards
  const statsCards = document.querySelectorAll('section div[class*="grid"] > div[class*="glass"]');
  statsCards.forEach((card, index) => {
    card.classList.add('floating-card-3d');
    card.style.animationDelay = `${index * 0.2}s`;
    
    // Add glow effect based on index
    const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow'];
    card.addEventListener('mouseenter', () => {
      card.classList.add(glowColors[index % 3]);
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
    
    // Add neon border on hover
    const neonColors = [
      'rgba(0, 255, 249, 0.5)',
      'rgba(255, 0, 110, 0.5)',
      'rgba(139, 92, 246, 0.5)',
      'rgba(0, 255, 136, 0.5)'
    ];
    
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = neonColors[index % 4];
      card.style.boxShadow = `0 0 30px ${neonColors[index % 4]}`;
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
      gradientSpan.style.background = 'linear-gradient(135deg, #00fff9, #2c3ee5, #ff006e)';
      gradientSpan.style.webkitBackgroundClip = 'text';
      gradientSpan.style.webkitTextFillColor = 'transparent';
    }
  }
  
  // Add glow to section headings
  const sectionHeadings = document.querySelectorAll('h2');
  sectionHeadings.forEach((heading, index) => {
    const neonColors = ['#00fff9', '#ff006e', '#8b5cf6', '#00ff88'];
    heading.style.textShadow = `0 0 20px ${neonColors[index % 4]}40`;
  });
}

function enhanceScrollEffects() {
  // Enhanced scroll progress bar
  const scrollProgress = document.getElementById('scroll-progress');
  if (scrollProgress) {
    scrollProgress.style.background = 'linear-gradient(90deg, #00fff9, #2c3ee5, #ff006e)';
    scrollProgress.style.boxShadow = '0 0 10px rgba(0, 255, 249, 0.8)';
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
      
      // Add neon glow on hover
      [clone1, clone2].forEach((clone, idx) => {
        const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow'];
        clone.addEventListener('mouseenter', () => {
          clone.classList.add(glowColors[idx % 3]);
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
      link.style.color = '#00fff9';
      link.style.textShadow = '0 0 10px rgba(0, 255, 249, 0.8)';
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
      'rgba(0, 255, 249, 0.8)',
      'rgba(255, 0, 110, 0.8)',
      'rgba(139, 92, 246, 0.8)'
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
    
    const glowColors = ['neon-cyan-glow', 'neon-pink-glow', 'neon-purple-glow'];
    card.addEventListener('mouseenter', () => {
      card.classList.add(glowColors[index % 3]);
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
