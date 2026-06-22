/**
 * ASCII Relationship Graph — render entity relationships as box-drawing art.
 *
 * Inspired by CTI Expert's /render entities, /render network, /graph commands.
 * Uses Unicode box-drawing characters for terminal-compatible output.
 */

export interface GraphNode {
  id: string;
  type:
    | 'person'
    | 'domain'
    | 'org'
    | 'username'
    | 'email'
    | 'ip'
    | 'phone'
    | 'location'
    | 'asset'
    | 'device'
    | 'crypto'
    | 'custom';
  label: string;
  trustScore: number; // 1–5
  verified?: boolean;
}

export interface GraphEdge {
  from: string; // node id
  to: string; // node id
  relationship: string;
  strength: 'confirmed' | 'probable' | 'possible';
}

const NODE_ICONS: Record<string, string> = {
  person: '👤',
  domain: '🌐',
  org: '🏢',
  username: '@',
  email: '📧',
  ip: '🖥',
  phone: '📱',
  location: '📍',
  asset: '📦',
  device: '🖥️',
  crypto: '💰',
  custom: '🏷️',
};

function padRight(str: string, len: number): string {
  // Account for emoji width (each emoji = 2 columns)
  const stripped = str.replace(/[\u{1F000}-\u{1FFFF}]/gu, 'XX');
  const diff = len - [...stripped].length;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function nodeWidth(node: GraphNode): number {
  const icon = NODE_ICONS[node.type] || '•';
  const trust = `[${node.trustScore}/5]`;
  const text = `${icon} ${node.label} ${trust}`;
  return [...text.replace(/[\u{1F000}-\u{1FFFF}]/gu, 'XX')].length;
}

function renderNodeBox(node: GraphNode, width: number): string {
  const icon = NODE_ICONS[node.type] || '•';
  const trust = `[${node.trustScore}/5]`;
  const text = `${icon} ${node.label} ${trust}`;
  const bordered = node.verified ? '┌──┐' : '┌ ─ ┐';
  const inner = padRight(text, width - 4);
  const top = bordered === '┌──┐' ? `┌${'─'.repeat(width - 2)}┐` : `┌ ${'─'.repeat(width - 3)}┐`;
  const bottom = bordered === '┌──┐' ? `└${'─'.repeat(width - 2)}┘` : `└ ${'─'.repeat(width - 3)}┘`;
  return `${top}\n│ ${inner}│\n${bottom}`;
}

export interface GraphLayoutOptions {
  maxWidth?: number; // max terminal width (default 80)
  orientation?: 'horizontal' | 'vertical';
  title?: string;
}

/**
 * Render nodes and edges as ASCII box-drawing art.
 * Simple layout: nodes in columns, edges as labeled lines between them.
 */
export function renderAsciiGraph(nodes: GraphNode[], edges: GraphEdge[], opts?: GraphLayoutOptions): string {
  const maxW = opts?.maxWidth || 80;
  const lines: string[] = [];

  if (opts?.title) {
    const titleLen = opts.title.length + 4;
    const pad = Math.max(0, Math.floor((maxW - titleLen) / 2));
    lines.push(' '.repeat(pad) + `╭${'─'.repeat(titleLen)}╮`);
    lines.push(' '.repeat(pad) + `│ ${opts.title} │`);
    lines.push(' '.repeat(pad) + `╰${'─'.repeat(titleLen)}╯`);
    lines.push('');
  }

  if (nodes.length === 0) {
    lines.push('(no entities to display)');
    return lines.join('\n');
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeWidths = new Map(nodes.map((n) => [n.id, nodeWidth(n)]));

  if (nodes.length <= 3) {
    // Horizontal layout for small graphs
    const boxWidths = nodes.map((n) => nodeWidths.get(n.id)!);
    const maxBoxWidth = Math.max(...boxWidths, 20);
    const totalWidth = nodes.length * (maxBoxWidth + 4) - 4;
    const startPad = Math.max(0, Math.floor((maxW - totalWidth) / 2));

    // Render nodes side by side
    const boxes = nodes.map((n) => renderNodeBox(n, maxBoxWidth).split('\n'));
    const maxLines = Math.max(...boxes.map((b) => b.length));

    for (let i = 0; i < maxLines; i++) {
      const parts = boxes.map((b) => {
        const line = b[i] || ' '.repeat(maxBoxWidth + 2);
        return line;
      });
      lines.push(' '.repeat(startPad) + parts.join('   '));
    }

    // Render edges below
    lines.push('');
    for (const edge of edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const fromIdx = nodes.indexOf(fromNode);
      const toIdx = nodes.indexOf(toNode);
      if (fromIdx === -1 || toIdx === -1) continue;

      const fromLabel = `${NODE_ICONS[fromNode.type]} ${fromNode.label}`;
      const toLabel = `${NODE_ICONS[toNode.type]} ${toNode.label}`;

      const arrowLine = edge.strength === 'confirmed' ? `═══▶` : edge.strength === 'probable' ? `···▶` : `- -▶`;

      lines.push(`${fromLabel} ${arrowLine} ${toLabel} [${edge.relationship}]`);
    }
  } else {
    // Vertical layout for larger graphs
    const maxLabelW = Math.max(...nodes.map((n) => nodeWidths.get(n.id)!), 20);

    // Print nodes in a column
    for (const node of nodes) {
      const box = renderNodeBox(node, Math.min(maxLabelW + 6, maxW - 4));
      for (const line of box.split('\n')) {
        lines.push('  ' + line);
      }
      lines.push('');
    }

    // Print edges
    lines.push('  Connections:');
    for (const edge of edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;
      const arrowChar = edge.strength === 'confirmed' ? '▶' : edge.strength === 'probable' ? '▷' : '▹';
      const lineChar = edge.strength === 'confirmed' ? '═' : edge.strength === 'probable' ? '─' : '·';

      const fromLabel = `${NODE_ICONS[fromNode.type]} ${fromNode.label}`;
      const toLabel = `${NODE_ICONS[toNode.type]} ${toNode.label}`;

      lines.push(`  ${fromLabel} ${lineChar}${lineChar}${lineChar}${arrowChar} [${edge.relationship}] ${toLabel}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render a timeline as ASCII Gantt-style chart.
 */
export function renderAsciiTimeline(events: Array<{ date: string; description: string }>): string {
  if (events.length === 0) return '(no timeline events)';

  const lines: string[] = [];
  const maxDescLen = Math.max(...events.map((e) => e.description.length), 20);

  lines.push('Timeline');
  lines.push('─'.repeat(maxDescLen + 20));

  for (const event of events) {
    const date = event.date.padEnd(12);
    const desc =
      event.description.length > maxDescLen
        ? event.description.slice(0, maxDescLen - 3) + '...'
        : event.description.padEnd(maxDescLen);
    lines.push(`${date} ├── ${desc}`);
  }

  return lines.join('\n');
}

/**
 * Render an exposure heatmap as ASCII bar chart.
 */
export function renderAsciiRiskHeatmap(dimensions: Array<{ name: string; score: number }>): string {
  if (dimensions.length === 0) return '(no risk dimensions)';

  const lines: string[] = [];
  const maxNameLen = Math.max(...dimensions.map((d) => d.name.length));

  lines.push('Risk Assessment Heatmap');
  lines.push('─'.repeat(maxNameLen + 35));

  for (const dim of dimensions) {
    const barLen = Math.round(dim.score / 2.5); // 0–40 chars
    const name = dim.name.padEnd(maxNameLen);
    const bar = '█'.repeat(barLen) + '░'.repeat(40 - barLen);
    const score = `${dim.score}`.padStart(3);
    lines.push(`${name} ${bar} ${score}/100`);
  }

  return lines.join('\n');
}
