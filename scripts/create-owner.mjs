import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
const passwordPath = '.private/owner-password';
try { await access(passwordPath); if (!process.argv.includes('--rotate')) throw new Error('Owner credential already exists. Use --rotate explicitly.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir('.private', { recursive: true, mode: 0o700 });
const password = randomBytes(24).toString('base64url'), salt = randomBytes(16).toString('hex');
const hash = salt + ':' + pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
await writeFile(passwordPath, password, { mode: 0o600 });
await writeFile('.private/owner-secret.secret.json', JSON.stringify({ OWNER_PASSWORD_HASH: hash }), { mode: 0o600 });
console.log('Owner password saved privately to .private/owner-password. Hash saved to .private/owner-secret.secret.json. No credential printed.');
console.log('Upload hash with wrangler pages secret bulk; increment SESSION_VERSION to revoke existing sessions. Never commit or publicly share these files.');
