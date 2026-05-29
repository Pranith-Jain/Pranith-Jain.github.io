import { api } from '../../lib/api-client';
import { endpoints } from './endpoints';

export interface CveEntry {
  id: string;
  description: string;
  severity: string;
  cvssScore?: number;
  publishedDate: string;
  kev?: boolean;
  epss?: number;
}

export interface IocLifecycle {
  indicator: string;
  type: string;
  firstSeen: string;
  lastSeen: string;
  verdict: string;
  sources: number;
}

export interface BriefingMeta {
  slug: string;
  type: 'daily' | 'weekly';
  title: string;
  date: string;
  summary: string;
  published: boolean;
}

export const typedApi = {
  cve: {
    search(id: string) {
      return api.get<CveEntry>(endpoints.cve.search(id));
    },
    recent() {
      return api.get<CveEntry[]>(endpoints.cve.recent);
    },
  },
  ioc: {
    lifecycle(indicator: string) {
      return api.get<{ found?: boolean; lifecycle?: IocLifecycle }>(endpoints.ioc.lifecycle(indicator));
    },
    stats() {
      return api.get<{ stats?: Record<string, number> }>(endpoints.ioc.stats);
    },
    trending() {
      return api.get<{ trending?: IocLifecycle[] }>(endpoints.ioc.trending);
    },
  },
  briefings: {
    list(type?: string, limit?: number) {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return api.get<BriefingMeta[]>(`${endpoints.briefings.list}${qs ? `?${qs}` : ''}`);
    },
    get(slug: string) {
      return api.get<BriefingMeta>(endpoints.briefings.get(slug));
    },
  },
  graph: {
    stats() {
      return api.get<{ nodes?: number; edges?: number }>(endpoints.graph.stats);
    },
    communities() {
      return api.get<{ communities?: Array<{ id: string; size: number }> }>(endpoints.graph.communities);
    },
  },
  ct: {
    watched() {
      return api.get<{ watched?: Array<{ domain: string; added: string }> }>(endpoints.ct.monitor.watched);
    },
    certs(domain: string) {
      return api.get<{ certs?: Array<{ subject: string; issuer: string; notAfter: string }> }>(
        endpoints.ct.monitor.certs(domain)
      );
    },
    watch(domain: string) {
      return api.post<void>(endpoints.ct.monitor.watch, { domain });
    },
    unwatch(domain: string) {
      return api.delete(`/api/v1/ct-monitor/watch/${encodeURIComponent(domain)}`);
    },
  },
};
