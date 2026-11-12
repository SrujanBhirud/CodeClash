// Rehearse the Leap year authoring flow through the API, as DEMO Setter, and print what hardening finds.
//   node demo/rehearse-authoring.mjs [--url http://129.225.92.29] [--keep]
// Afterwards run reset-hosted.bat: it deletes every problem DEMO Setter wrote.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--url');
const BASE = (at >= 0 ? args[at + 1] : 'http://129.225.92.29').replace(/\/$/, '');

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (response.status >= 400) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`);
  return json;
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fields = readFileSync(join(here, 'authoring', 'leap-year-fields.txt'), 'utf8').replace(/\r\n/g, '\n');
const block = (after) => fields.split(after)[1].split('-----\n')[1].replace(/\n$/, '');
const statement = block('Statement (paste everything between the lines):\n');
const reference = readFileSync(join(here, 'authoring', 'reference.py'), 'utf8');
const editorial = block('Editorial:\n');

const login = await call('/api/auth/login', { method: 'POST', body: { email: 'demo-setter@codeclash.dev', password: 'codeclash' } });
const token = login.access;
const created = await call('/api/problems', {
  token, method: 'POST',
  body: {
    title: 'Leap year', statement, editorial, tags: ['math', 'implementation'], difficulty: 'easy', visibility: 'private',
    samples: 'Input\n2024\nOutput\nLeap\n\nInput\n2023\nOutput\nCommon\n',
  },
});
const { versionId, problemId } = created;
console.log(`created Leap year: problem ${problemId}, version ${versionId}`);
await call(`/api/problem-versions/${versionId}`, { token, method: 'PATCH', body: { inputSpec: 'y int 1..9999' } });
const zip = readFileSync(join(here, 'authoring', 'leap-year-tests.zip')).toString('base64');
console.log('zip upload:', await call(`/api/problem-versions/${versionId}/tests-zip`, { token, method: 'POST', body: { zipBase64: zip } }));
const version = await call(`/api/problem-versions/${versionId}`, { token });
await call(`/api/problem-versions/${versionId}/tests`, {
  token, method: 'PUT',
  body: {
    tests: version.tests,
    reference: { language: 'python', code: reference },
    wrongSolutions: [
      { label: 'forgets the century rule', language: 'python', code: 'y = int(input())\nprint("Leap" if y % 4 == 0 else "Common")\n' },
      { label: 'every even year', language: 'python', code: 'y = int(input())\nprint("Leap" if y % 2 == 0 else "Common")\n' },
    ],
  },
});

async function publishCheck(id) {
  await call(`/api/problem-versions/${id}/publish-check`, { token, method: 'POST' });
  for (;;) {
    await wait(2000);
    const row = await call(`/api/problem-versions/${id}`, { token });
    if (row.status !== 'checking') return row;
  }
}
const first = await publishCheck(versionId);
console.log(`publish check: ${first.status}  ${JSON.stringify(first.report)}`);

const started = await call(`/api/problem-versions/${versionId}/hardening-runs`, { token, method: 'POST' });
let run;
for (;;) {
  await wait(3000);
  run = await call(`/api/hardening-runs/${started.runId}`, { token });
  process.stdout.write(`\rhardening: ${run.status} ${run.stage ?? ''}                    `);
  if (!['queued', 'running'].includes(run.status)) break;
}
console.log(`\nAI: ${run.aiStatus}  calls ${run.calls}  tokens ${run.tokens}`);
const m = run.metrics;
console.log(`score ${JSON.stringify(m?.score)}  attacks ${JSON.stringify(m?.attacks)}`);
const tally = {};
for (const row of run.mutations) tally[row.status] = (tally[row.status] ?? 0) + 1;
console.log('mutants:', JSON.stringify(tally));
for (const row of run.mutations.filter((x) => x.status === 'survived' || x.killedByProposalId)) console.log(`  ${row.status.padEnd(9)} ${row.description}`);
for (const p of run.proposals) console.log(`proposal ${p.type}: ${JSON.stringify(p.input ?? p.label ?? '')} -> ${JSON.stringify(p.expected ?? '')}  [${p.source}] ${p.reason}`);
for (const note of run.notes ?? []) console.log(`note: ${note}`);

const tests = run.proposals.filter((p) => p.type === 'test' && p.status === 'held');
if (tests.length) {
  const approved = await call(`/api/hardening-runs/${started.runId}/approve`, { token, method: 'POST', body: { proposalIds: tests.map((p) => p.id) } });
  console.log('approved:', JSON.stringify(approved));
  const target = approved.versionId ?? versionId;
  const second = await publishCheck(target);
  console.log(`publish check after approval: ${second.status}  ${JSON.stringify(second.report)}  visibility ${second.visibility}  listed ${second.listed}`);
}
