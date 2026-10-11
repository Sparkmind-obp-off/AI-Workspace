import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [/\b(?:gsk_|apify_api_|cfat_|cfut_)[A-Za-z0-9]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let actual = [];
try { actual = Object.values(JSON.parse(await readFile('.private/secrets.secret.json', 'utf8'))).filter(v => typeof v === 'string' && v.length > 12); } catch {}
let failures = 0;
for (const file of files) {
  if (file.startsWith('.private/') || file.includes('.dev.vars') || /(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.example')) { console.error('Forbidden sensitive file tracked:', file); failures++; continue; }
  const content = await readFile(file, 'utf8');
  if (patterns.some(p => p.test(content)) || actual.some(s => content.includes(s))) { console.error('Possible secret in tracked file:', file); failures++; }
}
if (failures) process.exit(1);
console.log(`Secret scan passed for ${files.length} tracked files. Values were not printed. This is not a substitute for rotating leaked credentials.`);
