import JSZip from 'jszip';

export interface ApkAnalysis {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  permissions: Array<{ name: string; dangerous: boolean }>;
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  dexFiles: Array<{
    name: string;
    size: number;
    version: string;
    classCount: number;
    methodCount: number;
    fieldCount: number;
    entropy: number;
  }>;
  nativeLibs: string[];
  assets: string[];
  certificates: Array<{ path: string; subject: string; issuer: string; serial: string }>;
  fileCount: number;
  urls: string[];
  ips: string[];
  domains: string[];
  apiKeys: string[];
  suspicious: SuspiciousFinding[];
}

export interface SuspiciousFinding {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detail: string;
}

const DANGEROUS_PERMS = new Set([
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.CAMERA',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
]);

// ─── AXML Parser ──────────────────────────────────────────────

function readU16(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}

function readU32(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24);
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    const ch = readU16(buf, off + i * 2);
    if (ch === 0) break;
    out += String.fromCharCode(ch);
  }
  return out;
}

interface AxmlNamespace {
  prefix: string;
  uri: string;
}

interface AxmlTag {
  name: string;
  ns: string;
  attrs: Array<{ name: string; ns: string; value: string; resourceId: number }>;
  depth: number;
}

function parseAxml(buf: Uint8Array): { namespaces: AxmlNamespace[]; tags: AxmlTag[]; strings: string[] } {
  const strings: string[] = [];
  const namespaces: AxmlNamespace[] = [];
  const tags: AxmlTag[] = [];
  const off = 8; // skip header

  // Read string pool (first chunk)
  if (off + 8 > buf.length) return { namespaces, tags, strings };
  const chunkType = readU16(buf, off);
  if (chunkType !== 0x0001) return { namespaces, tags, strings }; // not string pool
  const chunkSize = readU32(buf, off + 4);
  if (off + chunkSize > buf.length) return { namespaces, tags, strings };

  const strCount = readU32(buf, off + 8);
  const styleCount = readU32(buf, off + 12);
  const flags = readU32(buf, off + 16);

  // The string-pool counts are attacker-controlled. Validate them against the
  // real chunk/buffer bounds before using them as loop limits — otherwise a
  // crafted AXML blob drives a multi-billion-iteration read (DoS).
  if (strCount < 0 || styleCount < 0 || strCount > 1_000_000 || styleCount > 1_000_000) {
    return { namespaces, tags, strings };
  }
  if (off + 28 + strCount * 4 + styleCount * 4 > Math.min(off + chunkSize, buf.length)) {
    return { namespaces, tags, strings };
  }

  const strOffsets: number[] = [];
  for (let i = 0; i < strCount; i++) {
    strOffsets.push(readU32(buf, off + 28 + i * 4));
  }

  const isUtf8 = (flags & 0x100) !== 0;
  const poolStart = off + 28 + strCount * 4 + styleCount * 4;
  for (let i = 0; i < strCount; i++) {
    const strOff = poolStart + strOffsets[i]!;
    if (isUtf8) {
      const actualLen = buf[strOff + 1]!;
      strings.push(new TextDecoder('utf-8').decode(buf.slice(strOff + 2, strOff + 2 + actualLen)));
    } else {
      const strLen = readU16(buf, strOff);
      strings.push(readString(buf, strOff + 2, strLen));
    }
  }

  // Parse XML chunks
  let xmlOff = off + chunkSize;
  const tagStack: string[] = [];

  while (xmlOff + 8 <= buf.length) {
    const type = readU16(buf, xmlOff);
    const size = readU32(buf, xmlOff + 4);

    if (type === 0x0100) {
      // START_NAMESPACE
      const prefixIdx = readU32(buf, xmlOff + 8);
      const uriIdx = readU32(buf, xmlOff + 12);
      if (prefixIdx < strings.length && uriIdx < strings.length) {
        namespaces.push({ prefix: strings[prefixIdx]!, uri: strings[uriIdx]! });
      }
    } else if (type === 0x0102) {
      // START_TAG
      const nsIdx = readU32(buf, xmlOff + 12);
      const nameIdx = readU32(buf, xmlOff + 16);
      const attrCount = readU16(buf, xmlOff + 24);
      const tagName = nameIdx < strings.length ? strings[nameIdx]! : `tag${nameIdx}`;
      const tagNs = nsIdx > 0 && nsIdx < strings.length ? strings[nsIdx]! : '';

      const attrs: AxmlTag['attrs'] = [];
      let attrOff = xmlOff + 28;
      for (let a = 0; a < attrCount; a++) {
        const aNsIdx = readU32(buf, attrOff);
        const aNameIdx = readU32(buf, attrOff + 4);
        const aValueIdx = readU32(buf, attrOff + 8);
        const aType = readU32(buf, attrOff + 12);
        const aData = readU32(buf, attrOff + 16);

        const aName = aNameIdx < strings.length ? strings[aNameIdx]! : `attr${aNameIdx}`;
        const aNs = aNsIdx > 0 && aNsIdx < strings.length ? strings[aNsIdx]! : '';
        let aValue = '';
        if (aType === 0x03 && aValueIdx < strings.length) {
          aValue = strings[aValueIdx]!;
        } else if (aType === 0x01) {
          aValue = '@android:' + aData.toString(16);
        } else if (aType === 0x10) {
          aValue = String(aData);
        } else if (aType === 0x12) {
          aValue = aData !== 0 ? 'true' : 'false';
        }

        attrs.push({ name: aName, ns: aNs, value: aValue, resourceId: aData });
        attrOff += 20;
      }

      tags.push({ name: tagName, ns: tagNs, attrs, depth: tagStack.length });
      tagStack.push(tagName);
    } else if (type === 0x0103) {
      // END_TAG
      tagStack.pop();
    }

    xmlOff += size;
    if (size === 0) break;
  }

  return { namespaces, tags, strings };
}

