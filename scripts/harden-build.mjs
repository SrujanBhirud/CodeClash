// Builds three draft problems from a single sample, runs hardening, and
// appends one round of results. Tests already on the draft are replaced
// when RESET=1. No API key is read.
//
//   node scripts/harden-build.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const api = process.env.API_URL ?? 'http://127.0.0.1:4000';
const outFile = 'Deliverables/demo/hardening-build.json';
const reset = process.env.RESET !== '0';
const roundName = process.env.ROUND ?? '1-sample';
const added = {
  'Build: Larger of two': [
    { input: '3 1\n', output: '3\n', hidden: false },
    { input: '1 3\n', output: '3\n', hidden: true },
    { input: '-100 -50\n', output: '-50\n', hidden: true },
    { input: '7 7\n', output: '7\n', hidden: true },
  ],
  'Build: Balanced brackets': [
    { input: '(())\n', output: 'yes\n', hidden: false },
    { input: '(\n', output: 'no\n', hidden: true },
    { input: ')(\n', output: 'no\n', hidden: true },
    { input: '(()\n', output: 'no\n', hidden: true },
    ...(roundName === '3-order-in-the-middle' ? [{ input: '())(()\n', output: 'no\n', hidden: true }] : []),
  ],
  'Build: Maximum subarray': [
    { input: '5\n-2 1 -3 4 -1\n', output: '4\n', hidden: false },
    { input: '1\n-5\n', output: '-5\n', hidden: true },
    { input: '2\n1 100\n', output: '101\n', hidden: true },
  ],
};
const jobs = [
  { from: 'Larger of two', title: 'Build: Larger of two' },
  { from: 'Balanced brackets', title: 'Build: Balanced brackets' },
  { from: 'Maximum subarray', title: 'Build: Maximum subarray' },
].filter((job) => !process.env.ONLY || job.title === process.env.ONLY);

async function call(pathname, token, init = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${api}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} ${response.status} ${body.error ?? ''}`);
  return body;
}

function clip(text, n = 180) {
  const value = String(text ?? '');
  return value.length > n ? `${value.slice(0, n)} … (${value.length} chars)` : value;
}

const login = await call('/api/auth/login', undefined, {
  method: 'POST',
  body: JSON.stringify({ email: 'meghna.raghavan@codeclash.dev', password: 'codeclash' }),
});
const token = login.access;
let problems = await call('/api/problems', token);

const rounds = [];
for (const job of jobs) {
  const sourceRow = problems.find((item) => item.title === job.from);
  if (!sourceRow) throw new Error(`${job.from} is missing`);
  const source = await call(`/api/problem-versions/${sourceRow.versionId}`, token);
  let row = problems.find((item) => item.title === job.title);
  if (!row) {
    const created = await call('/api/problems', token, {
      method: 'POST',
      body: JSON.stringify({
        title: job.title,
        statement: source.statement,
        samples: source.samples,
        editorial: source.editorial,
        tags: source.tags,
        difficulty: source.difficulty,
      }),
    });
    row = { versionId: created.versionId, title: job.title };
    problems = await call('/api/problems', token);
    row = problems.find((item) => item.title === job.title) ?? row;
  }
  const current = await call(`/api/problem-versions/${row.versionId}`, token);
  if (current.inputSpec !== source.inputSpec) {
    await call(`/api/problem-versions/${row.versionId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ inputSpec: source.inputSpec }),
    });
  }
  const sample = source.tests[0];
  const tests = roundName === '2-after-the-gaps' || roundName === '3-order-in-the-middle'
    ? added[job.title]
    : reset
      ? [{ input: sample.input, output: sample.output, hidden: false }]
      : current.tests.map((test) => ({ input: test.input, output: test.output, hidden: test.hidden !== false }));
  await call(`/api/problem-versions/${row.versionId}/tests`, token, {
    method: 'PUT',
    body: JSON.stringify({
      tests,
      reference: source.reference,
      wrongSolutions: [],
      limits: source.limits,
    }),
  });

  const started = await call(`/api/problem-versions/${row.versionId}/hardening-runs`, token, { method: 'POST', body: '{}' });
  console.log(`started ${job.title} ${started.runId} (${tests.length} tests)`);
  const deadline = Date.now() + 8 * 60_000;
  let run;
  do {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    run = await call(`/api/hardening-runs/${started.runId}`, token);
    process.stdout.write(`  ${run.stage ?? run.status}\n`);
  } while ((run.status === 'queued' || run.status === 'running') && Date.now() < deadline);

  rounds.push({
    round: roundName,
    title: job.title,
    versionId: row.versionId,
    runId: started.runId,
    tests: tests.map((test) => ({ input: clip(test.input, 80), output: clip(test.output, 40) })),
    status: run.status,
    aiStatus: run.aiStatus,
    calls: run.calls,
    tokens: run.tokens,
    metrics: run.metrics,
    notes: run.notes,
    mutations: (run.mutations ?? []).map((item) => ({
      key: item.key,
      operator: item.operator,
      source: item.source,
      description: item.description,
      diff: item.diff,
      status: item.status,
      survivedRandom: item.survivedRandom,
    })),
    proposals: (run.proposals ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      attack: item.attack,
      input: clip(item.input, 240),
      inputLength: item.inputLength,
      expected: clip(item.expected, 80),
      reason: item.reason,
      code: item.type === 'wrong_solution' ? item.code : undefined,
    })),
  });
  mkdirSync('Deliverables/demo', { recursive: true });
  const previous = (() => {
    try { return JSON.parse(readFileSync(outFile, 'utf8')); } catch { return []; }
  })();
  const saved = rounds[rounds.length - 1];
  writeFileSync(outFile, `${JSON.stringify([...previous.filter((item) => !(item.round === saved.round && item.title === saved.title)), saved], null, 2)}\n`);
  console.log(`saved ${job.title} proposals ${run.proposals.length} score ${run.metrics?.score}`);
}

console.log('done');
