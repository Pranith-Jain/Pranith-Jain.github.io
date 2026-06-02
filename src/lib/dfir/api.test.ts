import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamIoc } from './api';

/**
 * Controllable EventSource stub — jsdom has no EventSource, and we need to
 * drive individual SSE frames (including malformed ones) at the handlers.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  static last(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1]!;
  }
  url: string;
  closed = false;
  onerror: ((e: unknown) => void) | null = null;
  private listeners: Record<string, Array<(e: unknown) => void>> = {};
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string) {
    for (const fn of this.listeners[type] ?? []) fn({ data } as MessageEvent);
  }
}

const handlers = () => ({ onMeta: vi.fn(), onResult: vi.fn(), onDone: vi.fn(), onError: vi.fn() });

describe('streamIoc', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  });
  afterEach(() => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
  });

  it('dispatches well-formed frames to the matching handlers', () => {
    const h = handlers();
    streamIoc('1.2.3.4', h);
    const es = MockEventSource.last();
    es.emit('meta', JSON.stringify({ providers: ['vt', 'otx'] }));
    es.emit('result', JSON.stringify({ source: 'vt', verdict: 'malicious', score: 90 }));
    es.emit('done', JSON.stringify({ verdict: 'malicious', score: 90, confidence: 'high' }));
    expect(h.onMeta).toHaveBeenCalledTimes(1);
    expect(h.onResult).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'malicious' }));
    expect(es.closed).toBe(true);
  });

  it('a malformed `done` frame fails the stream instead of stranding it', () => {
    // Regression: the old code called JSON.parse() before es.close(), so a bad
    // frame threw out of the listener — es never closed, onError never fired,
    // and bulk Promise.all() hung forever.
    const h = handlers();
    streamIoc('1.2.3.4', h);
    const es = MockEventSource.last();
    expect(() => es.emit('done', 'not-json{')).not.toThrow();
    expect(h.onError).toHaveBeenCalledWith(expect.stringMatching(/malformed/i));
    expect(h.onDone).not.toHaveBeenCalled();
    expect(es.closed).toBe(true);
  });

  it('a malformed `meta`/`result` frame errors + closes without invoking the handler', () => {
    const h = handlers();
    streamIoc('1.2.3.4', h);
    const es = MockEventSource.last();
    expect(() => es.emit('meta', '{bad')).not.toThrow();
    expect(h.onMeta).not.toHaveBeenCalled();
    expect(h.onError).toHaveBeenCalledWith(expect.stringMatching(/malformed/i));
    expect(es.closed).toBe(true);
  });

  it('surfaces a transport error and the returned teardown closes the socket', () => {
    const h = handlers();
    const stop = streamIoc('1.2.3.4', h);
    const es = MockEventSource.last();
    es.onerror?.({});
    expect(h.onError).toHaveBeenCalledWith('connection error');
    expect(es.closed).toBe(true);
    es.closed = false;
    stop();
    expect(es.closed).toBe(true);
  });
});
