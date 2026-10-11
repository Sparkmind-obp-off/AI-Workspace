import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, modelFor } from '../src/providers';
import { validateStep, executeStep } from '../src/tools';
import { readBody, verifyPassword } from '../src/security';
import worker from '../src/index';
test('demo is explicitly labeled without any provider fetch', async () => { const r = await generate({}, 'demo', [], () => { throw new Error('Must not fetch'); }); assert.equal(r.demo, true); assert.match(r.text, /MODE DEMO/); });
test('missing provider key fails closed instead of silently using demo', async () => { await assert.rejects(generate({}, 'groq', []), /GROQ_API_KEY/); await assert.rejects(generate({}, 'gemini', []), /GEMINI_API_KEY/); assert.throws(() => modelFor({}, 'unknown')); });
test('Groq request uses server-side header and bounded output', async () => {
  const mock: any = async (url: string, init: RequestInit) => { assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal((init.headers as any).authorization, 'Bearer test-only'); const body = JSON.parse(init.body as string); assert.equal(body.max_completion_tokens, 1200); assert.equal(body.model, 'configured-model'); return Response.json({ choices: [{ message: { content: 'Real answer' } }] }); };
  const r = await generate({ GROQ_API_KEY: 'test-only', GROQ_MODEL: 'configured-model' }, 'groq', [{ role: 'user', content: 'hi' }], mock); assert.equal(r.demo, false); assert.equal(r.text, 'Real answer');
});
test('Gemini key never enters query and roles are normalized', async () => {
  const mock: any = async (url: string, init: RequestInit) => { assert.ok(!url.includes('test-only')); const body = JSON.parse(init.body as string); assert.equal((init.headers as any)['x-goog-api-key'], 'test-only'); assert.equal(body.contents[1].role, 'model'); assert.equal(body.systemInstruction.parts[0].text, 'policy'); return Response.json({ candidates: [{ content: { parts: [{ text: 'Gemini' }] } }] }); };
  assert.equal((await generate({ GEMINI_API_KEY: 'test-only' }, 'gemini', [{ role: 'system', content: 'policy' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], mock)).text, 'Gemini');
});
test('provider errors do not disclose provider response bodies or secret', async () => { await assert.rejects(generate({ GROQ_API_KEY: 'test-only' }, 'groq', [], (async () => new Response('secret-body', { status: 429 })) as any), e => !String(e).includes('secret-body') && !String(e).includes('test-only')); });
test('provider timeout and empty response are controlled errors', async () => { await assert.rejects(generate({ GROQ_API_KEY: 'test-only' }, 'groq', [], (async () => { throw new Error('secret'); }) as any), /batas waktu/); await assert.rejects(generate({ GROQ_API_KEY: 'test-only' }, 'groq', [], (async () => Response.json({})) as any), /tidak menghasilkan teks/); });
test('shell, unrestricted URLs and malformed tools are denied', () => { for (const step of [{ tool: 'shell', input: { command: 'ls' } }, { tool: 'http.request', input: { url: 'http://169.254.169.254' } }, { tool: 'github.repo_info', input: { repo: 'a/b/../../secrets' } }, { tool: 'text.stats', input: { text: 'x'.repeat(6001) } }, { tool: 'json.format', input: { text: 'invalid' } }]) assert.throws(() => validateStep(step, {})); });
test('text and JSON tools execute deterministically, not simulated', async () => { assert.deepEqual(await executeStep({ tool: 'text.stats', input: { text: 'one two\nthree' } }, {}, 'demo'), { characters: 13, words: 3, lines: 2, executed: true }); assert.match((await executeStep({ tool: 'json.format', input: { text: '{"a":1}' } }, {}, 'demo')).formatted!, /"a": 1/); });
test('Apify requires token, allowlist and approved field schema', () => {
  const step = { tool: 'apify.run', input: { actor: 'owner~actor', actorInput: { query: 'hello' } } };
  assert.throws(() => validateStep(step, {})); assert.throws(() => validateStep(step, { APIFY_API_TOKEN: 'test-only' }));
  const env = { APIFY_API_TOKEN: 'test-only', APIFY_ACTORS: JSON.stringify([{ id: 'owner~actor', fields: { query: 'string' }, required: ['query'] }]) };
  assert.equal(validateStep(step, env).tool, 'apify.run'); assert.throws(() => validateStep({ ...step, input: { actor: 'owner~actor', actorInput: { url: 'http://localhost' } } }, env));
});
test('research cannot falsely report execution in demo mode', async () => { await assert.rejects(executeStep({ tool: 'research.synthesize', input: { text: 'source' } }, {}, 'demo'), /provider nyata/); });
test('API JSON validation rejects invalid, oversized, and wrong content type', async () => {
  await assert.rejects(readBody(new Request('https://example.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' })), /JSON/);
  await assert.rejects(readBody(new Request('https://example.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'x'.repeat(25000) }) })), /besar/);
  await assert.rejects(readBody(new Request('https://example.com', { method: 'POST', body: '{}' })), /application\/json/);
});
test('PBKDF2 verifier rejects wrong password', async () => { const crypto = await import('node:crypto'); const hash = crypto.pbkdf2Sync('correct', 'salt', 100000, 32, 'sha256').toString('hex'); assert.equal(await verifyPassword('correct', 'salt:' + hash), true); assert.equal(await verifyPassword('wrong', 'salt:' + hash), false); });
test('unauthenticated resource and foreign origin are denied', async () => {
  const env: any = { DB: {}, ALLOWED_ORIGIN: 'https://workspace.example' };
  assert.equal((await worker.fetch(new Request('https://workspace.example/api/conversations'), env)).status, 401);
  assert.equal((await worker.fetch(new Request('https://workspace.example/api/conversations', { headers: { origin: 'https://evil.example' } }), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://workspace.example/api/tasks', { method: 'POST' }), env)).status, 403);
});
