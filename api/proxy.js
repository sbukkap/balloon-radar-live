// api/proxy.js
import { URL } from 'url';
import http from 'http';

// This proxy will *only* allow requests to the climate API.
const ALLOWED_HOST = 'climateapi.scottpinkelman.com';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const targetUrlStr = reqUrl.searchParams.get('url');

  if (!targetUrlStr) {
    res.status(400).send('Missing "url" query parameter');
    return;
  }

  const targetUrl = new URL(targetUrlStr);

  if (targetUrl.hostname !== ALLOWED_HOST) {
    res.status(403).send(`Forbidden: Host not allowed by proxy`);
    return;
  }

  await new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 80,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Vercel-Proxy',
        },
      },
      (targetRes) => {
        res.writeHead(targetRes.statusCode, targetRes.headers);
        targetRes.pipe(res).on('end', resolve);
      }
    );

    proxyReq.on('error', (e) => {
      console.error(`Proxy request error: ${e.message}`);
      res.status(502).send('Proxy request failed');
      reject(e);
    });

    proxyReq.end();
  });
}