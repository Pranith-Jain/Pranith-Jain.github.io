import { describe, it, expect } from 'vitest';
import { REPORT_TEMPLATES } from '../../../src/lib/report/templates';

describe('REPORT_TEMPLATES', () => {
  it('defines all four templates with non-empty section lists', () => {
    for (const id of ['ransomware-group', 'threat-actor', 'cve', 'ioc'] as const) {
      const t = REPORT_TEMPLATES[id];
      expect(t).toBeDefined();
      expect(t.sections.length).toBeGreaterThan(2);
      t.sections.forEach((s) => {
        expect(s.id).toBeTruthy();
        expect(s.heading).toBeTruthy();
        expect(s.guidance).toBeTruthy();
      });
    }
  });
  it('section ids are unique within a template', () => {
    for (const t of Object.values(REPORT_TEMPLATES)) {
      const ids = t.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
