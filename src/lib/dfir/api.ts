import type { ProviderResultWire, MetaEvent, DoneEvent } from './types';

export interface IocStreamHandlers {
  onMeta: (m: MetaEvent) => void;
  onResult: (r: ProviderResultWire) => void;
  onDone: (s: DoneEvent) => void;
  onError: (err: string) => void;
}

export function streamIoc(indicator: string, h: IocStreamHandlers): () => void {
  const url = `/api/v1/ioc/check?indicator=${encodeURIComponent(indicator)}`;
  const es = new EventSource(url);

  // Parse a frame safely. A malformed/truncated frame must NEVER throw out of
  // the listener — the old code parsed before es.close(), so a bad `done`
  // frame stranded the socket: single-mode hung on `streaming=true` forever
  // and the bulk runner's per-IOC Promise never resolved, deadlocking
  // Promise.all() and permanently disabling the scan button.
  const safeParse = <T>(e: Event, kind: string): T | undefined => {
    try {
      return JSON.parse((e as MessageEvent).data) as T;
    } catch {
      h.onError(`malformed ${kind} frame`);
      es.close();
      return undefined;
    }
  };

  es.addEventListener('meta', (e) => {
    const m = safeParse<MetaEvent>(e, 'meta');
    if (m) h.onMeta(m);
  });
  es.addEventListener('result', (e) => {
    const r = safeParse<ProviderResultWire>(e, 'result');
    if (r) h.onResult(r);
  });
  es.addEventListener('done', (e) => {
    const s = safeParse<DoneEvent>(e, 'done');
    es.close(); // terminal frame: close regardless of parse outcome
    if (s) h.onDone(s);
  });
  es.onerror = () => {
    h.onError('connection error');
    es.close();
  };

  return () => es.close();
}
