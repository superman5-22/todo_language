/**
 * api/nodejs/[...path].js
 * Node.js (http module) implementation of the TODO API.
 *
 * Vercel Serverless Function — catch-all route handles:
 *   GET    /api/nodejs/todos
 *   POST   /api/nodejs/todos
 *   PATCH  /api/nodejs/todos/:id
 *   DELETE /api/nodejs/todos/:id
 *
 * Runtime: nodejs20.x (Vercel default)
 * DB:      Supabase REST API
 *
 * Required env vars (set in Vercel dashboard):
 *   SUPABASE_URL              https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role secret key
 */

'use strict';

const https = require('https');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY } = process.env;

const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Supabase REST helper
// Uses the HTTP module directly — no external dependencies needed.
// ---------------------------------------------------------------------------
function sbFetch(method, endpoint, body) {
    const url     = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    const payload = body != null ? JSON.stringify(body) : null;

    const headers = {
        apikey:          SUPABASE_KEY,
        Authorization:   `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        Prefer:          'return=representation',   // always return the affected rows
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    };

    return new Promise((resolve, reject) => {
        const req = https.request(
            { hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers },
            (r) => {
                let raw = '';
                r.on('data', (chunk) => { raw += chunk; });
                r.on('end', () => {
                    let data = null;
                    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
                    resolve({ status: r.statusCode, data });
                });
            },
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Vercel handler
// req.query.path is populated by the [...path] catch-all segment.
//   /api/nodejs/todos       → path = ['todos']
//   /api/nodejs/todos/:id   → path = ['todos', ':id']
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
    // ---- CORS (belt-and-suspenders alongside vercel.json headers config) ---
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    res.setHeader('Content-Type', 'application/json');

    // ---- Guard: env vars must be configured --------------------------------
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        res.status(500).json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set' });
        return;
    }

    // ---- Route parsing -----------------------------------------------------
    // req.query.path: string[] from the catch-all segment
    const segs     = [].concat(req.query.path || []);
    const resource = segs[0];   // expected: 'todos'
    const id       = segs[1];   // UUID or undefined

    if (resource !== 'todos') {
        res.status(404).json({ error: 'not found' });
        return;
    }

    if (id !== undefined && !UUID_RE.test(id)) {
        res.status(400).json({ error: 'invalid id format' });
        return;
    }

    try {
        // ==================================================================
        // Collection: GET /todos   POST /todos
        // ==================================================================
        if (!id) {
            // ---- GET /todos -----------------------------------------------
            if (req.method === 'GET') {
                const { data } = await sbFetch('GET', 'todos?select=*&order=created_at.desc');
                res.status(200).json({ todos: Array.isArray(data) ? data : [] });
                return;
            }

            // ---- POST /todos ----------------------------------------------
            if (req.method === 'POST') {
                const title = ((req.body?.title) ?? '').trim();
                if (!title) {
                    res.status(400).json({ error: 'title is required' });
                    return;
                }
                const { data } = await sbFetch('POST', 'todos', { title, completed: false });
                const todo = Array.isArray(data) ? data[0] : data;
                res.status(201).json({ todo });
                return;
            }
        }

        // ==================================================================
        // Single item: PATCH /todos/:id   DELETE /todos/:id
        // ==================================================================
        if (id) {
            // ---- PATCH /todos/:id -----------------------------------------
            if (req.method === 'PATCH') {
                const body  = req.body ?? {};
                const patch = {};

                if (body.title !== undefined)     patch.title     = String(body.title).trim();
                if (body.completed !== undefined) patch.completed = Boolean(body.completed);

                if (Object.keys(patch).length === 0) {
                    res.status(400).json({ error: 'no fields to update' });
                    return;
                }

                const { data } = await sbFetch('PATCH', `todos?id=eq.${id}`, patch);
                const todo = Array.isArray(data) ? data[0] : null;

                if (!todo) {
                    res.status(404).json({ error: 'todo not found' });
                    return;
                }
                res.status(200).json({ todo });
                return;
            }

            // ---- DELETE /todos/:id ----------------------------------------
            if (req.method === 'DELETE') {
                const { data } = await sbFetch('DELETE', `todos?id=eq.${id}`);

                // Supabase returns [] when the row didn't exist
                if (Array.isArray(data) && data.length === 0) {
                    res.status(404).json({ error: 'todo not found' });
                    return;
                }
                res.status(200).json({ message: 'deleted' });
                return;
            }
        }

        res.status(405).json({ error: 'method not allowed' });

    } catch (err) {
        console.error('[api/nodejs] Error:', err.message);
        res.status(500).json({ error: 'internal server error' });
    }
};
