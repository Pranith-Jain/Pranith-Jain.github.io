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

  es.addEventListener('meta', (e) => {
    h.onMeta(JSON.parse((e as MessageEvent).data) as MetaEvent);
  });
  es.addEventListener('result', (e) => {
    h.onResult(JSON.parse((e as MessageEvent).data) as ProviderResultWire);
  });
  es.addEventListener('done', (e) => {
    h.onDone(JSON.parse((e as MessageEvent).data) as DoneEvent);
    es.close();
  });
  es.onerror = () => {
    h.onError('connection error');
    es.close();
  };

  return () => es.close();
}
