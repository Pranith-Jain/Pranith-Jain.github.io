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

/* ─── Error boundary for Globe ──────────────────────────────────────────── */

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
        <div className="flex items-center justify-center h-full min-h-[400px] text-center p-6">
          <div>
            <div className="text-4xl mb-3">🌐</div>
            <p className="text-sm text-slate-400 mb-2">3D Globe failed to render.</p>
            <p className="text-xs text-slate-500 mb-3">
              {this.state.error?.message?.includes('WebGL')
                ? 'WebGL is not available or was blocked by your browser.'
                : 'An error occurred while initializing the 3D globe.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1 text-xs rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Lazy Globe loader ─────────────────────────────────────────────────── */

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
  // Lazy import to avoid SSR issues and to isolate Three.js loading
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
      <div className="flex items-center justify-center h-full min-h-[400px] text-center p-6">
        <div>
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-sm text-slate-400 mb-2">Failed to load 3D globe library.</p>
          <p className="text-xs text-slate-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!Globe) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-sm text-slate-400 animate-pulse">Loading 3D globe…</div>
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

/* ─── Inner Globe component (only rendered after library loads) ─────────── */

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

  // Auto-rotation loop
  useEffect(() => {
    if (!autoRotate) return;
    let lastTime = performance.now();
    const rotate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (!userInteracting.current && globeRef.current) {
        rotAngleRef.current += delta * 5;
        const pov = globeRef.current.pointOfView();
        globeRef.current.pointOfView({ lat: pov.lat, lng: rotAngleRef.current % 360 }, 0);
      }
      rafRef.current = requestAnimationFrame(rotate);
    };
    rafRef.current = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoRotate]);

  // Focus on point change
  useEffect(() => {
    if (focus && globeRef.current) {
      userInteracting.current = true;
      globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.5 }, 1000);
      setTimeout(() => {
        userInteracting.current = false;
      }, 3000);
    }
  }, [focus]);

  // Accessor wrappers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcColor = useCallback((arc: any) => (arc as CtiArc).color, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointColor = useCallback((point: any) => severityColor((point as CtiPoint).severity), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointAltitude = useCallback((point: any) => {
    const p = point as CtiPoint;
    const alts: Record<string, number> = { critical: 0.06, high: 0.04, medium: 0.03, low: 0.02, info: 0.015 };
    return alts[p.severity] ?? 0.02;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointRadius = useCallback((point: any) => {
    const p = point as CtiPoint;
    return Math.min(Math.max(Math.log2(p.count + 1) * 0.8, 0.3), 3);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointLabel = useCallback((point: any) => {
    const p = point as CtiPoint;
    return `<div style="background:rgba(0,0,0,0.85);color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;max-width:250px;">
      <div style="font-weight:bold;margin-bottom:2px;">${p.label}</div>
      <div style="opacity:0.7;">Severity: ${p.severity} · Count: ${p.count}</div>
    </div>`;
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcLabel = useCallback((arc: any) => {
    const a = arc as CtiArc;
    return `<div style="background:rgba(0,0,0,0.85);color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;max-width:280px;">
      ${a.label}
    </div>`;
  }, []);

  // Event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePointClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (point: any) => {
      onPointClick?.(point as CtiPoint);
    },
    [onPointClick]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleArcHover = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (arc: any) => {
      onArcHover?.(arc ? (arc as CtiArc) : null);
    },
    [onArcHover]
  );

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
      bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
      backgroundColor="rgba(0,0,0,0)"
      atmosphereColor="#2c3ee5"
      atmosphereAltitude={0.15}
      arcsData={arcs}
      arcColor={arcColor}
      arcDashLength={0.4}
      arcDashGap={0.2}
      arcDashAnimateTime={2000}
      arcStroke={0.5}
      arcLabel={arcLabel}
      onArcHover={handleArcHover}
      pointsData={points}
      pointColor={pointColor}
      pointAltitude={pointAltitude}
      pointRadius={pointRadius}
      pointLabel={pointLabel}
      onPointClick={handlePointClick}
      pointsMerge={false}
      showAtmosphere={true}
      animateIn={true}
    />
  );
}

/* ─── Props ────────────────────────────────────────────────────────────── */

interface CtiGlobeProps {
  arcs: CtiArc[];
  points: CtiPoint[];
  focus: { lat: number; lng: number } | null;
  onPointClick?: (point: CtiPoint) => void;
  onArcHover?: (arc: CtiArc | null) => void;
  /** When true, globe auto-rotates. Defaults to false (user controls). */
  autoRotate?: boolean;
}

/* ─── Globe wrapper ────────────────────────────────────────────────────── */

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

  // Check WebGL support on mount
  useEffect(() => {
    if (!hasWebGL()) {
      setWebglError(true);
    }
  }, []);

  // Resize observer
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
      <div ref={containerRef} className="w-full h-full min-h-[400px]" style={{ position: 'relative' }}>
        <div className="flex items-center justify-center h-full min-h-[400px] text-center p-6">
          <div>
            <div className="text-4xl mb-3">🌐</div>
            <p className="text-sm text-slate-400 mb-2">3D Globe requires WebGL support.</p>
            <p className="text-xs text-slate-500">
              Your browser may not support WebGL or it may be disabled. Try a different browser or enable hardware
              acceleration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px]" style={{ position: 'relative' }}>
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
