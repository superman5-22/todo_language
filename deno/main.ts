// Deno — Deploy to Deno Deploy
// deno run --allow-net --allow-env main.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function sbHeaders(prefer?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) h["Prefer"] = prefer;
  return h;
}

async function sbFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...sbHeaders(), ...(opts.headers as Record<string, string> || {}) },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/deno/, "");
  const idMatch = path.match(/^\/todos\/([^/]+)$/);

  // GET /todos
  if (req.method === "GET" && path === "/todos") {
    const todos = await sbFetch("/todos?select=*&order=created_at.desc");
    return json(200, { todos });
  }

  // POST /todos
  if (req.method === "POST" && path === "/todos") {
    const body = await req.json().catch(() => ({}));
    const title = (body.title ?? "").trim();
    if (!title) return json(400, { error: "title is required" });

    const data = await sbFetch("/todos", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title, completed: false }),
    }) as unknown[];
    return json(201, { todo: data[0] });
  }

  // PATCH /todos/:id
  if (req.method === "PATCH" && idMatch) {
    const id = idMatch[1];
    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};
    if (body.title !== undefined)     update.title     = body.title;
    if (body.completed !== undefined) update.completed = body.completed;

    const data = await sbFetch(`/todos?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update),
    }) as unknown[];
    if (!data.length) return json(404, { error: "todo not found" });
    return json(200, { todo: data[0] });
  }

  // DELETE /todos/:id
  if (req.method === "DELETE" && idMatch) {
    const id = idMatch[1];
    const existing = await sbFetch(`/todos?id=eq.${id}&select=id`) as unknown[];
    if (!existing.length) return json(404, { error: "todo not found" });

    await sbFetch(`/todos?id=eq.${id}`, { method: "DELETE" });
    return json(200, { message: "deleted" });
  }

  return json(404, { error: "not found" });
}

const port = parseInt(Deno.env.get("PORT") ?? "8080");
Deno.serve({ port }, handler);
