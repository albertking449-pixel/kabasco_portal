/**
 * Kabasco Portal API — Cloudflare Worker + D1
 *
 * Exposes:
 *   GET  /api/state   -> returns the saved portal state as JSON ({} if none saved yet)
 *   POST /api/state    -> body is the full portal state JSON, overwrites the saved row
 *
 * The D1 database is bound in wrangler.toml as `db` (database name: kabasco_portal),
 * so inside this Worker it's always accessed as `env.db`.
 */

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function getState(env) {
  const row = await env.db
    .prepare("SELECT data FROM portal_state WHERE id = ?")
    .bind("state")
    .first();

  if (!row) {
    // No row yet — seed one so future writes have something to UPDATE.
    await env.db
      .prepare(
        "INSERT OR IGNORE INTO portal_state (id, data, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .bind("state", "{}")
      .run();
    return {};
  }

  try {
    return JSON.parse(row.data);
  } catch (e) {
    return {};
  }
}

async function saveState(env, stateObj) {
  const data = JSON.stringify(stateObj);
  await env.db
    .prepare(
      `INSERT INTO portal_state (id, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .bind("state", data)
    .run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      try {
        const state = await getState(env);
        return json(state, 200, env);
      } catch (e) {
        return json({ error: "Failed to read state", detail: String(e) }, 500, env);
      }
    }

    if (url.pathname === "/api/state" && request.method === "POST") {
      try {
        const body = await request.json();
        await saveState(env, body);
        return json({ ok: true }, 200, env);
      } catch (e) {
        return json({ error: "Failed to save state", detail: String(e) }, 500, env);
      }
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "kabasco-portal-api" }, 200, env);
    }

    return json({ error: "Not found" }, 404, env);
  },
};
