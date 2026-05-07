export function sseStream<T>(producer: (write: (event: string, data: T) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: T) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      try {
        await producer(write);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    },
  });
}
