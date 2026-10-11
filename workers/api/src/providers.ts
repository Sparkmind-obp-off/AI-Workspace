export type Message = { role: 'user' | 'assistant' | 'system'; content: string };
export interface ProviderEnv { GROQ_API_KEY?: string; GEMINI_API_KEY?: string; GROQ_MODEL?: string; GEMINI_MODEL?: string }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function modelFor(env: ProviderEnv, provider: string) {
  if (provider === 'groq') return env.GROQ_MODEL || 'openai/gpt-oss-20b';
  if (provider === 'gemini') return env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (provider === 'demo') return 'demo';
  throw new ApiError(400, 'Provider tidak dikenal.');
}
export async function generate(env: ProviderEnv, provider: string, messages: Message[], transport: typeof fetch = fetch) {
  const model = modelFor(env, provider);
  if (provider === 'demo') return { text: 'MODE DEMO: Pesan diterima dan disimpan. Pilih provider yang dikonfigurasi untuk jawaban AI sungguhan. Agent text.stats tetap dapat dieksekusi tanpa model.', demo: true, model };
  const key = provider === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, `Konfigurasikan ${provider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'} sebagai Worker secret.`);
  let url: string, init: RequestInit;
  if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    init = { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, temperature: 0.5, max_completion_tokens: 1200 }) };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    init = { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') }] }, generationConfig: { maxOutputTokens: 1200, temperature: 0.5 } }) };
  }
  let response: Response;
  try { response = await transport(url, { ...init, signal: AbortSignal.timeout(45000) }); }
  catch { throw new ApiError(504, 'Provider tidak merespons dalam batas waktu. Coba ulang secara manual.'); }
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, `Provider gagal (${response.status}). Periksa secret, model, dan kuota di dashboard provider.`);
  const data: any = await response.json();
  const text = provider === 'groq' ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('');
  if (!text || typeof text !== 'string') throw new ApiError(502, 'Provider tidak menghasilkan teks (kemungkinan safety filter).');
  return { text: text.slice(0, 20000), demo: false, model, usage: data.usage || data.usageMetadata || null };
}
export async function connectionTest(env: ProviderEnv, provider: string) {
  modelFor(env, provider);
  if (provider === 'demo') return { connected: true, demo: true };
  const key = provider === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, 'Secret provider belum dikonfigurasi.');
  const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/models' : 'https://generativelanguage.googleapis.com/v1beta/models';
  const headers: Record<string, string> = provider === 'groq' ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key };
  const response = await fetch(url, { headers: headers as Record<string, string>, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ApiError(502, `Uji koneksi provider gagal (${response.status}).`);
  const data: any = await response.json();
  const models = provider === 'groq' ? data.data?.map((m: any) => m.id) : data.models?.map((m: any) => m.name.replace('models/', ''));
  return { connected: true, modelAvailable: models?.includes(modelFor(env, provider)) === true };
}
