// Typed client for the ARGUS Threat Intelligence API.
// Works with both the Cloudflare Worker backend and local static data fallback.

import type { Actor, FeedItem } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export interface ActorsResponse {
  actors: Actor[];
  total: number;
}

export interface ActorResponse {
  actor: Actor;
}

export interface FeedResponse {
  feed: FeedItem[];
  total: number;
}

export interface StatsResponse {
  total_actors: number;
  nations: Record<string, number>;
  motivations: Record<string, number>;
  sectors: Record<string, number>;
  total_ttps: number;
  total_malware: number;
  total_cves: number;
}

export interface HealthResponse {
  status: string;
  environment: string;
  actors: number;
  endpoints: string[];
}

export const api = {
  getActors: (params?: { country?: string; motivation?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.country) qs.set('country', params.country);
    if (params?.motivation) qs.set('motivation', params.motivation);
    if (params?.q) qs.set('q', params.q);
    const q = qs.toString();
    return apiFetch<ActorsResponse>(`/api/actors${q ? `?${q}` : ''}`);
  },

  getActor: (id: string) => apiFetch<ActorResponse>(`/api/actors/${id}`),

  getFeed: (category?: string) => {
    const q = category ? `?category=${category}` : '';
    return apiFetch<FeedResponse>(`/api/feed${q}`);
  },

  getStats: () => apiFetch<StatsResponse>('/api/stats'),

  getStixBundle: () => fetch(`${API_BASE}/api/stix/bundle`).then(r => r.json()),

  getStixBundleForActor: (id: string) => fetch(`${API_BASE}/api/stix/bundle/${id}`).then(r => r.json()),

  getTaxiiDiscovery: () => fetch(`${API_BASE}/api/taxii2/`).then(r => r.json()),

  getTaxiiCollections: () => fetch(`${API_BASE}/api/taxii2/collections/`).then(r => r.json()),

  health: () => apiFetch<HealthResponse>('/api/health'),
};
