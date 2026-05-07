import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

type Status = 'idle' | 'online' | 'offline';

export function ConnectionStatus(): JSX.Element | null {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch('/api/v1/health', { cache: 'no-store' });
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
          setStatus(body?.ok ? 'online' : 'offline');
        } else {
          setStatus('offline');
        }
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };

    void ping();
    const interval = setInterval(ping, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border border-slate-200 dark:border-slate-700">
      {status === 'online' ? (
        <>
          <Wifi size={12} className="text-emerald-500" aria-hidden="true" />
          <span className="text-emerald-600 dark:text-emerald-400">api online</span>
        </>
      ) : (
        <>
          <WifiOff size={12} className="text-rose-500" aria-hidden="true" />
          <span className="text-rose-600 dark:text-rose-400">api offline</span>
        </>
      )}
    </div>
  );
}
