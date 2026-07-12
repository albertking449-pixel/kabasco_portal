// src/index.js
// Cloudflare Worker for the Kabalega Secondary School portal.
// Bindings expected (see wrangler.toml):
//   env.DB              -> D1 database "kabasco_portal"
//   env.ALLOWED_ORIGIN  -> string, e.g. "*" or "https://yoursite.com"

const TABLE_SETUP = `
CREATE TABLE IF NOT EXISTS portal_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}

async function ensureTable(env) {
  await env.DB.exec(TABLE_SETUP.trim());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Health check — this is what you saw at "/"
    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "kabasco-portal-api" }, 200, env);
    }

    if (url.pathname === "/api/state") {
      try {
        await ensureTable(env);

        if (request.method === "GET") {
          const row = await env.DB
            .prepare("SELECT data FROM portal_state WHERE id = 1")
            .first();
          if (!row) {
            // No saved state yet — front-end will seed it via POST.
            return json({}, 200, env);
          }
          return new Response(row.data, {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders(env) },
          });
        }

        if (request.method === "POST") {
          let body;
          try {
            body = await request.text();
            JSON.parse(body); // validate it's real JSON before storing
          } catch (e) {
            return json({ ok: false, error: "Invalid JSON body" }, 400, env);
          }
          await env.DB
            .prepare(
              `INSERT INTO portal_state (id, data, updated_at)
               VALUES (1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
            )
            .bind(body, new Date().toISOString())
            .run();
          return json({ ok: true }, 200, env);
        }

        return json({ ok: false, error: "Method not allowed" }, 405, env);
      } catch (err) {
        return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500, env);
      }
    }

    return json({ ok: false, error: "Not found" }, 404, env);
  },
};
