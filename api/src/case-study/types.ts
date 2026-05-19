// api/src/case-study/types.ts

export type CaseStudyType =
  | 'cve'
  | 'actor'
  | 'malware'
  | 'ransom'
  | 'breach'
  | 'scam'
  | 'aisec'
  | 'intel'
  | 'osint'
  | 'methodology'
  | 'trend'
  | 'briefing';

export type CandidateStatus = 'pending' | 'approved' | 'skipped' | 'published';

export interface Candidate {
  key: string; // stable key, e.g. "cve-2026-1234"
  type: CaseStudyType;
  title: string;
  rationale: string; // one-line why-this-matters
  score: number; // 0..1
  evidence: Record<string, unknown>; // type-specific snapshot
  discoveredAt: string; // ISO 8601
  status: CandidateStatus;
}

export interface Slot {
  slotAt: string; // ISO 8601
  candidateId: string; // stable key
  status: 'pending' | 'publishing' | 'published' | 'failed';
  publishedSlug?: string;
  error?: string;
}

export interface PostIOC {
  type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'sha256' | 'sha1' | 'md5' | 'email';
  value: string;
}

export interface PostSource {
  url: string;
  title: string;
}

export interface QualityScore {
  total: number;
  breakdown: {
    length: number;
    sections: number;
    depth: number;
    technical: number;
    references: number;
    fillerPenalty: number;
  };
}

/** Deterministic content-QA verdict. `passed: false` gates a publish. */
export interface QaVerdict {
  passed: boolean;
  /** 0-100 — mirrors QualityScore.total at QA time. */
  score: number;
  /** Human-readable QA failures (empty when passed). */
  issues: string[];
}

export interface Post {
  slug: string;
  type: CaseStudyType;
  title: string;
  excerpt: string;
  publishedAt: string; // ISO 8601
  candidateId: string;
  body: string; // markdown
  hero: string; // inline SVG
  iocs: PostIOC[];
  tags: string[];
  sources: PostSource[];
  quality?: QualityScore;
  qa?: QaVerdict;
}

export interface PostIndexEntry {
  slug: string;
  title: string;
  type: CaseStudyType;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

export interface DedupRecord {
  lastSeenAt: string;
  publishedSlug?: string;
}

export interface FailureRecord {
  slotId: string;
  candidateId: string;
  error: string;
  rawOutput?: string;
  failedAt: string;
  retries: number;
}

export interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}
