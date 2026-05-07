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
