export async function onRequestPost({ request, env }) {
  const { adm, pass, role } = await request.json();
  const table = role === 'teacher'? 'teachers' : role === 'admin'? 'admins' : 'students';
  const idField = role === 'student'? 'adm' : 'id';

  const { results } = await env.db.prepare(
    `SELECT * FROM ${table} WHERE ${idField} =? AND pass =? LIMIT 1`
  ).bind(adm, pass).all();

  if (results.length === 0) return Response.json({ error: "Invalid login" }, { status: 401 });
  return Response.json({ success: true, user: results[0] });
}
