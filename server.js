// Run with: node server.js   Then open http://localhost:3000
// No packages to install. Node 18 or newer. The key stays here, never in the page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGroq } from './proxy-core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(dir, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const page = path.join(dir, 'index.html');
const PORT = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/groq/')) return handleGroq(req, res, url.pathname.slice('/api/groq/'.length));
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(page).pipe(res);
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(PORT, () => {
  console.log(`طبقة تعمل على http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) console.log('تنبيه: GROQ_API_KEY غير موجود في ملف .env');
});
