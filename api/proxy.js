// This is the correct api/proxy.js
import http from 'http';
import https from 'https';
import { URL } from 'url';

// Define all allowed domains
const ALLOWED_HOSTS = [
  'a.windbornesystems.com',
  'www.windbornesystems.com', // For the redirect
  'www.gdacs.org',
  'climateapi.scottpinkelman.com'
];

// This is the main Vercel serverless function handler
export default async function handler(req, res) {
  // Set CORS headers for the response
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

  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    res.status(403).send(`Forbidden: Host not allowed by proxy: ${targetUrl.hostname}`);
    return;
  }

  // We must return a Promise to Vercel
  await new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        res.status(508).send('Too many redirects');
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = currentUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: currentUrl.hostname,
        port: currentUrl.port,
        path: currentUrl.pathname + currentUrl.search,
        method: req.method,
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Vercel-Proxy',
        },
      };

      const proxyReq = protocol.request(options, (targetRes) => {
        if (targetRes.statusCode === 301 || targetRes.statusCode === 302 || targetRes.statusCode === 307) {
          const newLocation = targetRes.headers.location;
          if (!newLocation) {
            res.status(500).send('Redirect with no location header');
            reject(new Error('Redirect with no location header'));
            return;
          }
          const newUrl = new URL(newLocation, currentUrl.href);
          if (!ALLOWED_HOSTS.includes(newUrl.hostname)) {
             res.status(403).send(`Forbidden: Redirect to non-allowed host: ${newUrl.hostname}`);
             reject(new Error(`Forbidden: Redirect to non-allowed host: ${newUrl.hostname}`));
             return;
          }
          makeRequest(newUrl, redirectCount + 1);
          return;
        }
        
        res.writeHead(targetRes.statusCode, targetRes.headers);
        targetRes.pipe(res).on('end', resolve); // Resolve the promise on end
      });

      proxyReq.on('error', (e) => {
        console.error(`Proxy request error: ${e.message}`);
        res.status(502).send('Proxy request failed');
        reject(e);
      });

      proxyReq.end();
    };
    
    makeRequest(targetUrl); // Initial call
  });
}