import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CtiArc, CtiPoint } from './geo';
import { severityColor } from './geo';

/* ─── WebGL detection ───────────────────────────────────────────────────── */

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/* ─── Error boundary ────────────────────────────────────────────────────── */

interface GlobeErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobeErrorBoundary extends Component<{ children: ReactNode }, GlobeErrorBoundaryState> {
  state: GlobeErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): GlobeErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    console.error('Globe rendering error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-[#0a0f1a]">
          <div className="text-center p-6 max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-300 mb-1">Globe Unavailable</p>
            <p className="text-xs text-slate-500 mb-4">
              {this.state.error?.message?.includes('WebGL')
                ? 'WebGL is not supported in your browser'
                : 'Failed to initialize 3D renderer'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 text-xs font-mono rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface RingDatum {
  lat: number;
  lng: number;
  size: number;
  color: string;
}

/* ─── Globe Renderer ────────────────────────────────────────────────────── */

function GlobeRenderer({
  arcs,
  points,
  focus,
  onPointClick,
  onArcHover,
  autoRotate,
  width,
  height,
}: {
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  autoRotate: boolean;
  width: number;
  height: number;
}) {
  const [Globe, setGlobe] = useState<(typeof import('react-globe.gl'))['default'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('react-globe.gl')
      .then((mod) => {
        if (!cancelled) setGlobe(() => mod.default);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load globe library');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0a0f1a]">
        <div className="text-center p-6">
          <p className="text-sm text-slate-400 mb-2">Failed to load globe</p>
          <p className="text-xs text-slate-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!Globe) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#0a0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-blue-500/20" />
            <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Initializing Globe</p>
            <p className="text-xs text-slate-500 mt-1">Loading 3D renderer…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <GlobeInner
      Globe={Globe}
      arcs={arcs}
      points={points}
      focus={focus}
      onPointClick={onPointClick}
      onArcHover={onArcHover}
      autoRotate={autoRotate}
      width={width}
      height={height}
    />
  );
}

/* ─── Inner Globe ───────────────────────────────────────────────────────── */

function GlobeInner({
  Globe,
  arcs,
  points,
  focus,
  onPointClick,
  onArcHover,
  autoRotate,
  width,
  height,
}: {
  Globe: (typeof import('react-globe.gl'))['default'];
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  autoRotate: boolean;
  width: number;
  height: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const rotAngleRef = useRef(0);
  const rafRef = useRef(0);
  const userInteracting = useRef(false);
  const [hoveredPoint, setHoveredPoint] = useState<CtiPoint | null>(null);

  // Ring data for critical/high severity points
  const ringData: RingDatum[] = points
    .filter((p) => p.severity === 'critical' || p.severity === 'high')
    .slice(0, 60)
    .map((p) => ({
      lat: p.lat,
      lng: p.lng,
      size: p.severity === 'critical' ? 3.0 : 2.0,
      color: severityColor(p.severity),
    }));

  // Label data for critical points
  const labelData = points
    .filter((p) => p.severity === 'critical')
    .slice(0, 25)
    .map((p) => ({
      lat: p.lat,
      lng: p.lng,
      text: p.label.length > 28 ? p.label.slice(0, 28) + '…' : p.label,
      color: severityColor(p.severity),
    }));

  // Auto-rotation
  useEffect(() => {
    if (!autoRotate) return;
    let lastTime = performance.now();
    const rotate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (!userInteracting.current && globeRef.current) {
        rotAngleRef.current += delta * 2.5;
        const pov = globeRef.current.pointOfView();
        globeRef.current.pointOfView({ lat: pov.lat, lng: rotAngleRef.current % 360 }, 0);
      }
      rafRef.current = requestAnimationFrame(rotate);
    };
    rafRef.current = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoRotate]);

  // Focus on point
  useEffect(() => {
    if (focus && globeRef.current) {
      userInteracting.current = true;
      globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.5 }, 1200);
      setTimeout(() => {
        userInteracting.current = false;
      }, 4000);
    }
  }, [focus]);

  // Accessors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcColor = useCallback((arc: any) => (arc as CtiArc).color, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointColor = useCallback((point: any) => severityColor((point as CtiPoint).severity), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointAltitude = useCallback((point: any) => {
    const alts: Record<string, number> = { critical: 0.12, high: 0.07, medium: 0.045, low: 0.03, info: 0.02 };
    return alts[(point as CtiPoint).severity] ?? 0.03;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointRadius = useCallback((point: any) => {
    const sizes: Record<string, number> = { critical: 1.5, high: 1.1, medium: 0.7, low: 0.5, info: 0.35 };
    return sizes[(point as CtiPoint).severity] ?? 0.6;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointLabel = useCallback((point: any) => {
    const p = point as CtiPoint;
    const sevColor = severityColor(p.severity);
    return `<div style="background:rgba(10,15,26,0.95);color:#e2e8f0;padding:12px 16px;border-radius:10px;font-size:12px;font-family:monospace;max-width:300px;border:1px solid ${sevColor}50;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <div style="font-weight:600;margin-bottom:6px;color:#f8fafc;font-size:13px;">${p.label}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="background:${sevColor}25;color:${sevColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;">${p.severity}</span>
        <span style="opacity:0.6;font-size:11px;">Count: ${p.count}</span>
      </div>
    </div>`;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcLabel = useCallback((arc: any) => {
    const a = arc as CtiArc;
    return `<div style="background:rgba(10,15,26,0.95);color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:11px;font-family:monospace;max-width:280px;border:1px solid ${a.color}40;box-shadow:0 4px 16px rgba(0,0,0,0.4);">${a.label}</div>`;
  }, []);

  // Ring accessors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ringColor = useCallback((ring: any) => (ring as RingDatum).color, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ringMaxRadius = useCallback((ring: any) => (ring as RingDatum).size, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ringAltitude = useCallback(() => 0.005, []);

  // Label accessors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelLat = useCallback((l: any) => l.lat, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelLng = useCallback((l: any) => l.lng, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelText = useCallback((l: any) => l.text, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelColor = useCallback((l: any) => l.color + 'ee', []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelSize = useCallback(() => 0.7, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelAltitude = useCallback(() => 0.14, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelDotRadius = useCallback(() => 0.4, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelResolution = useCallback(() => 3, []);

  // Event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePointClick = useCallback((point: any) => onPointClick?.(point as CtiPoint), [onPointClick]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePointHover = useCallback((point: any) => {
    setHoveredPoint(point ? (point as CtiPoint) : null);
    if (typeof document !== 'undefined') document.body.style.cursor = point ? 'pointer' : 'default';
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleArcHover = useCallback((arc: any) => onArcHover?.(arc ? (arc as CtiArc) : null), [onArcHover]);

  return (
    <div className="relative w-full h-full bg-[#0a0f1a]">
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        // ── Globe Appearance (World Monitor style) ──
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl=""
        backgroundColor="rgba(0,0,0,0)"
        // Atmosphere - bright blue glow like World Monitor
        showAtmosphere={true}
        atmosphereColor="#4f8fff"
        atmosphereAltitude={0.2}
        // No graticules for cleaner look
        showGraticules={false}
        // ── Points ──
        pointsData={points}
        pointColor={pointColor}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        pointLabel={pointLabel}
        onPointClick={handlePointClick}
        onPointHover={handlePointHover}
        pointsMerge={points.length > 100}
        // ── Rings ──
        ringsData={ringData}
        ringColor={ringColor}
        ringMaxRadius={ringMaxRadius}
        ringAltitude={ringAltitude}
        ringRepeatPeriod={1800}
        // ── Labels ──
        labelsData={labelData}
        labelLat={labelLat}
        labelLng={labelLng}
        labelText={labelText}
        labelColor={labelColor}
        labelSize={labelSize}
        labelAltitude={labelAltitude}
        labelDotRadius={labelDotRadius}
        labelResolution={labelResolution}
        // ── Arcs ──
        arcsData={arcs}
        arcColor={arcColor}
        arcDashLength={0.6}
        arcDashGap={0.05}
        arcDashAnimateTime={2500}
        arcStroke={0.4}
        arcLabel={arcLabel}
        onArcHover={handleArcHover}
        // ── Animation ──
        animateIn={true}
      />

      {/* Hovered Point Info */}
      {hoveredPoint && (
        <div className="absolute top-4 left-4 bg-[#0f1629]/90 backdrop-blur-sm rounded-lg border border-slate-700/50 px-3 py-2 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: severityColor(hoveredPoint.severity) }} />
            <span className="text-xs font-mono text-slate-300">{hoveredPoint.label}</span>
          </div>
        </div>
      )}

      {/* Stats Overlay */}
      <div className="absolute bottom-4 left-4 bg-[#0f1629]/80 backdrop-blur-sm rounded-lg border border-slate-700/50 px-3 py-1.5 pointer-events-none">
        <span className="text-[10px] font-mono text-slate-400">
          {points.length} points · {arcs.length} arcs
        </span>
      </div>
    </div>
  );
}

/* ─── Props ────────────────────────────────────────────────────────────── */

interface CtiGlobeProps {
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  autoRotate?: boolean;
}

/* ─── Main Export ───────────────────────────────────────────────────────── */

export default function CtiGlobe({
  arcs,
  points,
  focus,
  onPointClick,
  onArcHover,
  autoRotate = false,
}: CtiGlobeProps): JSX.Element {
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) setWebglError(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          w: Math.floor(entry.contentRect.width),
          h: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (webglError) {
    return (
      <div ref={containerRef} className="w-full h-full min-h-[400px] bg-[#0a0f1a]">
        <div className="flex items-center justify-center h-full text-center p-6">
          <div>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-300 mb-1">WebGL Not Available</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Your browser doesn't support WebGL. Try Chrome, Firefox, or Edge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] bg-[#0a0f1a] overflow-hidden">
      <GlobeErrorBoundary>
        <GlobeRenderer
          arcs={arcs}
          points={points}
          focus={focus}
          onPointClick={onPointClick}
          onArcHover={onArcHover}
          autoRotate={autoRotate}
          width={dimensions.w}
          height={dimensions.h}
        />
      </GlobeErrorBoundary>
    </div>
  );
}
