import { ApiError, generate, connectionTest, modelFor, type ProviderEnv, type Message } from './providers';
import { hash, verifyPassword, limited, readBody, text, id } from './security';
import { validateStep, executeStep, apifyStatus, toolNames, type ToolEnv, type Step } from './tools';
export interface Env extends ProviderEnv, ToolEnv { DB: D1Database; ASSETS?: Fetcher; ALLOWED_ORIGIN?: string; OWNER_PASSWORD_HASH?: string; SESSION_VERSION?: string }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const stmt = (env: Env, sql: string, ...params: any[]) => env.DB.prepare(sql).bind(...params);
async function owned(env: Env, table: 'conversations' | 'agent_tasks', resourceId: string, user: string): Promise<any> {
  const row = await stmt(env, `SELECT * FROM ${table} WHERE id=? AND user_id=?`, id(resourceId), user).first();
  if (!row) throw new ApiError(404, 'Resource tidak ditemukan.'); return row;
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'Static assets unavailable' }, 404);
  if (path === '/api/health' && method === 'GET') return json({ ok: true, app: 'ai-workspace', databaseConfigured: Boolean(env.DB), authenticationConfigured: Boolean(env.OWNER_PASSWORD_HASH) });
  if (!env.DB) throw new ApiError(503, 'Binding D1 DB belum dikonfigurasi.');
  const allowed = (env.ALLOWED_ORIGIN || url.origin).split(',').map(v => v.trim());
  const origin = request.headers.get('origin');
  if (origin && !allowed.includes(origin)) throw new ApiError(403, 'Origin tidak diizinkan.');
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!['GET', 'HEAD'].includes(method) && (!origin || !allowed.includes(origin) || request.headers.get('x-workspace-request') !== '1')) throw new ApiError(403, 'Pemeriksaan CSRF gagal.');
  if (path === '/api/auth/login' && method === 'POST') {
    if (!env.OWNER_PASSWORD_HASH) throw new ApiError(503, 'OWNER_PASSWORD_HASH belum dikonfigurasi.');
    const ip = await hash(request.headers.get('cf-connecting-ip') || 'local');
    await limited(env.DB, `login:${ip}`, 5, 900);
    const body = await readBody(request);
    if (!await verifyPassword(text(body.password, 200), env.OWNER_PASSWORD_HASH)) throw new ApiError(401, 'Kredensial login tidak valid.');
    const token = crypto.randomUUID() + crypto.randomUUID();
    await stmt(env, 'INSERT INTO sessions (token_hash,user_id,expires_at,version) VALUES (?,?,?,?)', await hash(token), 'owner', Date.now() + 86400000, env.SESSION_VERSION || '1').run();
    const response = json({ user: { id: 'owner', name: 'Workspace owner' } });
    response.headers.set('set-cookie', `workspace_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`); return response;
  }
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)workspace_session=([^;]+)/)?.[1];
  const session = token && await stmt(env, 'SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>? AND version=?', await hash(token), Date.now(), env.SESSION_VERSION || '1').first<{ user_id: string }>();
  if (!session) throw new ApiError(401, 'Login diperlukan.');
  const user = session.user_id;
  await limited(env.DB, `requests:${user}`, 120, 60);
  if (path === '/api/auth/me' && method === 'GET') return json({ user: { id: user, name: 'Workspace owner' } });
  if (path === '/api/auth/logout' && method === 'POST') {
    await stmt(env, 'DELETE FROM sessions WHERE token_hash=?', await hash(token!)).run();
    const response = json({ ok: true }); response.headers.set('set-cookie', 'workspace_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'); return response;
  }
  if (path === '/api/settings' && method === 'GET') {
    await env.DB.batch([stmt(env, 'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 500)', Date.now()), stmt(env, 'DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE expires_at<? LIMIT 500)', Date.now())]);
    const settings = await stmt(env, 'SELECT provider FROM user_settings WHERE user_id=?', user).first();
    const usage = await stmt(env, 'SELECT count FROM rate_limits WHERE key=? AND bucket=?', `model:${user}`, Math.floor(Date.now() / 86400000)).first<any>();
    return json({ usage: { modelCallsToday: usage?.count || 0 }, providers: [{ id: 'groq', configured: Boolean(env.GROQ_API_KEY), model: modelFor(env, 'groq') }, { id: 'gemini', configured: Boolean(env.GEMINI_API_KEY), model: modelFor(env, 'gemini') }, { id: 'demo', configured: true, model: 'demo' }], apify: { configured: Boolean(env.APIFY_API_TOKEN), actors: JSON.parse(env.APIFY_ACTORS || '[]').map((a: any) => ({ id: a.id, fields: a.fields, required: a.required || [] })) }, tools: toolNames, provider: (settings as any)?.provider || (env.GROQ_API_KEY ? 'groq' : env.GEMINI_API_KEY ? 'gemini' : 'demo'), limits: { dailyModelCalls: 100, maxAgentSteps: 3, outputTokens: 1200 } });
  }
  if (path === '/api/settings' && method === 'PUT') {
    const body = await readBody(request); modelFor(env, body.provider);
    await stmt(env, 'INSERT INTO user_settings (user_id,provider) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider', user, body.provider).run(); return json({ ok: true });
  }
  if (path === '/api/providers/test' && method === 'POST') { const body = await readBody(request); await limited(env.DB, `test:${user}`, 10, 3600); return json(await connectionTest(env, body.provider)); }
  if (path === '/api/conversations' && method === 'GET') return json({ conversations: (await stmt(env, 'SELECT id,title,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 100', user).all()).results });
  if (path === '/api/conversations' && method === 'POST') {
    const resourceId = crypto.randomUUID(); await stmt(env, 'INSERT INTO conversations (id,user_id) VALUES (?,?)', resourceId, user).run(); return json({ id: resourceId }, 201);
  }
  const conversationMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversationMatch) {
    const c = await owned(env, 'conversations', conversationMatch[1], user);
    if (method === 'GET') return json({ conversation: c, messages: (await stmt(env, 'SELECT id,role,content,status,provider,created_at FROM messages WHERE conversation_id=? ORDER BY created_at,rowid', c.id).all()).results });
    if (method === 'DELETE') { if (c.busy_until > Date.now()) throw new ApiError(409, 'Percakapan sedang diproses.'); await stmt(env, 'DELETE FROM conversations WHERE id=? AND user_id=?', c.id, user).run(); return json({ ok: true }); }
  }
  if (path === '/api/chat' && method === 'POST') {
    const body = await readBody(request); const c = await owned(env, 'conversations', body.conversationId, user);
    const provider = text(body.provider, 20); modelFor(env, provider);
    const requestId = id(body.requestId), content = text(body.content);
    const existing: any = await stmt(env, 'SELECT * FROM messages WHERE id=? AND conversation_id=?', requestId, c.id).first();
    if (existing && existing.content !== content) throw new ApiError(409, 'ID permintaan sudah digunakan untuk pesan lain.');
    if (existing?.status === 'completed') { const reply = await stmt(env, 'SELECT content,provider FROM messages WHERE reply_to=?', requestId).first<any>(); return json({ reply: reply.content, demo: reply.provider === 'demo', reused: true }); }
    const claim = await stmt(env, 'UPDATE conversations SET busy_until=? WHERE id=? AND user_id=? AND busy_until<?', Date.now() + 60000, c.id, user, Date.now()).run();
    if (!claim.meta.changes) throw new ApiError(409, 'Percakapan sedang diproses. Tunggu lalu coba lagi.');
    try {
      await limited(env.DB, `chat:${user}`, 10, 60); if (provider !== 'demo') await limited(env.DB, `model:${user}`, 100, 86400);
      if (!existing) await stmt(env, "INSERT INTO messages (id,conversation_id,role,content,status,provider) VALUES (?,?,'user',?,'pending',?)", requestId, c.id, content, provider).run();
      else await stmt(env, "UPDATE messages SET status='pending' WHERE id=?", requestId).run();
      const history = (await stmt(env, "SELECT role,content FROM messages WHERE conversation_id=? AND (status='completed' OR id=?) ORDER BY created_at DESC,rowid DESC LIMIT 20", c.id, requestId).all<Message>()).results.reverse();
      // Bound context, not just individual messages.
      const bounded: Message[] = []; let length = 0;
      for (const m of [...history].reverse()) { if (length + m.content.length > 30000) break; bounded.unshift(m); length += m.content.length; }
      const result = await generate(env, provider, [{ role: 'system', content: 'Kamu AI-Workspace. Jawab dengan jujur dalam bahasa pengguna. Chat tidak memiliki tools atau browsing. Jangan mengaku telah melakukan tindakan eksternal.' }, ...bounded]);
      await env.DB.batch([
        stmt(env, "INSERT INTO messages (id,conversation_id,role,content,status,provider,reply_to) VALUES (?,?,'assistant',?,'completed',?,?)", crypto.randomUUID(), c.id, result.text, provider, requestId),
        stmt(env, "UPDATE messages SET status='completed' WHERE id=?", requestId),
        stmt(env, "UPDATE conversations SET title=CASE WHEN title='Percakapan baru' THEN ? ELSE title END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", content.slice(0, 70), c.id)
      ]);
      return json({ reply: result.text, demo: result.demo, model: result.model });
    } catch (e) { await stmt(env, "UPDATE messages SET status='failed' WHERE id=? AND conversation_id=?", requestId, c.id).run(); throw e; }
    finally { await stmt(env, 'UPDATE conversations SET busy_until=0 WHERE id=?', c.id).run(); }
  }
  return agentRoutes(request, env, user, path, method);
}
async function taskView(env: Env, taskId: string, user: string) {
  let task = await owned(env, 'agent_tasks', taskId, user);
  if (task.status === 'running' && Date.now() - Date.parse(task.updated_at + 'Z') > 120000) {
    const error = 'Request terputus; status eksternal mungkin tidak diketahui. Tidak diulang otomatis.';
    await env.DB.batch([stmt(env, "UPDATE agent_tasks SET status='failed',error=? WHERE id=? AND status='running'", error, taskId), stmt(env, "UPDATE agent_steps SET status='failed' WHERE task_id=? AND status='running'", taskId), stmt(env, "UPDATE tool_runs SET status='failed',error=? WHERE task_id=? AND status='running'", error, taskId)]);
    task = await owned(env, 'agent_tasks', taskId, user);
  }
  return { task, steps: (await stmt(env, 'SELECT * FROM agent_steps WHERE task_id=? ORDER BY position', task.id).all()).results, approvals: (await stmt(env, 'SELECT * FROM approvals WHERE task_id=? ORDER BY created_at', task.id).all()).results, logs: (await stmt(env, 'SELECT * FROM tool_runs WHERE task_id=? ORDER BY created_at,rowid', task.id).all()).results };
}
async function agentRoutes(request: Request, env: Env, user: string, path: string, method: string): Promise<Response> {
  if (path === '/api/tasks' && method === 'GET') return json({ tasks: (await stmt(env, 'SELECT id,input,status,created_at FROM agent_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 50', user).all()).results });
  if (path === '/api/tasks' && method === 'POST') {
    const body = await readBody(request), objective = text(body.objective, 4000), provider = text(body.provider, 20);
    modelFor(env, provider); await limited(env.DB, `tasks:${user}`, 20, 86400);
    let steps: Step[];
    if (body.steps !== undefined) {
      if (!Array.isArray(body.steps)) throw new ApiError(400, 'steps harus berupa array.');
      steps = body.steps;
    } else if (provider === 'demo') steps = [{ tool: 'text.stats', input: { text: objective } }];
    else {
      await limited(env.DB, `model:${user}`, 100, 86400);
      const result = await generate(env, provider, [{ role: 'system', content: 'Buat rencana tool nyata. Kembalikan HANYA JSON {"steps":[{"tool":"...","input":{...}}]}. Maksimal 3 langkah independen dengan input lengkap; tidak ada variable reference. Tools: text.stats input {text:string}; json.format input {text:string JSON}; github.repo_info input {repo:"owner/repo"} hanya metadata publik; research.synthesize input {text:string} sintesis teks, BUKAN pencarian web. Jangan membuat sumber, menjalankan shell, mengakses secret, atau merencanakan apify. Semua langkah perlu approval pengguna.' }, { role: 'user', content: objective }]);
      try { steps = JSON.parse(result.text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')).steps; } catch { throw new ApiError(502, 'Planner tidak memberi JSON valid. Pilih tool secara manual.'); }
    }
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 3) throw new ApiError(400, 'Agent memerlukan 1–3 langkah.');
    steps = steps.map(s => validateStep(s, env));
    const taskId = crypto.randomUUID();
    await env.DB.batch([
      stmt(env, "INSERT INTO agent_tasks (id,user_id,status,input,plan_json,provider) VALUES (?,?,'waiting_approval',?,?,?)", taskId, user, objective, JSON.stringify(steps), provider),
      ...steps.map((s, i) => stmt(env, "INSERT INTO agent_steps (id,task_id,position,tool_name,input_json,status) VALUES (?,?,?,?,?,'pending')", crypto.randomUUID(), taskId, i, s.tool, JSON.stringify(s.input))),
      stmt(env, "INSERT INTO approvals (id,task_id,action_type,action_summary) VALUES (?,?,'execute_plan',?)", crypto.randomUUID(), taskId, JSON.stringify(steps))
    ]);
    return json(await taskView(env, taskId, user), 201);
  }
  const match = path.match(/^\/api\/tasks\/([^/]+)(?:\/(approve|reject|run|cancel|apify-status))?$/);
  if (!match) return json({ error: 'Not found' }, 404);
  const task = await owned(env, 'agent_tasks', match[1], user), action = match[2];
  if (!action && method === 'GET') return json(await taskView(env, task.id, user));
  if (!action && method === 'DELETE') {
    if (task.status === 'running') throw new ApiError(409, 'Task sedang berjalan; tunggu sebelum menghapus.');
    await stmt(env, 'DELETE FROM agent_tasks WHERE id=? AND user_id=?', task.id, user).run(); return json({ ok: true });
  }
  if (method !== 'POST') throw new ApiError(405, 'Method tidak diizinkan.');
  if (action === 'approve' || action === 'reject') {
    const decision = action === 'approve' ? 'approved' : 'rejected';
    if (task.status !== 'waiting_approval') throw new ApiError(409, 'Task tidak menunggu approval.');
    if (Date.now() - Date.parse(task.created_at + (task.created_at.endsWith('Z') ? '' : 'Z')) > 3600000) throw new ApiError(409, 'Approval kedaluwarsa. Buat task baru.');
    await env.DB.batch([stmt(env, "UPDATE approvals SET status=?,decided_at=datetime('now') WHERE task_id=? AND status='pending'", decision, task.id), stmt(env, "UPDATE agent_tasks SET status=? WHERE id=? AND status='waiting_approval'", action === 'approve' ? 'queued' : 'cancelled', task.id)]);
  } else if (action === 'cancel') {
    if (task.status === 'running') throw new ApiError(409, 'Langkah sedang berjalan; tunggu selesai.');
    await stmt(env, "UPDATE agent_tasks SET status='cancelled' WHERE id=? AND status IN ('queued','waiting_approval')", task.id).run();
  } else if (action === 'run') {
    const approval = await stmt(env, "SELECT id FROM approvals WHERE task_id=? AND status='approved'", task.id).first();
    if (!approval) throw new ApiError(403, 'Approval pemilik wajib sebelum menjalankan tool.');
    const claim = await stmt(env, "UPDATE agent_tasks SET status='running',updated_at=datetime('now') WHERE id=? AND status='queued'", task.id).run();
    if (!claim.meta.changes) throw new ApiError(409, 'Task sudah berjalan atau tidak dapat dijalankan.');
    const step: any = await stmt(env, "SELECT * FROM agent_steps WHERE task_id=? AND status='pending' ORDER BY position LIMIT 1", task.id).first();
    if (!step) { await stmt(env, "UPDATE agent_tasks SET status='completed' WHERE id=?", task.id).run(); return json(await taskView(env, task.id, user)); }
    const runId = crypto.randomUUID();
    await env.DB.batch([stmt(env, "UPDATE agent_steps SET status='running' WHERE id=?", step.id), stmt(env, "INSERT INTO tool_runs (id,task_id,tool_name,status,input_json) VALUES (?,?,?,'running',?)", runId, task.id, step.tool_name, step.input_json)]);
    try {
      if (step.tool_name === 'research.synthesize') await limited(env.DB, `model:${user}`, 100, 86400);
      if (step.tool_name === 'apify.run') await limited(env.DB, `apify:${user}`, 2, 86400);
      const started = Date.now(); const output = JSON.stringify(await executeStep({ tool: step.tool_name, input: JSON.parse(step.input_json) }, env, task.provider));
      await env.DB.batch([stmt(env, "UPDATE agent_steps SET status='succeeded',output_json=? WHERE id=?", output, step.id), stmt(env, "UPDATE tool_runs SET status='succeeded',output_json=?,duration_ms=? WHERE id=?", output, Date.now() - started, runId)]);
      const more = await stmt(env, "SELECT id FROM agent_steps WHERE task_id=? AND status='pending' LIMIT 1", task.id).first();
      await stmt(env, 'UPDATE agent_tasks SET status=?,result_json=?,updated_at=datetime(\'now\') WHERE id=?', more ? 'queued' : 'completed', output, task.id).run();
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'Tool gagal atau status eksternal tidak diketahui. Tidak diulang otomatis.';
      await env.DB.batch([stmt(env, "UPDATE agent_steps SET status='failed' WHERE id=?", step.id), stmt(env, "UPDATE tool_runs SET status='failed',error=? WHERE id=?", error, runId), stmt(env, "UPDATE agent_tasks SET status='failed',error=? WHERE id=?", error, task.id)]);
    }
  } else if (action === 'apify-status') {
    const run: any = await stmt(env, "SELECT id,output_json FROM tool_runs WHERE task_id=? AND tool_name='apify.run' AND status='succeeded' ORDER BY rowid DESC LIMIT 1", task.id).first();
    if (!run) throw new ApiError(404, 'Tidak ada run Apify yang tersimpan pada task ini.');
    const previous = JSON.parse(run.output_json), output = await apifyStatus(env, previous.runId);
    await stmt(env, 'UPDATE tool_runs SET output_json=? WHERE id=?', JSON.stringify(output), run.id).run();
  } else throw new ApiError(404, 'Action tidak dikenal.');
  return json(await taskView(env, task.id, user));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try { response = await handle(request, env); } catch (e) { response = json({ error: e instanceof ApiError ? e.message : 'Kesalahan internal. Hubungi pemilik workspace.' }, e instanceof ApiError ? e.status : 500); }
    response = new Response(response.body, response);
    response.headers.set('x-content-type-options', 'nosniff'); response.headers.set('referrer-policy', 'no-referrer');
    response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    response.headers.set('strict-transport-security', 'max-age=31536000');
    const origin = request.headers.get('origin'); if (origin && (env.ALLOWED_ORIGIN || '').split(',').map(v => v.trim()).includes(origin)) { response.headers.set('access-control-allow-origin', origin); response.headers.set('access-control-allow-credentials', 'true'); response.headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS'); response.headers.set('access-control-allow-headers', 'content-type,x-workspace-request'); response.headers.set('vary', 'Origin'); }
    return response;
  }
};
