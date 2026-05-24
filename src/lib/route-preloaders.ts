/**
 * Route chunk preloaders.
 *
 * Each entry is a dynamic import that points at the SAME module path used in
 * App.tsx's `React.lazy(() => import(...))` call. Vite assigns each module a
 * stable chunk identity by path, so calling these preloaders kicks the chunk
 * fetch and parse early — the lazy() in App.tsx then resolves instantly when
 * the user actually navigates.
 *
 * Wire-up: attach `onMouseEnter` + `onFocus` handlers on internal nav links
 * (Header, AppShell, in-app nav menus) that look up the preloader by path and
 * call it. Repeated calls are cheap — the module is cached after first load.
 */

type Preloader = () => Promise<unknown>;

export const routePreloaders: Record<string, Preloader> = {
  // Portfolio nav
  '/': () => import('../pages/Home'),
  '/about': () => import('../pages/About'),
  '/skills': () => import('../pages/Skills'),
  '/experience': () => import('../pages/Experience'),
  '/projects': () => import('../pages/Projects'),
  '/dfir': () => import('../pages/DFIR'),

  // DFIR app nav
  '/dfir/ioc-check': () => import('../pages/dfir/IocCheck'),
  '/dfir/url-preview': () => import('../pages/dfir/UrlPreview'),
  '/dfir/domain': () => import('../pages/dfir/Domain'),
  '/dfir/cve': () => import('../pages/dfir/Cve'),
  '/dfir/diamond': () => import('../pages/dfir/Diamond'),

  // Threat-intel app nav
  '/threatintel': () => import('../pages/threatintel/Home'),
  '/threatintel/live-iocs': () => import('../pages/threatintel/LiveIocs'),
  '/threatintel/correlation': () => import('../pages/threatintel/IocCorrelation'),
  '/threatintel/actor-timeline': () => import('../pages/threatintel/ActorTimeline'),
  '/threatintel/writeups': () => import('../pages/threatintel/Writeups'),
  '/threatintel/metrics': () => import('../pages/threatintel/Metrics'),
  '/threatintel/status': () => import('../pages/threatintel/FeedStatus'),
  '/threatintel/c2-tracker': () => import('../pages/threatintel/C2Tracker'),
  '/threatintel/domain-monitor': () => import('../pages/threatintel/DomainMonitor'),
  '/threatintel/threat-map': () => {
    // Threat-map's bottleneck is the 190KB world-110m.json topojson on top of
    // the react-simple-maps chunk. Warm both concurrently so the first render
    // doesn't sit on a sequential 250-400ms wait.
    void fetch('/world-110m.json', { credentials: 'omit' }).catch(() => {});
    return import('../pages/dfir/ThreatMap');
  },
  '/threatintel/ransomware-map': () => {
    void fetch('/world-110m.json', { credentials: 'omit' }).catch(() => {});
    return import('../pages/threatintel/RansomwareMap');
  },
  '/threatintel/certstream': () => import('../pages/threatintel/CertStreamLive'),
  '/threatintel/campaign-generator': () => import('../pages/threatintel/CampaignGenerator'),
};

/**
 * Preload a route's chunk. No-op if the path isn't mapped or already loaded.
 */
export function preloadRoute(path: string): void {
  const fn = routePreloaders[path];
  if (fn) void fn().catch(() => {});
}
