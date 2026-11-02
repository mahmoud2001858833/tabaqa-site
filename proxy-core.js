// Forwards browser requests to Groq and keeps the API key on the server.
const UPSTREAM = process.env.GROQ_BASE || 'https://api.groq.com/openai/v1';
const MAX_BODY = 12 * 1024 * 1024;
const WINDOW_MS = 60000;
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 40);
const hits = new Map();

function allowed(method, path) {
  return (method === 'GET' && path === 'models') || (method === 'POST' && path === 'chat/completions');
}
function overLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { message } }));
}

export async function handleGroq(req, res, path) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return sendError(res, 500, 'GROQ_API_KEY is not set on the server.');
  if (!allowed(req.method, path)) return sendError(res, 404, 'Not found.');
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (overLimit(ip)) return sendError(res, 429, 'Too many requests. Please try again in 20s.');
  let body;
  try { if (req.method === 'POST') body = await readBody(req); } catch (e) { return sendError(res, e.status || 400, 'Request is too large.'); }
  const ctl = new AbortController();
  res.on('close', () => ctl.abort());
  let up;
  try {
    up = await fetch(`${UPSTREAM}/${path}`, { method: req.method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body, signal: ctl.signal });
  } catch { return sendError(res, 502, 'Could not reach Groq from the server.'); }
  res.statusCode = up.status;
  for (const h of ['content-type', 'retry-after', 'cache-control']) { const v = up.headers.get(h); if (v) res.setHeader(h, v); }
  if (!up.body) return res.end();
  try {
    const reader = up.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) await new Promise((r) => res.once('drain', r));
    }
  } catch { /* the client went away */ }
  res.end();
}
