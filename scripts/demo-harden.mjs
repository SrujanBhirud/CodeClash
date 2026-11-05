// Starts one hardening run on "Larger of two" and writes the result.
// No API key is read or stored. The agent that is already running decides
// whether a model is used.
//
//   node scripts/demo-harden.mjs
//   node scripts/demo-harden.mjs Deliverables/demo/hardening-empty.json
//
// For the empty-provider result, start the agent with AGENT_PROVIDER unset
// and point this script at the second file.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const api = process.env.API_URL ?? 'http://127.0.0.1:4000';
const out = process.argv[2] ?? 'Deliverables/demo/hardening.json';
const email = process.env.DEMO_SETTER ?? 'meghna.raghavan@codeclash.dev';
const password = process.env.DEMO_PASSWORD ?? 'codeclash';

async function call(pathname, token, init = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${api}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} ${response.status} ${body.error ?? ''}`);
  return body;
}

const login = await call('/api/auth/login', undefined, {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const problems = await call('/api/problems', login.access);
const versionId = problems.find((item) => item.title === 'Larger of two')?.versionId;
if (!versionId) throw new Error('Larger of two is not in the problem list. Run npm run seed.');
const started = await call(`/api/problem-versions/${versionId}/hardening-runs`, login.access, { method: 'POST', body: '{}' });
const runId = started.runId;
const deadline = Date.now() + 6 * 60_000;
let run;
do {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  run = await call(`/api/hardening-runs/${runId}`, login.access);
} while ((run.status === 'queued' || run.status === 'running') && Date.now() < deadline);

const record = {
  at: new Date().toISOString(),
  api,
  problem: 'Larger of two',
  versionId,
  runId,
  status: run.status,
  stage: run.stage ?? null,
  aiStatus: run.aiStatus ?? null,
  calls: run.calls ?? null,
  tokens: run.tokens ?? null,
  score: run.metrics?.score ?? null,
  attacks: run.metrics?.attacks ?? null,
  notes: run.notes ?? [],
  mutations: (run.mutations ?? []).map((item) => ({
    operator: item.operator,
    source: item.source,
    status: item.status,
    description: item.description,
  })),
  proposals: (run.proposals ?? []).map((item) => ({
    type: item.type,
    source: item.source,
    attack: item.attack,
    status: item.status,
    reason: item.reason,
  })),
  error: run.error ?? null,
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${record.status} ${out}`);
console.log(`ai ${record.aiStatus} attacks ${JSON.stringify(record.attacks)}`);
console.log((record.notes ?? []).join(' | ') || (record.proposals ?? []).map((item) => item.reason).join(' | '));
if (record.status === 'queued' || record.status === 'running') process.exit(1);
