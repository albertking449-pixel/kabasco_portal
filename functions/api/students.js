export async function onRequest({ env }) {
  const { results } = await env.db.prepare("SELECT * FROM students LIMIT 100").all();
  return Response.json(results);
}
