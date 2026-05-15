import JSZip from 'jszip';

export interface ApkAnalysis {
  packageName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  permissions: Array<{ name: string; dangerous: boolean }>;
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  dexCount: number;
  nativeLibs: string[];
  assets: string[];
  certificates: string[];
  fileCount: number;
  urls: string[];
  ips: string[];
  domains: string[];
  apiKeys: string[];
  suspicious: string[];
  hasValidSignature: boolean;
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
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.INTERNET',
]);

const SUSPICIOUS_STRINGS = [
  'com.android.vending.INSTALL_REFERRER',
  'com.android.vending.CHECK_LICENSE',
  'com.google.android.gms.ads',
  'com.google.android.gms.analytics',
  'invoke-super',
  'Landroid/telephony/TelephonyManager',
  'Landroid/location/LocationManager',
  'getDeviceId',
  'getSubscriberId',
  'getSimSerialNumber',
  'Ljava/net/HttpURLConnection',
  'Ljava/net/URL',
  'Ljavax/net/ssl/HttpsURLConnection',
  'des/DES/CBC/PKCS5Padding',
  'Ljavax/crypto/Cipher',
  'Ljavax/crypto/spec/SecretKeySpec',
  'Ljava/lang/Runtime;->exec',
  'Ljava/lang/Process',
  'Ljava/net/InetAddress;->getByName',
];

const KNOWN_MALWARE_PACKAGES = [
  'com.cleanmaster.mguard',
  'com.duapps.cleanmaster',
  'com.psafe.msuite',
  'com.advancedprocessmanager',
  'com.ludashi.cleaner',
  'com.super.cleaner',
  'com.batterysaver',
  'com.chargingmaster',
  'com.wifi.manager',
  'com.call.recorder',
  'com.smart.cleaner',
];

const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const API_KEY_RE = /\b(?:sk_live_|sk_test_)[A-Za-z0-9]{24,}\b/g;

function extractStrings(data: Uint8Array, maxLen = 300): string[] {
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

export async function analyzeApk(file: File): Promise<{
  analysis: ApkAnalysis;
  sha256: string;
  sha1: string;
  md5: string;
  size: number;
  entropy: number;
  fileName: string;
  strings: string[];
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const [hash256, hash1] = await Promise.all([sha256(bytes), sha1(bytes)]);

  // Import md5 dynamically
  const { md5HexFromBytes } = await import('./md5');
  const hashMd5 = md5HexFromBytes(bytes);

  const strings = extractStrings(bytes);
  const entropy = computeEntropy(bytes);

  const analysis: ApkAnalysis = {
    packageName: '',
    versionName: '',
    versionCode: '',
    minSdk: '',
    targetSdk: '',
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    dexCount: 0,
    nativeLibs: [],
    assets: [],
    certificates: [],
    fileCount: 0,
    urls: [],
    ips: [],
    domains: [],
    apiKeys: [],
    suspicious: [],
    hasValidSignature: false,
  };

  // Parse ZIP entries
  try {
    const zip = await JSZip.loadAsync(bytes);
    analysis.fileCount = Object.keys(zip.files).length;

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;

      if (path.endsWith('.dex')) analysis.dexCount++;
      else if (path.startsWith('lib/')) analysis.nativeLibs.push(path);
      else if (path.startsWith('assets/')) analysis.assets.push(path);
      else if (
        path.startsWith('META-INF/') &&
        (path.endsWith('.RSA') || path.endsWith('.SF') || path.endsWith('.MF'))
      ) {
        analysis.certificates.push(path);
      }

      // Try to extract AndroidManifest.xml data
      if (path === 'AndroidManifest.xml') {
        const content = await entry.async('uint8array');
        const strs = extractStrings(content, 500);

        for (const s of strs) {
          if (
            s.startsWith('package=') ||
            (s.includes('.') &&
              s.length > 5 &&
              s.length < 200 &&
              /^[a-z][a-z0-9._]*$/i.test(s) &&
              s.split('.').length >= 2 &&
              !s.includes(' '))
          ) {
            if (!analysis.packageName && s.includes('.')) analysis.packageName = s;
          }
          if (s.startsWith('versionName=') && !analysis.versionName) {
            analysis.versionName = s.replace('versionName=', '');
          }
          if (s.startsWith('versionCode=') && !analysis.versionCode) {
            analysis.versionCode = s.replace('versionCode=', '');
          }
          if (s.startsWith('minSdk=') || s.startsWith('minSdkVersion=')) {
            analysis.minSdk = s.replace(/^(minSdk|minSdkVersion)=/, '');
          }
          if (s.startsWith('targetSdk=') || s.startsWith('targetSdkVersion=')) {
            analysis.targetSdk = s.replace(/^(targetSdk|targetSdkVersion)=/, '');
          }
          if (s.startsWith('android.permission.') || s.startsWith('android.permission-group.')) {
            const perm = s.replace(/^name='?/, '');
            analysis.permissions.push({
              name: perm,
              dangerous: DANGEROUS_PERMS.has(perm),
            });
          }
        }

        // Extract component names
        for (let i = 0; i < strs.length; i++) {
          const s = strs[i];
          if (s === 'activity') {
            const next = strs[i + 1] ?? '';
            if (next.includes('.')) analysis.activities.push(next);
          }
          if (s === 'service') {
            const next = strs[i + 1] ?? '';
            if (next.includes('.')) analysis.services.push(next);
          }
          if (s === 'receiver') {
            const next = strs[i + 1] ?? '';
            if (next.includes('.')) analysis.receivers.push(next);
          }
          if (s === 'provider') {
            const next = strs[i + 1] ?? '';
            if (next.includes('.')) analysis.providers.push(next);
          }
        }
      }
    }
  } catch {
    // ZIP parsing failed - still do string-based analysis
  }

  // String-based IOC extraction
  const allText = strings.join(' ');
  analysis.urls = [...new Set(allText.match(URL_RE) ?? [])].slice(0, 30);
  analysis.ips = [...new Set(allText.match(IP_RE) ?? [])]
    .filter((ip) => {
      const p = ip.split('.').map(Number);
      return p.every((n) => n >= 0 && n <= 255);
    })
    .slice(0, 30);
  analysis.domains = [...new Set(allText.match(DOMAIN_RE) ?? [])]
    .filter((d) => !d.includes('example') && !d.endsWith('.local') && d.split('.').length >= 2)
    .slice(0, 30);
  analysis.apiKeys = [...new Set(allText.match(API_KEY_RE) ?? [])].slice(0, 10);

  // Suspicious indicators
  for (const pat of SUSPICIOUS_STRINGS) {
    if (allText.includes(pat)) analysis.suspicious.push(pat);
  }

  for (const pkg of KNOWN_MALWARE_PACKAGES) {
    if (allText.includes(pkg)) analysis.suspicious.push(`references known malware package: ${pkg}`);
  }

  if (entropy > 7.5) analysis.suspicious.push('high overall entropy (packed or encrypted)');

  return {
    analysis,
    sha256: hash256,
    sha1: hash1,
    md5: hashMd5,
    size: bytes.length,
    entropy,
    fileName: file.name,
    strings,
  };
}
