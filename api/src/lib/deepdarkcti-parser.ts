export type DDCStatus = 'online' | 'offline' | 'valid' | 'expired' | 'unknown';

export interface DDCEntry {
  name: string;
  url: string;
  onion: boolean;
  status: DDCStatus;
  category: string;
  source_file: string;
  notes?: string;
  actor?: string;
  attack_type?: string;
}

export interface DDCFileConfig {
  file: string;
  label: string;
  shape: 'link-first' | 'raw-url-first';
  /** raw-url-first: 0-based column holding the display name. */
  nameCol?: number;
  /** raw-url-first actor files: 0-based columns for actor + attack type. */
  actorCol?: number;
  attackTypeCol?: number;
}

export const PER_FILE_CAP = 500;

export const DDC_FILES: DDCFileConfig[] = [
  { file: 'ransomware_gang.md', label: 'Ransomware Gangs', shape: 'link-first' },
  {
    file: 'telegram_threat_actors.md',
    label: 'Threat-Actor Telegram',
    shape: 'raw-url-first',
    nameCol: 2,
    actorCol: 2,
    attackTypeCol: 3,
  },
  { file: 'telegram_infostealer.md', label: 'Infostealer Telegram', shape: 'raw-url-first', nameCol: 2 },
  { file: 'forum.md', label: 'Criminal Forums', shape: 'link-first' },
  { file: 'markets.md', label: 'Dark Markets', shape: 'link-first' },
  { file: 'search_engines.md', label: 'Dark-Web Search Engines', shape: 'link-first' },
  { file: 'phishing.md', label: 'Phishing Resources', shape: 'link-first' },
  { file: 'maas.md', label: 'Malware-as-a-Service', shape: 'link-first' },
  { file: 'rat.md', label: 'RAT Tooling', shape: 'link-first' },
  { file: 'exploits.md', label: 'Exploit Sources', shape: 'link-first' },
  { file: 'malware_samples.md', label: 'Malware Sample Repos', shape: 'link-first' },
  { file: 'discord.md', label: 'Discord Servers', shape: 'link-first' },
  { file: 'twitter.md', label: 'Researcher Twitter', shape: 'raw-url-first', nameCol: 1 },
  {
    file: 'twitter_threat_actors.md',
    label: 'Threat-Actor Twitter',
    shape: 'raw-url-first',
    nameCol: 1,
    actorCol: 1,
    attackTypeCol: 2,
  },
  { file: 'counterfeit_goods.md', label: 'Counterfeit Goods', shape: 'link-first' },
  { file: 'commercial_services.md', label: 'Commercial CTI Services', shape: 'link-first' },
  { file: 'defacement.md', label: 'Defacement Archives', shape: 'link-first' },
  { file: 'others.md', label: 'Other Sources', shape: 'link-first' },
];

const STATUS_TOKENS = new Set<DDCStatus>(['online', 'offline', 'valid', 'expired']);
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isOnion(url: string): boolean {
  return /\.onion(?:[/:?#]|$)/i.test(url);
}

function lastSegment(url: string): string {
  const m = url.replace(/\/+$/, '').match(/\/([^/]+)$/);
  return m ? m[1]! : url;
}

/** Split a markdown table row on `|`, dropping the two bounding-pipe empties. */
function splitRow(line: string): string[] {
  const parts = line.split('|');
  if (parts.length && parts[0]!.trim() === '') parts.shift();
  if (parts.length && parts[parts.length - 1]!.trim() === '') parts.pop();
  return parts.map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\|?[\s:-]*-{2,}[\s|:-]*$/.test(line.trim()) && line.includes('-');
}

export function parseDDCFile(content: string, cfg: DDCFileConfig): DDCEntry[] {
  const lines = content.split(/\r?\n/);
  let i = 0;
  // Find the header (first pipe line).
  while (i < lines.length && !lines[i]!.trim().startsWith('|')) i++;
  if (i >= lines.length) return [];
  i++; // consume header
  // Consume the separator line if present.
  if (i < lines.length && isSeparator(lines[i]!)) i++;

  const out: DDCEntry[] = [];
  for (; i < lines.length && out.length < PER_FILE_CAP; i++) {
    const raw = lines[i]!;
    if (!raw.trim().startsWith('|')) continue;
    const cells = splitRow(raw);
    if (cells.length === 0) continue;

    let name = '';
    let url = '';
    const consumed = new Set<number>();

    if (cfg.shape === 'link-first') {
      const m = cells[0]!.match(LINK_RE);
      if (m) {
        name = m[1]!.trim();
        url = m[2]!.trim();
      } else if (isUrl(cells[0]!)) {
        url = cells[0]!.trim();
        try {
          name = new URL(url).host;
        } catch {
          name = url;
        }
      } else {
        continue; // no link → skip row
      }
      consumed.add(0);
    } else {
      if (!isUrl(cells[0]!)) continue;
      url = cells[0]!.trim();
      consumed.add(0);
      const nameIdx = cfg.actorCol ?? cfg.nameCol;
      const nm = nameIdx != null ? (cells[nameIdx] ?? '').trim() : '';
      name = nm || lastSegment(url);
    }

    // Status: scan every cell for a recognized token (first match wins).
    let status: DDCStatus = 'unknown';
    for (let k = 0; k < cells.length; k++) {
      const tok = cells[k]!.trim().toLowerCase();
      if (STATUS_TOKENS.has(tok as DDCStatus)) {
        status = tok as DDCStatus;
        consumed.add(k);
        break;
      }
    }

    const entry: DDCEntry = {
      name,
      url,
      onion: isOnion(url),
      status,
      category: cfg.label,
      source_file: cfg.file,
    };

    if (cfg.actorCol != null) {
      const a = (cells[cfg.actorCol] ?? '').trim();
      if (a) {
        entry.actor = a;
        consumed.add(cfg.actorCol);
      }
    }
    if (cfg.attackTypeCol != null) {
      const at = (cells[cfg.attackTypeCol] ?? '').trim();
      if (at) {
        entry.attack_type = at;
        consumed.add(cfg.attackTypeCol);
      }
    }
    if (cfg.nameCol != null) consumed.add(cfg.nameCol);

    const notes = cells
      .filter((_, k) => !consumed.has(k))
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' · ');
    if (notes) entry.notes = notes;

    out.push(entry);
  }
  return out;
}
