export {
  withLastGood,
  fetchKev,
  fetchNvdRecent,
  fetchCirclRecent,
  resolveCirclCveId,
  resolveCirclPublished,
  resolveCirclBaseScore,
  fetchNvdByIds,
  fetchFeedResilient,
} from './feeds';

export {
  isoDate,
  isoYearWeek,
  startOfIsoWeek,
  expectedWeeklySlug,
  normalizeVictimKey,
  canonicalGangKeys,
  buildSections,
  bucketIocs,
  buildStats,
  buildLlmExecutiveSummary,
  isBriefingRich,
  isBriefingDegraded,
  briefingNeedsHeal,
  dailyNeedsCveReenrich,
  dailyNeedsRansomwareReenrich,
  mergeWeeklyWithDailies,
  aggregateWeeklyFromDailies,
  weeklyUndercountsDailies,
  safeJsonParse,
} from './aggregate';

export { buildBriefing, writeBriefing, sweepOldBriefings, listBriefings, readBriefing } from './build';

export {
  BRIEFING_MAX_AGE_DAYS,
  IOC_FEED_SOURCES,
  CATEGORY_RULES,
  SEVERITY_CATEGORIES,
  FALLBACK_CATEGORY,
  MITRE_RULES,
} from './config';

export type {
  BriefingType,
  Severity,
  BriefingFinding,
  BriefingSection,
  BriefingIocBuckets,
  BriefingStats,
  Briefing,
  KevEntry,
  NvdCve,
  CategoryRule,
  WeeklyDailyRollup,
  WeeklyMergeInput,
} from './types';
