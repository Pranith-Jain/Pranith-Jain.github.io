export interface FingerprintData {
  userAgent: string;
  platform: string;
  language: string;
  languages: string[];
  timezone: string;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  hardwareConcurrency: number;
  deviceMemory?: number;
  screenResolution: string;
  colorDepth: number;
  pixelRatio: number;
  vendor: string;
  canvasHash: string;
  webglVendor?: string;
  webglRenderer?: string;
  // Browserleaks-style additions
  audioFingerprint?: string;
  mediaDevicesCount?: number;
  speechVoicesCount?: number;
  permissions?: Record<string, string>;
  webglExtensionsCount?: number;
  touchSupport?: { points: number; touchEvent: boolean };
  storageQuotaMB?: number;
}

export interface WebRtcLeak {
  localIps: string[];
  publicIps: string[];
}

export interface NetworkInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface PrivacyReport {
  fingerprint: FingerprintData;
  fingerprintHash: string;
  webrtc: WebRtcLeak;
  network?: NetworkInfo;
  battery?: { level?: number; charging?: boolean };
}

export function gatherFingerprint(): FingerprintData {
  const nav = navigator as Navigator & { deviceMemory?: number; maxTouchPoints?: number };
  const scr = window.screen;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    languages: Array.from(nav.languages ?? []),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    deviceMemory: nav.deviceMemory,
    screenResolution: `${scr.width}x${scr.height}`,
    colorDepth: scr.colorDepth,
    pixelRatio: window.devicePixelRatio,
    vendor: nav.vendor ?? '',
    canvasHash: getCanvasHash(),
    touchSupport: {
      points: nav.maxTouchPoints ?? 0,
      touchEvent: 'ontouchstart' in window,
    },
    ...getWebGLInfo(),
  };
}

/** Async detections that can't run inside the synchronous gatherFingerprint() call. */
export async function gatherAsyncFingerprint(): Promise<{
  audioFingerprint?: string;
  mediaDevicesCount?: number;
  speechVoicesCount?: number;
  permissions?: Record<string, string>;
  storageQuotaMB?: number;
}> {
  const [audio, media, voices, permissions, storage] = await Promise.all([
    getAudioFingerprint().catch(() => undefined),
    getMediaDevicesCount().catch(() => undefined),
    getSpeechVoicesCount().catch(() => undefined),
    getPermissionsState().catch(() => undefined),
    getStorageQuotaMB().catch(() => undefined),
  ]);
  return {
    audioFingerprint: audio,
    mediaDevicesCount: media,
    speechVoicesCount: voices,
    permissions,
    storageQuotaMB: storage,
  };
}

/**
 * Audio fingerprint: synth a short DynamicsCompressor-shaped signal in an
 * OfflineAudioContext, hash the resulting buffer. The output varies per
 * device + audio stack and is one of the strongest fingerprint vectors.
 */
async function getAudioFingerprint(): Promise<string | undefined> {
  type Ctor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
  const Ctor =
    (window as unknown as { OfflineAudioContext?: Ctor; webkitOfflineAudioContext?: Ctor }).OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: Ctor }).webkitOfflineAudioContext;
  if (!Ctor) return undefined;
  const ctx = new Ctor(1, 44100, 44100);
  const oscillator = ctx.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(10000, ctx.currentTime);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-50, ctx.currentTime);
  compressor.knee.setValueAtTime(40, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);
  oscillator.connect(compressor);
  compressor.connect(ctx.destination);
  oscillator.start(0);
  const buf = await ctx.startRendering();
  // Sum a slice of samples for a compact, stable fingerprint
  let sum = 0;
  const data = buf.getChannelData(0);
  for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]!);
  return djb2(sum.toString());
}

async function getMediaDevicesCount(): Promise<number | undefined> {
  if (!navigator.mediaDevices?.enumerateDevices) return undefined;
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.length;
  } catch {
    return undefined;
  }
}

async function getSpeechVoicesCount(): Promise<number | undefined> {
  if (typeof window.speechSynthesis === 'undefined') return undefined;
  // Voices may load asynchronously on some browsers; try once, then retry after
  // 100 ms if the list is empty.
  const initial = window.speechSynthesis.getVoices();
  if (initial.length > 0) return initial.length;
  await new Promise((r) => setTimeout(r, 100));
  return window.speechSynthesis.getVoices().length;
}

