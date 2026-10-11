import { ApiError } from './providers';
export const text = (v: unknown, max = 6000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new ApiError(400, `Teks wajib diisi, maksimal ${max} karakter.`); return v.trim(); };
export async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  const actual = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return difference === 0;
}
export async function limited(db: D1Database, key: string, limit: number, seconds: number) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const row = await db.prepare('INSERT INTO rate_limits (key,bucket,count,expires_at) VALUES (?,?,1,?) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1 RETURNING count').bind(key, bucket, (bucket + 1) * seconds * 1000).first<{ count: number }>();
  if (!row || row.count > limit) throw new ApiError(429, 'Batas penggunaan tercapai. Tunggu sebelum mencoba lagi.');
}
export async function readBody(req: Request): Promise<any> {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Gunakan application/json.');
  if (Number(req.headers.get('content-length')) > 24000) throw new ApiError(413, 'Payload terlalu besar.');
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, 'Body diperlukan.');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 24000) { await reader.cancel(); throw new ApiError(413, 'Payload terlalu besar.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const result = JSON.parse(new TextDecoder().decode(bytes)); if (!result || Array.isArray(result) || typeof result !== 'object') throw 0; return result; } catch { throw new ApiError(400, 'JSON tidak valid.'); }
}
export const id = (value: unknown) => { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new ApiError(400, 'ID tidak valid.'); return value; };
