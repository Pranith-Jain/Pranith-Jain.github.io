export interface CveRecord {
  id: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  cvssScore?: number;
  cvssVector?: string;
  publishedDate: string;
  lastModifiedDate: string;
  affectedPackages?: string[];
  /** Vendor:product pairs extracted from CPE 2.3 criteria (e.g. "apache:log4j"). */
  products?: string[];
  references?: string[];
  kev?: boolean;
  epss?: number;
  exploitAvailable?: boolean;
}
