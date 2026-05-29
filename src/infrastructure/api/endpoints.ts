export const endpoints = {
  cve: {
    search: (id: string) => `/api/v1/cve/lookup?id=${encodeURIComponent(id)}`,
    recent: '/api/v1/cve-recent',
    threatMap: '/api/v1/cve-threat-map',
  },
  ioc: {
    check: '/api/v1/ioc/check',
    lifecycle: (indicator: string) => `/api/v1/ioc-lifecycle?indicator=${encodeURIComponent(indicator)}`,
    stats: '/api/v1/ioc-lifecycle/stats',
    trending: '/api/v1/ioc-lifecycle/trending?limit=50',
    correlation: '/api/v1/ioc-correlation',
    snapshot: '/api/v1/ioc-snapshot',
  },
  domain: {
    lookup: '/api/v1/domain/lookup',
    rep: '/api/v1/domain-rep',
    monitor: '/api/v1/domain-monitor',
  },
  phishing: {
    analyze: '/api/v1/phishing/analyze',
    urls: '/api/v1/phishing-urls',
    fingerprint: '/api/v1/phishing/fingerprint',
  },
  threatIntel: {
    actorTimeline: '/api/v1/actor-timeline',
    actorDna: (id: string) => `/api/v1/threat-intel/actor-dna/${encodeURIComponent(id)}`,
    predictive: {
      attribution: '/api/v1/threat-intel/predictive/attribution',
    },
    campaign: {
      analyze: '/api/v1/threat-intel/campaign/analyze',
      lifecycle: '/api/v1/threat-intel/campaign-lifecycle',
    },
    crossCampaign: '/api/v1/threat-intel/cross-campaign/correlations',
    liveIocs: '/api/v1/live-iocs',
    detections: '/api/v1/detections',
    writeups: '/api/v1/writeups',
    c2Tracker: '/api/v1/c2-tracker',
    threatPulse: '/api/v1/threat-pulse',
    threatMap: '/api/v1/threat-map',
  },
  briefings: {
    list: '/api/v1/briefings/list',
    get: (slug: string) => `/api/v1/briefings/${encodeURIComponent(slug)}`,
    today: '/api/v1/briefings/today',
    rss: '/api/v1/briefings/rss',
  },
  graph: {
    stats: '/api/v1/graph/stats',
    communities: '/api/v1/graph/communities?min_size=2',
    node: (type: string, value: string, depth = 2) =>
      `/api/v1/graph/node/${encodeURIComponent(type)}/${encodeURIComponent(value)}?depth=${depth}`,
    relationships: '/api/v1/relationship-graph',
  },
  ct: {
    monitor: {
      certs: (domain: string) => `/api/v1/ct-monitor/certs?domain=${encodeURIComponent(domain)}&days=30`,
      watched: '/api/v1/ct-monitor/watched',
      watch: '/api/v1/ct-monitor/watch',
    },
  },
  admin: {
    stats: '/api/v1/admin/stats',
    purge: '/api/v1/admin/purge',
    keys: '/api/v1/admin/keys',
  },
} as const;
