import { describe, it, expect } from 'vitest';
import { parseDDCFile, DDC_FILES, PER_FILE_CAP, type DDCFileConfig } from '../../src/lib/deepdarkcti-parser';

const cfg = (file: string): DDCFileConfig => {
  const c = DDC_FILES.find((f) => f.file === file);
  if (!c) throw new Error(`no config for ${file}`);
  return c;
};

describe('DDC_FILES config', () => {
  it('covers exactly the 18 in-scope files', () => {
    expect(DDC_FILES).toHaveLength(18);
    expect(DDC_FILES.map((f) => f.file)).toContain('ransomware_gang.md');
    expect(DDC_FILES.map((f) => f.file)).not.toContain('cve_most_exploited.md');
    expect(DDC_FILES.map((f) => f.file)).not.toContain('methods.md');
  });
});

describe('parseDDCFile — link-first', () => {
  const md = [
    '|Name|Status|Description|',
    '| ------ | ------ | ------ |',
    '|[0x00sec](https://0x00sec.org/)| ONLINE | A forum |',
    '|[DarkMkt](http://abcdefghijklmnop234567.onion/index.php)|OFFLINE||',
    '|broken row no link|ONLINE||',
  ].join('\n');

  it('extracts name+url from the markdown link, scans status, builds notes', () => {
    const out = parseDDCFile(md, cfg('forum.md'));
    expect(out).toHaveLength(2); // broken row skipped
    expect(out[0]).toEqual({
      name: '0x00sec',
      url: 'https://0x00sec.org/',
      onion: false,
      status: 'online',
      category: 'Criminal Forums',
      source_file: 'forum.md',
      notes: 'A forum',
    });
  });

  it('detects onion + offline status', () => {
    const out = parseDDCFile(md, cfg('forum.md'));
    expect(out[1]!.onion).toBe(true);
    expect(out[1]!.status).toBe('offline');
    expect(out[1]!.notes).toBeUndefined();
  });
});

describe('parseDDCFile — raw-url-first (infostealer)', () => {
  const md = [
    '|Telegram|Status|Name|',
    '| ------ | ------ | ------ |',
    '|https://t.me/berserklogs|ONLINE|Redline Stealer|',
    '|not-a-url|VALID|junk|',
  ].join('\n');

  it('uses cell0 as url and nameCol for the name; skips non-url rows', () => {
    const out = parseDDCFile(md, cfg('telegram_infostealer.md'));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      name: 'Redline Stealer',
      url: 'https://t.me/berserklogs',
      onion: false,
      status: 'online',
      category: 'Infostealer Telegram',
      source_file: 'telegram_infostealer.md',
    });
  });
});

describe('parseDDCFile — raw-url-first actor (telegram_threat_actors)', () => {
  const md = [
    '|Telegram|Status|Threat Actor Name|Type of attacks|',
    '|------|------|------|------|',
    '|https://t.me/+B3LXsqUjJcs4ZGI0|EXPIRED|NoName057(16)|DDoS|',
    '|https://t.me/+xy|VALID||',
  ].join('\n');

  it('captures actor + attack_type structured fields', () => {
    const out = parseDDCFile(md, cfg('telegram_threat_actors.md'));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      name: 'NoName057(16)',
      url: 'https://t.me/+B3LXsqUjJcs4ZGI0',
      onion: false,
      status: 'expired',
      category: 'Threat-Actor Telegram',
      source_file: 'telegram_threat_actors.md',
      actor: 'NoName057(16)',
      attack_type: 'DDoS',
    });
  });

  it('falls back to URL last-segment when actor name is blank', () => {
    const out = parseDDCFile(md, cfg('telegram_threat_actors.md'));
    expect(out[1]!.name).toBe('+xy');
    expect(out[1]!.actor).toBeUndefined();
  });
});

describe('parseDDCFile — raw-url-first actor (twitter_threat_actors)', () => {
  const md = [
    '|Link| Description | Category | Status |',
    '| ------ | ------ | ------ | ------ |',
    '|https://x.com/lockbitsupp| LockBit | Ransomware | |',
    '|https://x.com/DarkstormTeam1| Dark Storm | DDoS | OFFLINE |',
  ].join('\n');

  it('maps Description→actor, Category→attack_type, scans Status anywhere', () => {
    const out = parseDDCFile(md, cfg('twitter_threat_actors.md'));
    expect(out[0]).toEqual({
      name: 'LockBit',
      url: 'https://x.com/lockbitsupp',
      onion: false,
      status: 'unknown',
      category: 'Threat-Actor Twitter',
      source_file: 'twitter_threat_actors.md',
      actor: 'LockBit',
      attack_type: 'Ransomware',
    });
    expect(out[1]!.status).toBe('offline');
  });
});

describe('parseDDCFile — caps + edge cases', () => {
  it(`caps at PER_FILE_CAP (${PER_FILE_CAP})`, () => {
    const rows = Array.from({ length: PER_FILE_CAP + 25 }, (_, i) => `|[s${i}](https://s${i}.example.com)|ONLINE||`);
    const md = ['|Name|Status|Description|', '|---|---|---|', ...rows].join('\n');
    expect(parseDDCFile(md, cfg('forum.md'))).toHaveLength(PER_FILE_CAP);
  });

  it('returns [] for content with a header but no data rows', () => {
    expect(parseDDCFile('|Name|Status|\n|---|---|', cfg('search_engines.md'))).toEqual([]);
  });

  it('returns [] for empty / non-table content', () => {
    expect(parseDDCFile('', cfg('forum.md'))).toEqual([]);
    expect(parseDDCFile('just prose, no pipes', cfg('forum.md'))).toEqual([]);
  });
});