async function getPermissionsState(): Promise<Record<string, string> | undefined> {
  if (!navigator.permissions?.query) return undefined;
  const names: PermissionName[] = [
    'geolocation',
    'notifications',
    'camera',
    'microphone',
    'clipboard-read',
  ] as PermissionName[];
  const out: Record<string, string> = {};
  for (const name of names) {
    try {
      const res = await navigator.permissions.query({ name });
      out[String(name)] = res.state;
    } catch {
      /* permission name not supported in this browser */
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function getStorageQuotaMB(): Promise<number | undefined> {
  if (!navigator.storage?.estimate) return undefined;
  try {
    const est = await navigator.storage.estimate();
    return est.quota ? Math.round(est.quota / (1024 * 1024)) : undefined;
  } catch {
    return undefined;
  }
}

function getCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('DFIR canvas fp 🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('DFIR canvas fp 🔒', 4, 17);
    return djb2(canvas.toDataURL());
  } catch {
    return '';
  }
}

function getWebGLInfo(): { webglVendor?: string; webglRenderer?: string; webglExtensionsCount?: number } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return {};
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const exts = gl.getSupportedExtensions();
    const out: { webglVendor?: string; webglRenderer?: string; webglExtensionsCount?: number } = {
      webglExtensionsCount: exts?.length,
    };
    if (ext) {
      out.webglVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string;
      out.webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    }
    return out;
  } catch {
    return {};
  }
}

export function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}

export function fingerprintHash(fp: FingerprintData): string {
  const stable = [
    fp.userAgent,
    fp.platform,
    fp.language,
    fp.timezone,
    fp.hardwareConcurrency,
    fp.deviceMemory ?? '?',
    fp.screenResolution,
    fp.colorDepth,
    fp.pixelRatio,
    fp.vendor,
    fp.canvasHash,
    fp.webglVendor ?? '',
    fp.webglRenderer ?? '',
  ].join('|');
  return djb2(stable);
}

export async function detectWebRtcLeaks(timeoutMs = 2000): Promise<WebRtcLeak> {
  if (typeof RTCPeerConnection === 'undefined') return { localIps: [], publicIps: [] };

  const localIps = new Set<string>();
  const publicIps = new Set<string>();
  const ipv4 = /(?:\d{1,3}\.){3}\d{1,3}/g;

  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.createDataChannel('');

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        clearTimeout(timer);
        resolve();
        return;
      }
      const matches = event.candidate.candidate.match(ipv4);
      if (matches) {
        for (const ip of matches) {
          if (ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
            localIps.add(ip);
          } else if (!ip.startsWith('0.')) {
            publicIps.add(ip);
          }
        }
      }
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => {
        resolve();
      });
  });

  pc.close();
  return { localIps: Array.from(localIps), publicIps: Array.from(publicIps) };
}

export function getNetworkInfo(): NetworkInfo | undefined {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };
  const c = nav.connection;
  if (!c) return undefined;
  return { effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData };
}

export async function getBattery(): Promise<{ level?: number; charging?: boolean } | undefined> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (!nav.getBattery) return undefined;
  try {
    const b = await nav.getBattery();
    return { level: b.level, charging: b.charging };
  } catch {
    return undefined;
  }
}

interface BatteryManager {
  level: number;
  charging: boolean;
}

export type OpsecGrade = 'strong' | 'moderate' | 'weak' | 'poor';

export interface OpsecFactor {
  id: string;
  label: string;
  weight: number; // points deducted when triggered
  hit: boolean;
  advice: string;
}

export interface OpsecScore {
  score: number; // 0–100, higher is more private
  grade: OpsecGrade;
  factors: OpsecFactor[];
}

