// This is your new server.mjs
import http from 'http';
import https from 'https';
import { URL } from 'url';

// Define all allowed domains
const ALLOWED_HOSTS = [
  'a.windbornesystems.com',
  'www.gdacs.org',
  'climateapi.scottpinkelman.com',
  // Note: We don't need to add redirected hosts (like 'www.windbornesystems.com')
  // because the redirect-handling logic will check the *new* host against this list.
  // But wait, the redirect logic *does* need to know about the new host.
  // Let's just add the likely redirect target.
  'www.windbornesystems.com',
];

const PORT = 8080; // Make sure this matches the PROXY port in App.jsx

const server = http.createServer((clientReq, clientRes) => {
  // Set CORS headers for the response to your React app
  clientRes.setHeader('Access-Control-Allow-Origin', '*');
  clientRes.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  clientRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight (OPTIONS) requests
  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(204);
    clientRes.end();
    return;
  }

  const reqUrl = new URL(clientReq.url, `http://${clientReq.headers.host}`);
  const targetUrlStr = reqUrl.searchParams.get('url');

  if (!targetUrlStr) {
    clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
    clientRes.end('Missing "url" query parameter');
    return;
  }

  const targetUrl = new URL(targetUrlStr);

  // --- Security Check ---
  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
    clientRes.end('Forbidden: Host not allowed by proxy');
    return;
  }

  // --- NEW: Recursive function to handle requests and redirects ---
  const makeRequest = (currentUrl, redirectCount = 0) => {
    if (redirectCount > 5) {
      clientRes.writeHead(508, { 'Content-Type': 'text/plain' });
      clientRes.end('Too many redirects');
      return;
    }

    const protocol = currentUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: currentUrl.hostname,
      port: currentUrl.port,
      path: currentUrl.pathname + currentUrl.search,
      method: clientReq.method,
      headers: {
        'User-Agent': clientReq.headers['user-agent'] || 'Node.js-Proxy',
      },
    };

    const proxyReq = protocol.request(options, (targetRes) => {
      // --- FIX: Check for redirects ---
      if (targetRes.statusCode === 301 || targetRes.statusCode === 302 || targetRes.statusCode === 307) {
        const newLocation = targetRes.headers.location;
        if (!newLocation) {
          clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
          clientRes.end('Redirect with no location header');
          return;
        }

        // Resolve the new URL (it might be relative)
        const newUrl = new URL(newLocation, currentUrl.href);

        // --- Security Check on the *new* host ---
        if (!ALLOWED_HOSTS.includes(newUrl.hostname)) {
          console.warn(`Proxy blocking redirect to non-allowed host: ${newUrl.hostname}`);
          // Let's add it dynamically for this user, this is a common issue.
          // A better-scoped solution would be to add 'www.windbornesystems.com'
          // but let's just trust redirects from allowed hosts.
          // Ah, I already added 'www.windbornesystems.com' to the list. This is fine.
          if (!ALLOWED_HOSTS.includes(newUrl.hostname)) {
             clientRes.writeHead(403, { 'Content-Type': 'text/plain' });
             clientRes.end(`Forbidden: Redirect to non-allowed host: ${newUrl.hostname}`);
             return;
          }
        }
        
        // Make a new request to the new location
        makeRequest(newUrl, redirectCount + 1);
        return; // Stop processing this response
      }
      // --- End Fix ---

      // If not a redirect, pipe as normal
      clientRes.writeHead(targetRes.statusCode, targetRes.headers);
      targetRes.pipe(clientRes, { end: true });
    });

    proxyReq.on('error', (e) => {
      console.error(`Proxy request error: ${e.message}`);
      clientRes.writeHead(502); // Bad Gateway
      clientRes.end('Proxy request failed');
    });

    clientReq.pipe(proxyReq, { end: true });
  };
  // --- End new function ---

  // Initial call to the new function
  makeRequest(targetUrl);
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});