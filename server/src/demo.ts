/**
 * Demo-day accounts and fixtures. Safe to run again: it resets what it owns and leaves the seeded data alone.
 *   npm run demo -w server                     reset everything below
 *   npm run demo -w server -- --forget <email>   delete one account so it can sign up again
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { ensureIndexes } from './db/indexes.js';
import { recomputeStanding } from './domain/scoring.js';
import { hashIp } from './domain/similarity.js';
import { DEMO_PASSWORD } from './seed-data.js';

const DOMAIN = 'codeclash.dev';
const DAY = 24 * 60 * 60_000;
const DEMO_ACCOUNTS = [
  { local: 'demo-admin', name: 'DEMO Admin', role: 'admin' },
  { local: 'demo-setter', name: 'DEMO Setter', role: 'setter' },
  { local: 'demo-organiser', name: 'DEMO Organiser', role: 'organiser' },
  { local: 'demo-student', name: 'DEMO Student', role: 'participant' },
  { local: 'demo-rival', name: 'DEMO Rival', role: 'participant' },
  ...Array.from({ length: 12 }, (_, i) => ({ local: `demo-bot-${String(i + 1).padStart(2, '0')}`, name: `DEMO Bot ${String(i + 1).padStart(2, '0')}`, role: 'participant' })),
] as const;
const ONE_SEAT = 'DEMO One seat';
const INTEGRITY = 'DEMO Integrity cup';

async function forgetAccount(database: Db, email: string) {
  const user = await database.collection('users').findOne({ email });
  if (!user) return `${email}: no such account`;
  if (user.role === 'admin' && !String(user.email).startsWith('demo-')) return `${email}: refusing to delete an admin`;
  const contests = await database.collection('contests').find({ createdBy: user._id }).project({ _id: 1 }).toArray();
  await removeContests(database, contests.map((c) => c._id));
  await Promise.all([
    database.collection('seats').deleteMany({ userId: user._id }),
    database.collection('submissions').deleteMany({ userId: user._id }),
    database.collection('standings').deleteMany({ userId: user._id }),
    database.collection('refresh_tokens').deleteMany({ userId: user._id }),
  ]);
  await database.collection('users').deleteOne({ _id: user._id });
  return `${email}: deleted, with ${contests.length} contest(s) it created`;
}

async function removeContests(database: Db, ids: ObjectId[]) {
  if (ids.length === 0) return;
  for (const name of ['seats', 'standings', 'first_solves', 'quiz_questions', 'quiz_answers', 'submissions', 'similarity_reports']) {
    await database.collection(name).deleteMany({ contestId: { $in: ids } });
  }
  await database.collection('contests').deleteMany({ _id: { $in: ids } });
}

async function reset(database: Db) {
  const passwordHash = await hash(DEMO_PASSWORD);
  const users = new Map<string, ObjectId>();
  for (const account of DEMO_ACCOUNTS) {
    const email = `${account.local}@${DOMAIN}`;
    const row = await database.collection('users').findOneAndUpdate(
      { email },
      {
        $set: { displayName: account.name, role: account.role, emailVerified: true, passwordHash, demo: true },
        $setOnInsert: { email, rating: 1200, createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );
    users.set(account.local, row!._id);
  }
  const demoIds = [...users.values()];

  // Contests a DEMO account made during a rehearsal, and the two fixtures below, start again from nothing.
  const old = await database.collection('contests')
    .find({ $or: [{ createdBy: { $in: demoIds } }, { title: { $regex: '^DEMO ' } }] })
    .project({ _id: 1 }).toArray();
  await removeContests(database, old.map((c) => c._id));
  await database.collection('submissions').deleteMany({ userId: { $in: demoIds }, kind: 'practice' });

  // Problems DEMO Setter wrote in a rehearsal.
  const drafts = await database.collection('problems').find({ createdBy: users.get('demo-setter') }).project({ _id: 1 }).toArray();
  const draftIds = drafts.map((p) => p._id);
  if (draftIds.length) {
    const versions = await database.collection('problem_versions').find({ problemId: { $in: draftIds } }).project({ _id: 1 }).toArray();
    const versionIds = versions.map((v) => v._id);
    const runs = await database.collection('hardening_runs').find({ problemVersionId: { $in: versionIds } }).project({ _id: 1 }).toArray();
    const runIds = runs.map((r) => r._id);
    await database.collection('mutations').deleteMany({ runId: { $in: runIds } });
    await database.collection('proposals').deleteMany({ $or: [{ runId: { $in: runIds } }, { problemVersionId: { $in: versionIds } }] });
    await database.collection('hardening_runs').deleteMany({ _id: { $in: runIds } });
    await database.collection('submissions').deleteMany({ problemId: { $in: draftIds } });
    await database.collection('problem_versions').deleteMany({ problemId: { $in: draftIds } });
    await database.collection('problems').deleteMany({ _id: { $in: draftIds } });
  }

  const now = Date.now();
  const organiser = users.get('demo-organiser')!;
  const base = {
    reserved: 0, waitlistSeq: 0, ratingsApplied: true, createdBy: organiser, demo: true,
  };

  // Registration stays open for a year, so the race can be run any time. A quiz holds no problem out of the problemset.
  const startsAt = new Date(now + 365 * DAY);
  const seat = await database.collection('contests').insertOne({
    ...base,
    title: ONE_SEAT,
    type: 'quiz',
    scoringMode: 'quiz',
    status: 'registration_open',
    capacity: 1,
    problemIds: [],
    registrationOpensAt: new Date(now - DAY),
    startsAt,
    freezeAt: new Date(startsAt.getTime() + 60 * 60_000),
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
  });

  const cola = await database.collection('problem_versions')
    .find({ status: 'published', title: { $regex: '^Cola$', $options: 'i' } }).sort({ version: -1 }).limit(1).next();
  let integrity: ObjectId | null = null;
  if (cola) {
    const started = new Date(now - 6 * 60 * 60_000);
    integrity = (await database.collection('contests').insertOne({
      ...base,
      title: INTEGRITY,
      type: 'coding',
      scoringMode: 'icpc',
      status: 'published',
      capacity: 50,
      problemIds: [cola.problemId],
      registrationOpensAt: new Date(started.getTime() - DAY),
      startsAt: started,
      freezeAt: new Date(started.getTime() + 90 * 60_000),
      endsAt: new Date(started.getTime() + 120 * 60_000),
    })).insertedId;
    const entries: { who: string; code: string; minute: number; network: string }[] = [
      { who: 'demo-student', code: ORIGINAL, minute: 31, network: '10.20.0.14' },
      { who: 'demo-rival', code: DISGUISED, minute: 58, network: '10.20.0.14' },
      ...HONEST.map((code, i) => ({ who: `demo-bot-${String(i + 1).padStart(2, '0')}`, code, minute: 20 + 9 * i, network: `10.20.${i + 1}.${30 + i}` })),
    ];
    await database.collection('seats').insertMany(entries.map((entry) => ({
      contestId: integrity, userId: users.get(entry.who)!, status: 'competing', active: true, waitlistPos: null, createdAt: started,
    })));
    await database.collection('contests').updateOne({ _id: integrity }, { $set: { reserved: entries.length } });
    await database.collection('submissions').insertMany(entries.map((entry) => {
      const at = new Date(started.getTime() + entry.minute * 60_000);
      return {
        userId: users.get(entry.who)!, contestId: integrity, problemVersionId: cola._id, problemId: cola.problemId,
        language: 'python', code: entry.code, kind: 'contest', status: 'scored', verdict: 'AC', reason: null,
        idempotencyKey: null, claimToken: null, submittedAt: at, judgedAt: at, ipHash: hashIp(entry.network), demo: true,
      };
    }));
    for (const entry of entries) await recomputeStanding(database, String(integrity), String(users.get(entry.who)!));
  }

  console.log(`DEMO accounts (password "${DEMO_PASSWORD}"):`);
  for (const account of DEMO_ACCOUNTS.slice(0, 5)) console.log(`  ${account.name.padEnd(15)} ${account.local}@${DOMAIN}  (${account.role})`);
  console.log(`  DEMO Bot 01..12  demo-bot-01..12@${DOMAIN}  (participants for the seat race)`);
  console.log(`${ONE_SEAT}: ${seat.insertedId}  capacity 1, registration open until ${startsAt.toISOString().slice(0, 10)}`);
  console.log(cola ? `${INTEGRITY}: ${integrity}  6 accepted Cola submissions, one disguised copy` : 'Cola is not in the database: run the seed first. The integrity fixture was skipped.');
  if (draftIds.length) console.log(`Removed ${draftIds.length} problem(s) DEMO Setter wrote earlier.`);
}

const ORIGINAL = `import sys


def count_ways(n, a, b, c):
    ways = 0
    for two in range(min(c, n // 2) + 1):
        rest = n - 2 * two
        low = max(0, rest - a // 2)
        high = min(b, rest)
        if high >= low:
            ways += high - low + 1
    return ways


def main():
    n, a, b, c = map(int, sys.stdin.read().split())
    print(count_ways(n, a, b, c))


main()
`;

/** The same program with new names, comments, spacing and one comparison turned around. */
const DISGUISED = `# my own solution, written from scratch
import sys

def solve(total, halves, ones, twos):
    # number of ways to buy exactly total litres
    answer = 0
    # try every count of 2 litre bottles
    for k in range(min(twos, total // 2) + 1):
        left = total - 2 * k            # litres still to buy
        lo = max(0, left - halves // 2)  # at least this many 1 litre bottles
        hi = min(ones, left)
        if lo <= hi:
            answer += hi - lo + 1
    return answer

def run():
    total, halves, ones, twos = map(int, sys.stdin.read().split())
    print(solve(total, halves, ones, twos))

run()
`;

