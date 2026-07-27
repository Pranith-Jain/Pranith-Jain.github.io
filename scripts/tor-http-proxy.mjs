#!/usr/bin/env node
/**
 * HTTP-to-SOCKS5 proxy bridge for Tor.
 * Routes HTTP requests through a local Tor daemon (SOCKS5 on 127.0.0.1:9050).
 *
 * Usage:
 *   1. Start Tor: brew services start tor   (macOS)
 *   2. Start this proxy: node scripts/tor-http-proxy.mjs
 *   3. Set env: TOR_PROXY_URL=http://127.0.0.1:8234
 *   4. Run: wrangler dev
 *
 * The Worker's fetchViaTor2web() reads TOR_PROXY_URL and routes through this proxy.
 */
import http from 'node:http';
import net from 'node:net';
import { SocksClient } from 'socks';

const PROXY_PORT = parseInt(process.env.PROXY_PORT ?? '8234', 10);
const TOR_SOCKS_HOST = process.env.TOR_SOCKS_HOST ?? '127.0.0.1';
const TOR_SOCKS_PORT = parseInt(process.env.TOR_SOCKS_PORT ?? '9050', 10);

const server = http.createServer(async (req, res) => {
  const targetUrl = new URL(req.url, `http://${req.headers.host}`);
  const hostname = targetUrl.hostname;
  const port = parseInt(targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80'), 10);
  const isTLS = targetUrl.protocol === 'https:';

  console.log(`[proxy] ${req.method} ${hostname}:${port}${targetUrl.pathname}`);

  try {
    const { socket } = await SocksClient.createConnection({
      proxy: { host: TOR_SOCKS_HOST, port: TOR_SOCKS_PORT, type: 5 },
      command: 'connect',
      destination: { host: hostname, port },
    });

    if (isTLS) {
      const tls = await import('node:tls');
      const tlsSocket = tls.connect({ socket, servername: hostname, rejectUnauthorized: false }, () => {
        const headers = { ...req.headers, host: req.headers.host };
        delete headers['proxy-connection'];
        const reqLine = `${req.method} ${targetUrl.pathname}${targetUrl.search || ''} HTTP/${req.httpVersion}\r\n`;
        const headerStr = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';
        tlsSocket.write(reqLine + headerStr);
        req.pipe(tlsSocket);
      });
      tlsSocket.pipe(socket);
      tlsSocket.pipe(res.socket);
      socket.pipe(tlsSocket);
      req.on('error', () => {});
      res.on('error', () => {});
      tlsSocket.on('error', () => {});
    } else {
      const headers = { ...req.headers, host: req.headers.host };
      delete headers['proxy-connection'];
      const reqLine = `${req.method} ${targetUrl.pathname}${targetUrl.search || ''} HTTP/${req.httpVersion}\r\n`;
      const headerStr = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';
      socket.write(reqLine + headerStr);
      req.pipe(socket);
      socket.pipe(res.socket);
      req.on('error', () => {});
      res.on('error', () => {});
    }

    socket.on('error', () => {
      res.writeHead(502);
      res.end('SOCKS5 connection failed');
    });
  } catch (err) {
    console.error(`[proxy] error: ${err.message}`);
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`Tor HTTP proxy running on http://127.0.0.1:${PROXY_PORT}`);
  console.log(`Routing through Tor SOCKS5 at ${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}`);
  console.log(`Set TOR_PROXY_URL=http://127.0.0.1:${PROXY_PORT} before running wrangler dev`);
});
