// Unauthorized access, shown as real HTTP answers from the hosted demo.
//   node demo/forbidden.mjs [--url http://129.225.92.29]
// A participant (DEMO Student) tries staff routes, then forges an admin token.
// DEMO Admin then reads the audit rows for role changes.
const args = process.argv.slice(2);
const at = args.indexOf('--url');
const BASE = (at >= 0 && args[at + 1] ? args[at + 1] : process.env.CODECLASH_URL ?? 'http://129.225.92.29').replace(/\/$/, '');
const PASSWORD = 'codeclash';

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 120) }; }
  return { status: response.status, body: json };
}

async function login(email) {
  const out = await call('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (out.status !== 200) throw new Error(`${email} could not sign in (${out.status}). Run demo\\reset-hosted.bat first.`);
  return out.body;
}

const student = await login('demo-student@codeclash.dev');
const me = student.user.id;
const contests = (await call('/api/contests')).body ?? [];
const cup = contests.find((c) => c.title === 'DEMO Integrity cup');

const [head, payload, signature] = student.access.split('.');
const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
const forged = [head, Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString('base64url'), signature].join('.');

const attempts = [
  ['no token', 'list every user', 'GET', '/api/admin/users', undefined],
  ['participant', 'list every user', 'GET', '/api/admin/users', student.access],
  ['participant', 'make itself admin', 'PUT', `/api/admin/users/${me}/role`, student.access, { role: 'admin' }],
  ['participant', 'read the audit log', 'GET', '/api/admin/audit', student.access],
  ['participant', 'watch live rounds', 'GET', '/api/control/live', student.access],
  ['participant', 'create a problem', 'POST', '/api/problems', student.access, { title: 'x', statement: 'x' }],
  ...(cup ? [['participant', 'read integrity pairs', 'GET', `/api/contests/${cup.id}/integrity`, student.access]] : []),
  ['forged token', 'claims role admin', 'GET', '/api/admin/users', forged],
];

console.log(`${BASE}  signed in as ${student.user.displayName} (role ${student.user.role})\n`);
let allRefused = true;
for (const [who, what, method, path, token, body] of attempts) {
  const out = await call(path, { token, method, body });
  const refused = out.status === 401 || out.status === 403;
  allRefused &&= refused;
  console.log(`  ${refused ? 'REFUSED' : 'ALLOWED'}  HTTP ${out.status}  ${who.padEnd(12)} ${what.padEnd(22)} ${method} ${path.replace(me, ':me')}  ${out.body?.error ?? ''}`);
}

const admin = await login('demo-admin@codeclash.dev');
const rows = (await call('/api/admin/audit?q=user.role', { token: admin.access })).body ?? [];
console.log(`\nLast role changes in the append-only audit log (read as ${admin.user.displayName}):`);
for (const row of rows.slice(0, 3)) console.log(`  ${new Date(row.at).toLocaleString()}  ${row.action}  target ${row.target}  -> ${row.decision}`);
if (rows.length === 0) console.log('  none yet');
console.log(`\n${allRefused ? 'PASS' : 'FAIL'}  every staff route refused the participant and the forged token`);
process.exit(allRefused ? 0 : 1);