/** Four independent accepted solutions, so the score has a crowd to stand out from. */
const HONEST = [
  `n, a, b, c = map(int, input().split())
total = 0
for z in range(c + 1):
    for y in range(b + 1):
        need = 2 * (n - 2 * z - y)
        if 0 <= need <= a:
            total += 1
print(total)
`,
  `import math
n, a, b, c = (int(x) for x in input().split())
count = 0
ones = 0
while ones <= min(b, n):
    r = n - ones
    options = min(c, r // 2) - max(0, math.ceil((r - a // 2) / 2)) + 1
    count += options if options > 0 else 0
    ones += 1
print(count)
`,
  `n, a, b, c = map(int, input().split())
answer = 0
for twos in range(c + 1):
    if 2 * twos > n:
        break
    for halves in range(0, a + 1, 2):
        ones = n - 2 * twos - halves // 2
        if ones < 0:
            break
        if ones <= b:
            answer += 1
print(answer)
`,
  `import sys
n, a, b, c = map(int, sys.stdin.readline().split())
print(sum(1 for z in range(min(c, n // 2) + 1) for y in range(min(b, n - 2 * z) + 1) if 2 * (n - 2 * z - y) <= a))
`,
];

const url = process.env.MONGO_URL ?? 'mongodb://app:codeclash@127.0.0.1:27017/codeclash?replicaSet=rs0&authSource=codeclash';
const client = new MongoClient(url);
await client.connect();
const db = client.db();
await ensureIndexes(db);

const forget = process.argv.indexOf('--forget');
if (forget >= 0) {
  const email = String(process.argv[forget + 1] ?? '').trim().toLowerCase();
  if (!email) throw new Error('usage: --forget <email>');
  console.log(await forgetAccount(db, email));
} else {
  await reset(db);
}
await client.close();
