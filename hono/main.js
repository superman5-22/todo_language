// Hono — Vercel Serverless Function (Edge Runtime)
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';

export const config = { runtime: 'edge' };

const app = new Hono().basePath('/api/hono');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

// GET /todos
app.get('/todos', async c => {
  const r = await sbFetch('/todos?select=*&order=created_at.desc');
  const todos = await r.json();
  return c.json({ todos });
});

// POST /todos
app.post('/todos', async c => {
  const body = await c.req.json();
  if (!body.title || !body.title.trim()) {
    return c.json({ error: 'title is required' }, 400);
  }
  const r = await sbFetch('/todos', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ title: body.title.trim(), completed: false }),
  });
  const data = await r.json();
  return c.json({ todo: data[0] }, 201);
});

// PATCH /todos/:id
app.patch('/todos/:id', async c => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const update = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.completed !== undefined) update.completed = body.completed;

  const r = await sbFetch(`/todos?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(update),
  });
  const data = await r.json();
  if (!data.length) return c.json({ error: 'todo not found' }, 404);
  return c.json({ todo: data[0] });
});

// DELETE /todos/:id
app.delete('/todos/:id', async c => {
  const id = c.req.param('id');
  const check = await sbFetch(`/todos?id=eq.${id}&select=id`);
  const existing = await check.json();
  if (!existing.length) return c.json({ error: 'todo not found' }, 404);

  await sbFetch(`/todos?id=eq.${id}`, { method: 'DELETE' });
  return c.json({ message: 'deleted' });
});

export default handle(app);
