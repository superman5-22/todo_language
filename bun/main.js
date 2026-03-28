// Bun Runtime — Vercel Serverless Function (Node.js compat)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

async function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...sbHeaders(), ...(opts.headers || {}) },
  });
}

function send(res, status, data) {
  res.writeHead(status, CORS_HEADERS);
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  const path = (req.url || '').replace(/^\/api\/bun/, '').split('?')[0];
  const idMatch = path.match(/^\/todos\/([^/]+)$/);

  if (req.method === 'GET' && path === '/todos') {
    const r = await sbFetch('/todos?select=*&order=created_at.desc');
    const todos = await r.json();
    return send(res, 200, { todos });
  }

  if (req.method === 'POST' && path === '/todos') {
    const body = await readBody(req);
    if (!body.title || !body.title.trim()) {
      return send(res, 400, { error: 'title is required' });
    }
    const r = await sbFetch('/todos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ title: body.title.trim(), completed: false }),
    });
    const data = await r.json();
    return send(res, 201, { todo: data[0] });
  }

  if (req.method === 'PATCH' && idMatch) {
    const id = idMatch[1];
    const body = await readBody(req);
    const update = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.completed !== undefined) update.completed = body.completed;

    const r = await sbFetch(`/todos?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(update),
    });
    const data = await r.json();
    if (!data.length) return send(res, 404, { error: 'todo not found' });
    return send(res, 200, { todo: data[0] });
  }

  if (req.method === 'DELETE' && idMatch) {
    const id = idMatch[1];
    const check = await sbFetch(`/todos?id=eq.${id}&select=id`);
    const existing = await check.json();
    if (!existing.length) return send(res, 404, { error: 'todo not found' });

    await sbFetch(`/todos?id=eq.${id}`, { method: 'DELETE' });
    return send(res, 200, { message: 'deleted' });
  }

  send(res, 404, { error: 'not found' });
};
