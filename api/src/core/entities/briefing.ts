export type BriefingType = 'daily' | 'weekly';

export interface BriefingFinding {
  title: string;
  description: string;
  vendor?: string;
  product?: string;
  severity?: string;
  tags?: string[];
}

export interface BriefingSection {
  title: string;
  findings: BriefingFinding[];
}

export interface Briefing {
  id?: string;
  slug: string;
  type: BriefingType;
  title: string;
  date: string;
  summary: string;
  sections: BriefingSection[];
  tags?: string[];
  published?: boolean;
  created_at?: string;
}
