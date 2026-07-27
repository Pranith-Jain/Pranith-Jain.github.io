#!/usr/bin/env node
/**
 * Tor relay proxy — routes .onion requests through a local Tor daemon.
 *
 * Usage:
 *   1. brew services start tor
 *   2. node scripts/tor-relay-proxy.mjs
 *   3. TOR_RELAY_URL=http://127.0.0.1:8234 wrangler dev
 *
 * Endpoint: GET /fetch?url=<tor2web-url>
 * Returns: { status, body, error? }
 */
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';

const PORT = parseInt(process.env.RELAY_PORT ?? '8234', 10);
const TOR_HOST = process.env.TOR_SOCKS_HOST ?? '127.0.0.1';
const TOR_PORT = parseInt(process.env.TOR_SOCKS_PORT ?? '9050', 10);

function socks5Connect(destHost, destPort) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(TOR_PORT, TOR_HOST, () => {
      // SOCKS5 greeting: version 5, 1 auth method (no auth)
      sock.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    let step = 0;
    sock.on('data', (data) => {
      if (step === 0) {
        // Greeting response: must be [0x05, 0x00]
        if (data[0] !== 0x05 || data[1] !== 0x00) {
          sock.destroy();
          reject(new Error(`SOCKS5 auth failed: ${data.toString('hex')}`));
          return;
        }
        step = 1;
        // Connect request: VER=5 CMD=1(connect) RSV=0 ATYP=3(domain) LEN+HOST PORT
        const hostBuf = Buffer.from(destHost, 'ascii');
        const req = Buffer.alloc(7 + hostBuf.length);
        req[0] = 0x05; // VER
        req[1] = 0x01; // CMD: connect
        req[2] = 0x00; // RSV
        req[3] = 0x03; // ATYP: domain
        req[4] = hostBuf.length;
        hostBuf.copy(req, 5);
        req.writeUInt16BE(destPort, 5 + hostBuf.length);
        sock.write(req);
      } else if (step === 1) {
        // Connect response
        if (data[1] !== 0x00) {
          const errors = { 0x01: 'general failure', 0x02: 'not allowed', 0x03: 'net unreachable', 0x04: 'host unreachable', 0x05: 'connection refused', 0x06: 'TTL expired', 0x07: 'command not supported', 0x08: 'address type not supported' };
          sock.destroy();
          reject(new Error(`SOCKS5 connect failed: ${errors[data[1]] ?? 'unknown'}`));
          return;
        }
        resolve(sock);
      }
    });

    sock.on('error', reject);
    sock.setTimeout(15000, () => {
      sock.destroy();
      reject(new Error('SOCKS5 timeout'));
    });
  });
}

async function fetchViaTor(targetUrl) {
  const url = new URL(targetUrl);
  const hostname = url.hostname;
  const port = parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10);
  const isTLS = url.protocol === 'https:';

  const sock = await socks5Connect(hostname, port);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.destroy();
      reject(new Error('request timeout'));
    }, 20000);

    const cleanup = () => clearTimeout(timeout);

    if (isTLS) {
      const tlsSock = tls.connect({ socket: sock, servername: hostname, rejectUnauthorized: false }, () => {
        const headerStr = `GET ${url.pathname}${url.search || ''} HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0\r\nAccept: text/html,*/*\r\nAccept-Language: en-US,en;q=0.5\r\nConnection: close\r\n\r\n`;
        tlsSock.write(headerStr);
      });

      let buf = Buffer.alloc(0);
      tlsSock.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); });
      tlsSock.on('end', () => {
        cleanup();
        parseResponse(buf.toString(), resolve, reject);
      });
      tlsSock.on('error', (e) => { cleanup(); reject(e); });
    } else {
      const headerStr = `GET ${url.pathname}${url.search || ''} HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: Mozilla/5.0\r\nAccept: text/html,*/*\r\nConnection: close\r\n\r\n`;
      sock.write(headerStr);

      let buf = Buffer.alloc(0);
      sock.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); });
      sock.on('end', () => {
        cleanup();
        parseResponse(buf.toString(), resolve, reject);
      });
      sock.on('error', (e) => { cleanup(); reject(e); });
    }
  });
}

function parseResponse(raw, resolve, reject) {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd === -1) {
    reject(new Error('No HTTP headers'));
    return;
  }
  const headerLines = raw.slice(0, headerEnd).split('\r\n');
  const statusMatch = headerLines[0]?.match(/HTTP\/[\d.]+\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
  const body = raw.slice(headerEnd + 4);
  resolve({ status, body });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tor: `${TOR_HOST}:${TOR_PORT}` }));
    return;
  }

  if (req.url?.startsWith('/fetch')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const target = url.searchParams.get('url');
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'url parameter required' }));
      return;
    }

    console.log(`[relay] ${target}`);
    try {
      const result = await fetchViaTor(target);
      // Truncate large responses
      const body = result.body.length > 500_000 ? result.body.slice(0, 500_000) : result.body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: result.status, body }));
    } catch (err) {
      console.error(`[relay] error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Tor Relay on http://127.0.0.1:${PORT} → SOCKS5 ${TOR_HOST}:${TOR_PORT}`);
  // Test Tor connection
  socks5Connect('check.torproject.org', 80).then((sock) => {
    console.log('✓ Tor connected');
    sock.destroy();
  }).catch((e) => {
    console.error(`✗ Tor unavailable: ${e.message} — start Tor first`);
  });
});
