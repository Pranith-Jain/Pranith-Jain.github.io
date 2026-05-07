import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
    <div className="flex items-baseline justify-between py-1.5 border-t border-slate-200 dark:border-slate-800 first:border-t-0">
      <span className="text-xs uppercase tracking-wider text-slate-500 font-mono">{label}</span>
      <span
        className={`text-sm text-slate-900 dark:text-slate-100 ${mono ? 'font-mono' : ''} text-right break-all max-w-[60%]`}
      >
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">Privacy Check</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl">
          Your browser reveals more than you think — IP, location, DNS, fingerprint, WebRTC leaks. All checks run in
          your browser; only one lightweight API call reveals your public IP.
        </p>
      </motion.div>
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={() => void runScan()}
          disabled={scanning}
          className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
        >
          <Shield size={16} className="inline mr-2" />
          {scanning ? 'Scanning…' : 'Scan again'}
        </button>
        {fpHash && (
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
            fingerprint: <span className="text-brand-600 dark:text-brand-400">{fpHash}</span>
          </span>
        )}
      </div>

      {error && <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>}

      <div className="space-y-6">
        {server && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
              <Eye size={16} className="text-brand-600 dark:text-brand-400" />
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
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="font-display font-bold text-lg mb-3">WebRTC leak detection</h2>
            <Row label="local IPs" value={webrtc.localIps.join(', ') || undefined} />
            <Row label="public IPs (RTC)" value={webrtc.publicIps.join(', ') || undefined} />
            {webrtc.publicIps.length > 0 && (
              <p className="mt-3 text-xs font-mono text-amber-600 dark:text-amber-400">
                ⚠ WebRTC may be exposing public IPs even behind a VPN.
              </p>
            )}
          </section>
        )}

        {fp && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
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
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="font-display font-bold text-lg mb-3">Network</h2>
            <Row label="connection" value={network.effectiveType} />
            <Row label="downlink (Mbps)" value={network.downlink} />
            <Row label="RTT (ms)" value={network.rtt} />
            <Row label="save-data" value={network.saveData} />
          </section>
        )}

        {battery && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
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
  );
}