// ─── DEX Parser ────────────────────────────────────────────────

const DEX_MAGIC = [0x64, 0x65, 0x78, 0x0a]; // "dex\n"

function parseDexHeader(
  data: Uint8Array
): { version: string; classCount: number; methodCount: number; fieldCount: number } | null {
  if (data.length < 112) return null;
  for (let i = 0; i < 4; i++) {
    if (data[i] !== DEX_MAGIC[i]) return null;
  }
  const version = String.fromCharCode(data[4], data[5], data[6], data[7]);
  const classDefsSize = readU32(data, 100);
  const methodIdsSize = readU32(data, 88);
  const fieldIdsSize = readU32(data, 84);
  return { version, classCount: classDefsSize, methodCount: methodIdsSize, fieldCount: fieldIdsSize };
}

// ─── Entropy ─────────────────────────────────────────────────

function computeEntropy(data: Uint8Array): number {
  const freq = new Array(256).fill(0);
  for (const b of data) freq[b]++;
  let entropy = 0;
  for (const f of freq) {
    if (f === 0) continue;
    const p = f / data.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ─── Hashes ──────────────────────────────────────────────────

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha1(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-1', data as unknown as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── OCR-like string extraction ──────────────────────────────

const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const API_KEY_RE = /\b(?:sk_live_|sk_test_)[A-Za-z0-9]{24,}\b/g;

function extractStrings(data: Uint8Array, maxLen = 500): string[] {
  const out: string[] = [];
  let current = '';
  for (const b of data) {
    if (b >= 32 && b <= 126) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) out.push(current);
      current = '';
      if (out.length >= maxLen) break;
    }
  }
  if (current.length >= 4) out.push(current);
  return out;
}

// ─── Heuristic rules (Quark-engine style) ──────────────────

const HEURISTIC_RULES: Array<
  (ctx: {
    strings: string[];
    permissions: string[];
    dexCount: number;
    entropy: number;
    nativeCount: number;
  }) => SuspiciousFinding | null
> = [
  (ctx) => {
    if (!ctx.permissions.includes('android.permission.INTERNET')) return null;
    if (
      ctx.permissions.includes('android.permission.READ_SMS') &&
      ctx.permissions.includes('android.permission.SEND_SMS')
    ) {
      return {
        rule: 'SMS_ABUSE',
        severity: 'high',
        detail: 'App requests SMS read and send permissions with internet access - potential premium SMS fraud',
      };
    }
    return null;
  },
  (ctx) => {
    if (
      ctx.permissions.includes('android.permission.RECORD_AUDIO') &&
      ctx.permissions.includes('android.permission.ACCESS_FINE_LOCATION') &&
      ctx.permissions.includes('android.permission.INTERNET')
    ) {
      return {
        rule: 'SPY_MONITORING',
        severity: 'high',
        detail: 'App requests microphone, location, and internet - potential surveillance capability',
      };
    }
    return null;
  },
  (ctx) => {
    if (ctx.permissions.includes('android.permission.BIND_ACCESSIBILITY_SERVICE')) {
      return {
        rule: 'ACCESSIBILITY_ABUSE',
        severity: 'critical',
        detail:
          'App binds accessibility service - can intercept user input across all apps (common in banking trojans)',
      };
    }
    return null;
  },
  (ctx) => {
    if (ctx.nativeCount > 3 && ctx.dexCount <= 1) {
      return {
        rule: 'NATIVE_HEAVY',
        severity: 'medium',
        detail: `App uses ${ctx.nativeCount} native libraries with minimal DEX code - possible native payload`,
      };
    }
    return null;
  },
  (ctx) => {
    if (ctx.entropy > 7.7) {
      return {
        rule: 'HIGH_ENTROPY',
        severity: 'medium',
        detail: `Overall entropy ${ctx.entropy.toFixed(2)}/8 - likely packed or encrypted`,
      };
    }
    return null;
  },
  (ctx) => {
    if (
      ctx.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES') &&
      ctx.permissions.includes('android.permission.WRITE_EXTERNAL_STORAGE')
    ) {
      return {
        rule: 'SIDE_LOADING',
        severity: 'high',
        detail: 'App can request installs from unknown sources and write to storage - potential dropper behavior',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if (s.includes('Ljava/lang/Runtime;->exec') || s.includes('Ljava/lang/ProcessBuilder')) {
      return {
        rule: 'COMMAND_EXECUTION',
        severity: 'high',
        detail: 'App can execute shell commands at runtime - possible backdoor',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if (s.includes('Landroid/app/Instrumentation') && s.includes('startActivity')) {
      return {
        rule: 'ACTIVITY_INJECTION',
        severity: 'medium',
        detail: 'Uses Instrumentation API - can inject activities into other processes',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if (s.includes('Landroid/app/admin/DevicePolicyManager') && s.includes('lockNow')) {
      return {
        rule: 'DEVICE_ADMIN',
        severity: 'high',
        detail: 'App can lock device via DevicePolicyManager - possible ransomware behavior',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if (s.includes('Ldalvik/system/DexClassLoader') || s.includes('Ldalvik/system/PathClassLoader')) {
      return {
        rule: 'DEX_LOADING',
        severity: 'high',
        detail: 'App loads DEX files at runtime - common in packers and malware',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if ((s.match(/getDeviceId/g)?.length ?? 0) > 1 || (s.match(/getSubscriberId/g)?.length ?? 0) > 0) {
      return {
        rule: 'DEVICE_FINGERPRINTING',
        severity: 'medium',
        detail: 'App collects device identifiers (IMEI, IMSI) - data harvesting behavior',
      };
    }
    return null;
  },
  (ctx) => {
    const s = ctx.strings.join(' ');
    if (s.includes('Ljavax/crypto/Cipher') && s.includes('Ljava/io/FileOutputStream')) {
      return {
        rule: 'FILE_ENCRYPTION',
        severity: 'high',
        detail: 'App has crypto + file write capability - potential ransomware',
      };
    }
    return null;
  },
];

// ─── Main analysis function ─────────────────────────────────

export async function analyzeApk(file: File): Promise<{
  analysis: ApkAnalysis;
  sha256: string;
  sha1: string;
  md5: string;
  size: number;
  entropy: number;
  fileName: string;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [hash256, hash1] = await Promise.all([sha256(bytes), sha1(bytes)]);
  const { md5HexFromBytes } = await import('./md5');
  const hashMd5 = md5HexFromBytes(bytes);
  const entropy = computeEntropy(bytes);

  const analysis: ApkAnalysis = {
    packageName: '',
    appName: '',
    versionName: '',
    versionCode: '',
    minSdk: '',
    targetSdk: '',
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    dexFiles: [],
    nativeLibs: [],
    assets: [],
    certificates: [],
    fileCount: 0,
    urls: [],
    ips: [],
    domains: [],
    apiKeys: [],
    suspicious: [],
  };

  let manifestBytes: Uint8Array | null = null;
  const allStrings: string[] = [];
  const allPermissionNames: string[] = [];

  try {
    const zip = await JSZip.loadAsync(bytes);
    analysis.fileCount = Object.keys(zip.files).length;

    // Zip-bomb guards: bound both per-entry and total inflated bytes. JSZip
    // inflates an entry fully into memory, so a small APK can decompress to
    // gigabytes. Skip oversized entries and stop once the total budget is hit.
    const MAX_ENTRY_BYTES = 64 * 1024 * 1024; // 64 MB / entry
    const MAX_TOTAL_BYTES = 256 * 1024 * 1024; // 256 MB total
    let totalInflated = 0;
    const inflate = async (entry: (typeof zip.files)[string]): Promise<Uint8Array | null> => {
      if (totalInflated >= MAX_TOTAL_BYTES) return null;
      const hint = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (typeof hint === 'number' && hint > MAX_ENTRY_BYTES) return null;
      const data = await entry.async('uint8array');
      if (data.length > MAX_ENTRY_BYTES) return null;
      totalInflated += data.length;
      return totalInflated > MAX_TOTAL_BYTES ? null : data;
    };

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;

      if (path === 'AndroidManifest.xml') {
        manifestBytes = await inflate(entry);
      } else if (path.endsWith('.dex')) {
        const dexData = await inflate(entry);
        if (!dexData) continue;
        const dexInfo = parseDexHeader(dexData);
        analysis.dexFiles.push({
          name: path.split('/').pop() ?? path,
          size: dexData.length,
          version: dexInfo?.version ?? 'unknown',
          classCount: dexInfo?.classCount ?? 0,
          methodCount: dexInfo?.methodCount ?? 0,
          fieldCount: dexInfo?.fieldCount ?? 0,
          entropy: computeEntropy(dexData),
        });
      } else if (path.startsWith('lib/')) {
        analysis.nativeLibs.push(path);
      } else if (path.startsWith('assets/')) {
        analysis.assets.push(path);
      } else if (
        path.startsWith('META-INF/') &&
        (path.endsWith('.RSA') ||
          path.endsWith('.SF') ||
          path.endsWith('.MF') ||
          path.endsWith('.DSA') ||
          path.endsWith('.EC'))
      ) {
        analysis.certificates.push({ path, subject: '', issuer: '', serial: '' });
      }

      // Extract strings from DEX files and other binary files
      if (path.endsWith('.dex') || path.endsWith('.xml') || path.endsWith('.MF') || path.endsWith('.SF')) {
        const content = await inflate(entry);
        if (content) allStrings.push(...extractStrings(content));
      }
    }
  } catch {
    /* ZIP parse failed */
  }

  // Parse AndroidManifest.xml
  if (manifestBytes) {
    const axml = parseAxml(manifestBytes);
    for (const tag of axml.tags) {
      for (const attr of tag.attrs) {
        if (attr.name === 'name' && tag.name === 'manifest') {
          if (attr.value && !analysis.packageName) analysis.packageName = attr.value;
        }
        if (attr.name === 'versionName' && attr.value) analysis.versionName = attr.value;
        if (attr.name === 'versionCode' && attr.value) analysis.versionCode = attr.value;
        if (attr.name === 'minSdkVersion' && attr.value) analysis.minSdk = attr.value;
        if (attr.name === 'targetSdkVersion' && attr.value) analysis.targetSdk = attr.value;
        if (attr.name === 'label' && tag.name === 'application' && attr.value) analysis.appName = attr.value;
      }

      if (tag.name === 'uses-permission') {
        for (const attr of tag.attrs) {
          if (attr.name === 'name' && attr.value) {
            const perm = attr.value;
            allPermissionNames.push(perm);
            analysis.permissions.push({ name: perm, dangerous: DANGEROUS_PERMS.has(perm) });
          }
        }
      }

      if (tag.name === 'activity') {
        for (const attr of tag.attrs) {
          if (attr.name === 'name' && attr.value) analysis.activities.push(attr.value);
        }
      }
      if (tag.name === 'service') {
        for (const attr of tag.attrs) {
          if (attr.name === 'name' && attr.value) analysis.services.push(attr.value);
        }
      }
      if (tag.name === 'receiver') {
        for (const attr of tag.attrs) {
          if (attr.name === 'name' && attr.value) analysis.receivers.push(attr.value);
        }
      }
      if (tag.name === 'provider') {
        for (const attr of tag.attrs) {
          if (attr.name === 'name' && attr.value) analysis.providers.push(attr.value);
        }
      }
    }
  }

  // Extract IOCs from all strings
  const allText = allStrings.join(' ');
  analysis.urls = [...new Set(allText.match(URL_RE) ?? [])]
    .filter((u) => !u.includes('android.com') && !u.includes('google.com'))
    .slice(0, 30);
  analysis.ips = [...new Set(allText.match(IP_RE) ?? [])]
    .filter((ip) => {
      const p = ip.split('.').map(Number);
      return p.every((n) => n >= 0 && n <= 255) && p[0] !== 127 && p[0] !== 10;
    })
    .slice(0, 20);
  analysis.domains = [...new Set(allText.match(DOMAIN_RE) ?? [])]
    .filter(
      (d) =>
        !d.includes('example') && !d.includes('android.com') && !d.includes('google.com') && d.split('.').length >= 2
    )
    .slice(0, 20);
  analysis.apiKeys = [...new Set(allText.match(API_KEY_RE) ?? [])].slice(0, 10);

  // Run heuristic rules
  const ctx = {
    strings: allStrings,
    permissions: allPermissionNames,
    dexCount: analysis.dexFiles.length,
    entropy,
    nativeCount: analysis.nativeLibs.length,
  };
  for (const rule of HEURISTIC_RULES) {
    const finding = rule(ctx);
    if (finding) analysis.suspicious.push(finding);
  }

  // Known malware package references
  const KNOWN_MALWARE_CLASSES = [
    'com.cleanmaster',
    'com.duapps',
    'com.psafe',
    'com.ludashi',
    'com.super.cleaner',
    'com.batterysaver',
    'com.call.recorder',
  ];
  for (const pkg of KNOWN_MALWARE_CLASSES) {
    if (allStrings.some((s) => s.includes(pkg))) {
      analysis.suspicious.push({
        rule: 'KNOWN_MALWARE_CLASS',
        severity: 'high',
        detail: `References known adware/malware package: ${pkg}`,
      });
    }
  }

  return { analysis, sha256: hash256, sha1: hash1, md5: hashMd5, size: bytes.length, entropy, fileName: file.name };
}
