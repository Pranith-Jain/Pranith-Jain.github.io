export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SimLink {
  source: string;
  target: string;
}

export interface SimulationOptions {
  alpha?: number;
  alphaMin?: number;
  alphaDecay?: number;
  velocityDecay?: number;
  repulsionStrength?: number;
  attractionStrength?: number;
  attractionDistance?: number;
  centeringStrength?: number;
}

export class ForceSimulation {
  nodes: SimNode[];
  links: SimLink[];
  alpha: number;
  alphaMin: number;
  alphaDecay: number;
  velocityDecay: number;
  repulsionStrength: number;
  attractionStrength: number;
  attractionDistance: number;
  centeringStrength: number;

  private tickId: number | null = null;
  private tickCallbacks: Array<() => void> = [];
  private endCallbacks: Array<() => void> = [];

  constructor(nodes: SimNode[], links: SimLink[], opts: SimulationOptions = {}) {
    this.nodes = nodes;
    this.links = links;
    this.alpha = opts.alpha ?? 1;
    this.alphaMin = opts.alphaMin ?? 0.001;
    this.alphaDecay = opts.alphaDecay ?? 0.02;
    this.velocityDecay = opts.velocityDecay ?? 0.35;
    this.repulsionStrength = opts.repulsionStrength ?? 400;
    this.attractionStrength = opts.attractionStrength ?? 0.04;
    this.attractionDistance = opts.attractionDistance ?? 120;
    this.centeringStrength = opts.centeringStrength ?? 0.01;
  }

  on(type: 'tick' | 'end', fn: () => void): void {
    if (type === 'tick') this.tickCallbacks.push(fn);
    if (type === 'end') this.endCallbacks.push(fn);
  }

  start(): void {
    if (this.tickId !== null) return;
    const tick = () => {
      this.tick();
      for (const fn of this.tickCallbacks) fn();
      if (this.alpha >= this.alphaMin) {
        this.tickId = requestAnimationFrame(tick);
      } else {
        this.stop();
        for (const fn of this.endCallbacks) fn();
      }
    };
    this.tickId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.tickId !== null) {
      cancelAnimationFrame(this.tickId);
      this.tickId = null;
    }
  }

  restart(): void {
    this.alpha = 1;
    this.stop();
    this.start();
  }

  private tick(): void {
    this.alpha *= 1 - this.alphaDecay;
    const n = this.nodes.length;

    if (n > 1) {
      const repK = this.repulsionStrength * this.alpha;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = this.nodes[i]!;
          const b = this.nodes[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = Math.max(dx * dx + dy * dy, 1);
          const dist = Math.sqrt(distSq);
          const force = repK / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    const springK = this.attractionStrength * this.alpha;
    for (const link of this.links) {
      const s = this.nodes.find((sn) => sn.id === link.source);
      const t = this.nodes.find((sn) => sn.id === link.target);
      if (!s || !t) continue;
      let dx = t.x - s.x;
      let dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const delta = dist - this.attractionDistance;
      const force = delta * springK;
      dx /= dist;
      dy /= dist;
      s.vx += dx * force;
      s.vy += dy * force;
      t.vx -= dx * force;
      t.vy -= dy * force;
    }

    let cx = 0;
    let cy = 0;
    for (const node of this.nodes) {
      cx += node.x;
      cy += node.y;
    }
    cx /= n;
    cy /= n;
    for (const node of this.nodes) {
      node.vx += (cx - node.x) * this.centeringStrength;
      node.vy += (cy - node.y) * this.centeringStrength;
    }

    for (const node of this.nodes) {
      node.vx *= 1 - this.velocityDecay;
      node.vy *= 1 - this.velocityDecay;
      node.x += node.vx;
      node.y += node.vy;
    }
  }
}
