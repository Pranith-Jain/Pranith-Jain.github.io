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
  const nav = navigator as Navigator & { deviceMemory?: number };
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
    ...getWebGLInfo(),
  };
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

function getWebGLInfo(): { webglVendor?: string; webglRenderer?: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return {};
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return {};
    return {
      webglVendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string,
      webglRenderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string,
    };
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
  ];

  const deduction = factors.reduce((sum, f) => sum + (f.hit ? f.weight : 0), 0);
  const score = Math.max(0, 100 - deduction);

  const grade: OpsecGrade = score >= 80 ? 'strong' : score >= 60 ? 'moderate' : score >= 40 ? 'weak' : 'poor';

  return { score, grade, factors };
}
