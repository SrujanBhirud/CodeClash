// Runs the test-hardening worker on named problems and writes the full result.
// Mutant source is read from Mongo because the HTTP view omits it.
// No API key is read or stored.
//
//   node scripts/harden-report.mjs
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';

const api = process.env.API_URL ?? 'http://127.0.0.1:4000';
const mongoUrl = process.env.MONGO_URL ?? 'mongodb://app:codeclash@127.0.0.1:27017/codeclash?replicaSet=rs0&authSource=codeclash';
const titles = (process.env.HARDEN_TITLES ?? 'Climbing stairs,Balanced brackets,Maximum subarray').split(',').map((s) => s.trim());
const outDir = 'Deliverables/demo';
const outFile = process.env.HARDEN_OUT ?? `${outDir}/hardening-medium.json`;

async function call(pathname, token, init = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${api}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} ${response.status} ${body.error ?? ''}`);
  return body;
}

const login = await call('/api/auth/login', undefined, {
  method: 'POST',
  body: JSON.stringify({ email: 'meghna.raghavan@codeclash.dev', password: 'codeclash' }),
});
const problems = await call('/api/problems', login.access);
const client = new MongoClient(mongoUrl);
await client.connect();
const db = client.db();
const reports = [];

for (const title of titles) {
  const row = problems.find((item) => item.title === title);
  if (!row) throw new Error(`${title} is not in the problem list`);
  const version = await call(`/api/problem-versions/${row.versionId}`, login.access);
  const started = await call(`/api/problem-versions/${row.versionId}/hardening-runs`, login.access, { method: 'POST', body: '{}' });
  const runId = started.runId;
  console.log(`started ${title} ${runId}`);
  const deadline = Date.now() + 8 * 60_000;
  let run;
  do {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    run = await call(`/api/hardening-runs/${runId}`, login.access);
    process.stdout.write(`  ${run.status} ${run.stage ?? ''}\n`);
  } while ((run.status === 'queued' || run.status === 'running') && Date.now() < deadline);

  const mutations = await db.collection('mutations').find({ runId: new ObjectId(runId) }).sort({ _id: 1 }).toArray();
  const byKey = new Map(mutations.map((item) => [item.key, item.code]));
  const record = {
    title,
    difficulty: version.difficulty,
    versionId: row.versionId,
    runId,
    status: run.status,
    aiStatus: run.aiStatus,
    calls: run.calls,
    tokens: run.tokens,
    metrics: run.metrics,
    notes: run.notes,
    reference: version.reference,
    wrongSolutions: (version.wrongSolutions ?? []).map((item) => ({ label: item.label, language: item.language, code: item.code })),
    tests: (version.tests ?? []).map((item, index) => ({
      index,
      sample: Boolean(item.sample ?? item.shown),
      input: String(item.input ?? '').length > 500 ? `${String(item.input).slice(0, 200)} … (${String(item.input).length} chars)` : item.input,
      output: String(item.output ?? '').length > 200 ? `${String(item.output).slice(0, 120)} …` : item.output,
    })),
    mutations: run.mutations.map((item) => ({
      ...item,
      code: byKey.get(item.key) ?? null,
    })),
    proposals: run.proposals,
  };
  reports.push(record);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(reports, null, 2)}\n`);
  console.log(`saved ${title} ${run.status} proposals ${run.proposals.length}`);
}

await client.close();
console.log(`wrote ${reports.length} runs`);