export function computeOpsecScore(args: {
  fingerprint: FingerprintData;
  webrtc: WebRtcLeak;
  network?: NetworkInfo;
  battery?: { level?: number; charging?: boolean };
}): OpsecScore {
  const { fingerprint: fp, webrtc, network, battery } = args;

  const factors: OpsecFactor[] = [
    {
      id: 'webrtc-public-leak',
      label: 'WebRTC leaks public IP',
      weight: 35,
      hit: webrtc.publicIps.length > 0,
      advice: 'Disable WebRTC or use a VPN with WebRTC leak protection (Mullvad, ProtonVPN).',
    },
    {
      id: 'webrtc-local-leak',
      label: 'WebRTC exposes local IPs',
      weight: 8,
      hit: webrtc.localIps.length > 0,
      advice: 'Block local-network discovery via about:config (media.peerconnection.enabled = false in Firefox).',
    },
    {
      id: 'dnt-unset',
      label: 'Do-Not-Track header not set',
      weight: 6,
      hit: fp.doNotTrack !== '1',
      advice: 'Enable "Send Do Not Track" or "Global Privacy Control" in your browser privacy settings.',
    },
    {
      id: 'cookies-enabled',
      label: 'Cookies enabled (3rd-party tracking risk)',
      weight: 5,
      hit: fp.cookieEnabled === true,
      advice: 'Block third-party cookies; consider Firefox Total Cookie Protection or Brave Shields.',
    },
    {
      id: 'canvas-fingerprint',
      label: 'Canvas fingerprint is readable',
      weight: 10,
      hit: !!fp.canvasHash && fp.canvasHash.length > 0,
      advice: 'Use a privacy browser (Brave, Tor) or anti-fingerprinting extension (CanvasBlocker).',
    },
    {
      id: 'webgl-renderer',
      label: 'WebGL renderer / GPU revealed',
      weight: 10,
      hit: !!fp.webglRenderer,
      advice: 'Spoof WebGL via an anti-fingerprinting extension or browser hardening flags.',
    },
    {
      id: 'battery-api',
      label: 'Battery API exposed',
      weight: 4,
      hit: !!battery,
      advice: 'Battery info is fingerprintable; modern Firefox/Safari already block it — Chrome still exposes it.',
    },
    {
      id: 'network-info',
      label: 'Network connection info exposed',
      weight: 4,
      hit: !!network?.effectiveType,
      advice: 'navigator.connection leaks downlink/RTT — Brave and privacy.resistFingerprinting (Firefox) hide it.',
    },
    {
      id: 'hardware-detailed',
      label: 'Detailed hardware info (cores + memory)',
      weight: 4,
      hit: !!fp.deviceMemory && fp.hardwareConcurrency > 0,
      advice: 'navigator.deviceMemory + hardwareConcurrency narrow you to a small device class.',
    },
    {
      id: 'languages-multi',
      label: 'Multiple languages disclosed',
      weight: 3,
      hit: fp.languages.length > 1,
      advice: 'navigator.languages leaks UI locale list — set one language to reduce uniqueness.',
    },
    {
      id: 'audio-fingerprint',
      label: 'Audio context fingerprint readable',
      weight: 8,
      hit: !!fp.audioFingerprint,
      advice:
        'OfflineAudioContext + DynamicsCompressor produces a stable per-device hash. Brave randomises it; Tor blocks the API.',
    },
    {
      id: 'media-devices',
      label: 'Media device count exposed',
      weight: 4,
      hit: !!fp.mediaDevicesCount && fp.mediaDevicesCount > 0,
      advice:
        'enumerateDevices() leaks how many cameras/mics/speakers you have without permission. Disable the API in privacy-resistant browsers.',
    },
    {
      id: 'speech-voices',
      label: 'Speech synthesis voices enumerable',
      weight: 3,
      hit: !!fp.speechVoicesCount && fp.speechVoicesCount > 0,
      advice:
        'Installed system voices are highly stable per-OS — combined with timezone they uniquely identify many devices.',
    },
    {
      id: 'permissions-leak',
      label: 'Permissions API state queryable',
      weight: 4,
      hit: !!fp.permissions && Object.keys(fp.permissions).length > 0,
      advice:
        'Sites can probe permission state for camera, mic, geolocation, etc. without prompting. Use a browser that blocks Permissions API queries.',
    },
    {
      id: 'webgl-extensions',
      label: 'WebGL extension list discloses GPU',
      weight: 4,
      hit: !!fp.webglExtensionsCount && fp.webglExtensionsCount > 0,
      advice: 'getSupportedExtensions() returns 30-60 strings that vary per GPU/driver. Tor disables WebGL by default.',
    },
    {
      id: 'touch-support',
      label: 'Touch capabilities exposed',
      weight: 2,
      hit: !!fp.touchSupport && (fp.touchSupport.points > 0 || fp.touchSupport.touchEvent),
      advice: 'Mobile vs desktop is leaked via maxTouchPoints. Hard to mitigate without a hardened browser profile.',
    },
  ];

  const deduction = factors.reduce((sum, f) => sum + (f.hit ? f.weight : 0), 0);
  const score = Math.max(0, 100 - deduction);

  const grade: OpsecGrade = score >= 80 ? 'strong' : score >= 60 ? 'moderate' : score >= 40 ? 'weak' : 'poor';

  return { score, grade, factors };
}
