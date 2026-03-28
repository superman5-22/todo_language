// Express 4 — Vercel Serverless Function
const express = require('express');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

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

// GET /api/express/todos
app.get('/api/express/todos', async (req, res) => {
  try {
    const r = await sbFetch('/todos?select=*&order=created_at.desc');
    const todos = await r.json();
    res.json({ todos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/express/todos
app.post('/api/express/todos', async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const r = await sbFetch('/todos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ title: title.trim(), completed: false }),
    });
    const data = await r.json();
    res.status(201).json({ todo: data[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/express/todos/:id
app.patch('/api/express/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const update = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.completed !== undefined) update.completed = body.completed;

    const r = await sbFetch(`/todos?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(update),
    });
    const data = await r.json();
    if (!data.length) return res.status(404).json({ error: 'todo not found' });
    res.json({ todo: data[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/express/todos/:id
app.delete('/api/express/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const check = await sbFetch(`/todos?id=eq.${id}&select=id`);
    const existing = await check.json();
    if (!existing.length) return res.status(404).json({ error: 'todo not found' });

    await sbFetch(`/todos?id=eq.${id}`, { method: 'DELETE' });
    res.json({ message: 'deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
