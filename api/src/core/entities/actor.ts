export interface ThreatActor {
  id: string;
  name: string;
  aliases: string[];
  motivation?: string;
  description?: string;
  mitreGroupId?: string;
  mitreIds?: string[];
  firstSeen?: string;
  lastSeen?: string;
  active?: boolean;
  targetedSectors?: string[];
  targetedRegions?: string[];
  tools?: string[];
  malware?: string[];
  campaigns?: string[];
}

export interface ActorTimelineEntry {
  date: string;
  title: string;
  description: string;
  type: 'campaign' | 'takedown' | 'attribution' | 'tooling' | 'other';
  source?: string;
  url?: string;
}

export interface ActorCampaign {
  id: string;
  name: string;
  actorId: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'dormant' | 'concluded';
  targets?: string[];
  iocs?: string[];
  description: string;
}
