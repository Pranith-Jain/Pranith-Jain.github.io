import { describe, it, expect } from 'vitest'
import {
  personalInfo,
  stats,
  skills,
  companies,
  experiences,
  certifications,
  projects,
  featuredArticles,
  memberships,
  navLinks,
} from '../content'

describe('Content Data Validation', () => {
  describe('personalInfo', () => {
    it('should have required fields', () => {
      expect(personalInfo.name).toBeDefined()
      expect(personalInfo.title).toBeDefined()
      expect(personalInfo.email).toBeDefined()
      expect(personalInfo.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    })

    it('should have valid URLs', () => {
      const urlFields = [
        'calendlyUrl',
        'linkedInUrl',
        'githubUrl',
        'resumeUrl',
        'featuredUrl',
      ] as const

      urlFields.forEach((field) => {
        const url = personalInfo[field]
        expect(url).toBeDefined()
        expect(() => new URL(url)).not.toThrow()
      })
    })

    it('should have non-empty description', () => {
      expect(personalInfo.description.length).toBeGreaterThan(50)
    })
  })

  describe('stats', () => {
    it('should have at least one stat', () => {
      expect(stats.length).toBeGreaterThan(0)
    })

    it('should have valid stat structure', () => {
      stats.forEach((stat) => {
        expect(stat.label).toBeDefined()
        expect(stat.value).toBeDefined()
        expect(stat.description).toBeDefined()
      })
    })
  })

  describe('skills', () => {
    it('should have at least one skill category', () => {
      expect(skills.length).toBeGreaterThan(0)
    })

    it('should have valid skill structure', () => {
      skills.forEach((skill) => {
        expect(skill.title).toBeDefined()
        expect(skill.icon).toBeDefined()
        expect(skill.items).toBeInstanceOf(Array)
        expect(skill.items.length).toBeGreaterThan(0)
      })
    })

    it('should have valid icon references', () => {
      const validIcons = ['Mail', 'Search', 'Users', 'Shield', 'Cloud', 'Zap']
      skills.forEach((skill) => {
        expect(validIcons).toContain(skill.icon)
      })
    })
  })

  describe('companies', () => {
    it('should have at least one company', () => {
      expect(companies.length).toBeGreaterThan(0)
    })

    it('should have non-empty company names', () => {
      companies.forEach((company) => {
        expect(company.length).toBeGreaterThan(0)
      })
    })
  })

  describe('experiences', () => {
    it('should have at least one experience', () => {
      expect(experiences.length).toBeGreaterThan(0)
    })

    it('should have valid experience structure', () => {
      experiences.forEach((exp) => {
        expect(exp.title).toBeDefined()
        expect(exp.company).toBeDefined()
        expect(exp.period).toBeDefined()
        expect(exp.period).toMatch(/\d{4}/)
      })
    })

    it('should have either sections or items', () => {
      experiences.forEach((exp) => {
        const hasSections = exp.sections && exp.sections.length > 0
        const hasItems = exp.items && exp.items.length > 0
        expect(hasSections || hasItems).toBe(true)
      })
    })
  })

  describe('certifications', () => {
    it('should have certifications in categories', () => {
      expect(certifications.core.length).toBeGreaterThan(0)
    })

    it('should have valid certification structure', () => {
      const allCerts = [
        ...certifications.core,
        ...certifications.training,
        ...certifications.bootcamps,
        ...certifications.additional,
        ...certifications.internships,
        ...certifications.simulations,
      ]

      allCerts.forEach((cert) => {
        expect(cert.title).toBeDefined()
        expect(cert.issuer).toBeDefined()
        expect(cert.year).toBeDefined()
      })
    })
  })

  describe('projects', () => {
    it('should have at least one project', () => {
      expect(projects.length).toBeGreaterThan(0)
    })

    it('should have valid project structure', () => {
      projects.forEach((project) => {
        expect(project.title).toBeDefined()
        expect(project.description).toBeDefined()
        expect(project.tags).toBeInstanceOf(Array)
        expect(project.tags.length).toBeGreaterThan(0)
      })
    })
  })

  describe('featuredArticles', () => {
    it('should have at least one article', () => {
      expect(featuredArticles.length).toBeGreaterThan(0)
    })

    it('should have valid article structure with URLs', () => {
      featuredArticles.forEach((article) => {
        expect(article.title).toBeDefined()
        expect(article.description).toBeDefined()
        expect(article.url).toBeDefined()
        expect(() => new URL(article.url)).not.toThrow()
        expect(article.source).toBeDefined()
        expect(article.category).toBeDefined()
      })
    })
  })

  describe('memberships', () => {
    it('should have at least one membership', () => {
      expect(memberships.length).toBeGreaterThan(0)
    })

    it('should have valid membership structure', () => {
      memberships.forEach((membership) => {
        expect(membership.name).toBeDefined()
        expect(membership.abbreviation).toBeDefined()
        expect(membership.period).toBeDefined()
        expect(membership.description).toBeDefined()
        expect(membership.color).toBeDefined()
      })
    })

    it('should have valid color values', () => {
      const validColors = ['brand', 'emerald', 'cyan']
      memberships.forEach((membership) => {
        expect(validColors).toContain(membership.color)
      })
    })
  })

  describe('navLinks', () => {
    it('should have at least one nav link', () => {
      expect(navLinks.length).toBeGreaterThan(0)
    })

    it('should have valid nav link structure', () => {
      navLinks.forEach((link) => {
        expect(link.label).toBeDefined()
        expect(link.href).toBeDefined()
        expect(link.href.startsWith('#')).toBe(true)
      })
    })

    it('should have unique hrefs', () => {
      const hrefs = navLinks.map((link) => link.href)
      const uniqueHrefs = new Set(hrefs)
      expect(uniqueHrefs.size).toBe(hrefs.length)
    })
  })
})
