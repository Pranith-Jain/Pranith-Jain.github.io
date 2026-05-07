import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Eye } from 'lucide-react';
import {
  gatherFingerprint,
  fingerprintHash,
  detectWebRtcLeaks,
  getNetworkInfo,
  getBattery,
  type FingerprintData,
  type WebRtcLeak,
  type NetworkInfo,
} from '../../lib/dfir/privacy-checks';

interface ServerInfo {
  ip?: string;
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  asn?: number;
  asOrganization?: string;
  httpProtocol?: string;
  tlsVersion?: string;
}

export default function Privacy(): JSX.Element {
  const [scanning, setScanning] = useState(false);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [fp, setFp] = useState<FingerprintData | null>(null);
  const [fpHash, setFpHash] = useState<string>('');
  const [webrtc, setWebrtc] = useState<WebRtcLeak | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | undefined>(undefined);
  const [battery, setBattery] = useState<{ level?: number; charging?: boolean } | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const [serverInfo, webrtcLeak, batt] = await Promise.all([
        fetch('/api/v1/privacy/inspect').then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null)),
        detectWebRtcLeaks(),
        getBattery(),
      ]);
      const data = gatherFingerprint();
      setServer(serverInfo);
      setFp(data);
      setFpHash(fingerprintHash(data));
      setWebrtc(webrtcLeak);
      setNetwork(getNetworkInfo());
      setBattery(batt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'scan failed');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void runScan();
  }, []);

  const Row = ({
    label,
    value,
    mono = true,
  }: {
    label: string;
    value?: string | number | boolean | null;
    mono?: boolean;
  }) => (
    <div className="flex items-baseline justify-between py-1.5 border-t border-[#1f1f23] first:border-t-0">
      <span className="text-xs uppercase tracking-wider text-[#71717a] font-mono">{label}</span>
      <span className={`text-sm text-[#fafafa] ${mono ? 'font-mono' : ''} text-right break-all max-w-[60%]`}>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-3xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">Privacy Check</h1>
        <p className="text-[#a1a1aa] mb-6 max-w-2xl">
          Your browser reveals more than you think — IP, location, DNS, fingerprint, WebRTC leaks. All checks run in
          your browser; only one lightweight API call reveals your public IP.
        </p>
        <div className="flex items-center gap-3 mb-10">
          <button
            onClick={() => void runScan()}
            disabled={scanning}
            className="px-5 py-3 bg-[#00fff9] text-[#0a0a0a] font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-[#22d3ee]"
          >
            <Shield size={16} className="inline mr-2" />
            {scanning ? 'Scanning…' : 'Scan again'}
          </button>
          {fpHash && (
            <span className="font-mono text-xs text-[#a1a1aa]">
              fingerprint: <span className="text-[#00fff9]">{fpHash}</span>
            </span>
          )}
        </div>

        {error && <p className="font-mono text-sm text-[#ef4444]">error: {error}</p>}

        <div className="space-y-6">
          {server && (
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <Eye size={16} className="text-[#00fff9]" />
                Server-side view
              </h2>
              <Row label="public IP" value={server.ip} />
              <Row label="country" value={server.country} />
              <Row label="city / region" value={[server.city, server.region].filter(Boolean).join(', ') || undefined} />
              <Row label="timezone" value={server.timezone} />
              <Row label="ASN" value={server.asn} />
              <Row label="ISP" value={server.asOrganization} mono={false} />
              <Row label="HTTP protocol" value={server.httpProtocol} />
              <Row label="TLS version" value={server.tlsVersion} />
            </section>
          )}

          {webrtc && (
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h2 className="font-display font-bold text-lg mb-3">WebRTC leak detection</h2>
              <Row label="local IPs" value={webrtc.localIps.join(', ') || undefined} />
              <Row label="public IPs (RTC)" value={webrtc.publicIps.join(', ') || undefined} />
              {webrtc.publicIps.length > 0 && (
                <p className="mt-3 text-xs font-mono text-[#f59e0b]">
                  ⚠ WebRTC may be exposing public IPs even behind a VPN.
                </p>
              )}
            </section>
          )}

          {fp && (
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h2 className="font-display font-bold text-lg mb-3">Browser fingerprint</h2>
              <Row label="user-agent" value={fp.userAgent} mono={false} />
              <Row label="platform" value={fp.platform} />
              <Row label="vendor" value={fp.vendor} />
              <Row label="languages" value={fp.languages.join(', ')} />
              <Row label="timezone" value={fp.timezone} />
              <Row label="screen" value={`${fp.screenResolution} @ ${fp.colorDepth}-bit, ${fp.pixelRatio}x DPR`} />
              <Row
                label="hardware"
                value={`${fp.hardwareConcurrency} cores${fp.deviceMemory ? `, ${fp.deviceMemory}GB` : ''}`}
              />
              <Row label="cookies enabled" value={fp.cookieEnabled} />
              <Row label="do-not-track" value={fp.doNotTrack ?? 'unset'} />
              <Row label="canvas hash" value={fp.canvasHash} />
              <Row label="WebGL vendor" value={fp.webglVendor} />
              <Row label="WebGL renderer" value={fp.webglRenderer} />
            </section>
          )}

          {network && (
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h2 className="font-display font-bold text-lg mb-3">Network</h2>
              <Row label="connection" value={network.effectiveType} />
              <Row label="downlink (Mbps)" value={network.downlink} />
              <Row label="RTT (ms)" value={network.rtt} />
              <Row label="save-data" value={network.saveData} />
            </section>
          )}

          {battery && (
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <h2 className="font-display font-bold text-lg mb-3">Battery</h2>
              <Row
                label="level"
                value={battery.level !== undefined ? `${Math.round(battery.level * 100)}%` : undefined}
              />
              <Row label="charging" value={battery.charging} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
