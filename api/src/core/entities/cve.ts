export interface CveRecord {
  id: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  cvssScore?: number;
  cvssVector?: string;
  publishedDate: string;
  lastModifiedDate: string;
  affectedPackages?: string[];
  references?: string[];
  kev?: boolean;
  epss?: number;
  exploitAvailable?: boolean;
}
