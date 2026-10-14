import { defaultLimits } from '@codeclash/shared';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from '@node-rs/argon2';
import { MongoClient } from 'mongodb';
import { ensureIndexes } from './db/indexes.js';

// Practice set for the milestone demo: the authored catalog, plus the downloaded Codeforces archive.
const url = process.env.MONGO_URL ?? 'mongodb://app:codeclash@127.0.0.1:27017/codeclash?replicaSet=rs0&authSource=codeclash';
const client = new MongoClient(url);
await client.connect();
const db = client.db();
await ensureIndexes(db);

const passwordHash = await hash('codeclash');
await db.collection('users').updateOne(
  { email: 'admin@codeclash.local' },
  {
    $set: { emailVerified: true, rating: 1200 },
    $setOnInsert: { email: 'admin@codeclash.local', passwordHash, displayName: 'Admin', role: 'admin', createdAt: new Date() },
  },
  { upsert: true },
);

interface TestCase { input: string; output: string; hidden: boolean }
interface PracticeProblem {
  title: string;
  statement: string;
  samples: string;
  editorial: string;
  tags: string[];
  difficulty: string;
  rating?: number;
  tests: TestCase[];
  reference: string;
  wrong: string;
  source?: { platform: string; contestId: number; index: string; url: string; dataset: string; license: string };
}

interface Imported {
  title: string;
  statement: string;
  samples: string;
  tags: string[];
  difficulty: string;
  rating: number;
  limits?: { timeMs?: number; memoryMb?: number };
  tests: TestCase[];
  reference: { language: string; code: string };
  wrongSolutions?: { language: string; code: string }[];
  source: PracticeProblem['source'];
}

/** Approaches checked against the dataset reference. Longer solutions keep the source note only. */
const IMPORTED_IDEAS: Record<string, string> = {
  "Chat Server's Outgoing Traffic": 'Keep a count of people currently in the chat. A line starting with + adds one, a line starting with - removes one, and any other line is a message: add (characters after the colon) times the current number of people.',
  'Wizards and Demonstration': 'The city reacts when at least y percent of n people attend. x wizards already will. Add the smallest number of clones k such that (x + k) / n is at least y percent.',
  "Let's Watch Football": 'The video is a seconds long and needs a bytes per second, while the link provides b. Wait the smallest whole number of seconds so that playback never catches the download. That wait is ceil(c * (a - b) / b) when a > b, and 0 otherwise.',
  Games: 'Each team has a home colour and a guest colour. Count ordered pairs of distinct games where the host home colour equals the guest team guest colour. Those are the games that need a colour change.',
  'Cows and Poker Game': 'A cow can show cards only when every other cow is ALLIN or FOLDED. If the row contains one I, the answer is 1. If it contains no I, the answer is the number of A. If it contains more than one I, the answer is 0.',
  'Helpful Maths': 'The sum uses only 1, 2 and 3. Split on +, sort the numbers, and join them again with +.',
  'New Year Candles': 'Start with a candles. Each hour burns one. Every b burned stubs make one new candle. Repeat until fewer than b stubs remain, and print the total hours.',
  'Dislike of Threes': 'Polycarp skips every positive integer divisible by 3 or ending in 3. The answer is the k-th positive integer that remains.',
  'Multiply by 2, divide by 6': 'Write n as 2^a * 3^b times anything else. If another prime appears, or if a > b, print -1. Otherwise print b + (b - a): each extra factor 3 needs one multiply-by-2 before a divide-by-6 can clear it.',
};

function importedEditorial(item: Imported) {
  const source = item.source;
  const cite = [
    `Source: ${source?.platform ?? 'Codeforces'} ${source?.contestId ?? ''}${source?.index ?? ''}.`.replace(' .', '.'),
    source?.url ?? '',
    `${source?.dataset ?? 'DeepMind CodeContests'}, ${source?.license ?? 'CC BY 4.0'}.`,
    `Codeforces rating ${item.rating}. Tags: ${item.tags.join(', ') || 'none'}.`,
  ].filter(Boolean).join(' ');
  const idea = IMPORTED_IDEAS[item.title];
  if (idea) return `${idea}\n\n${cite}`;
  return [
    cite,
    'The sample is the public case. Every other stored test is hidden. A reference solution from the dataset was accepted on all of them, so printing the sample alone does not pass.',
    'Match the output format in the statement, including line breaks.',
  ].join('\n\n');
}

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')) as PracticeProblem[];
const imported = (JSON.parse(gunzipSync(readFileSync(new URL('../data/codecontests.json.gz', import.meta.url))).toString()) as { problems: Imported[] }).problems;

const problems: PracticeProblem[] = [
  ...catalog,
  ...imported.map((item) => ({
    title: item.title,
    statement: item.statement,
    samples: item.samples,
    editorial: importedEditorial(item),
    tags: item.tags,
    difficulty: item.difficulty,
    rating: item.rating,
    tests: item.tests,
    reference: item.reference.code,
    wrong: item.wrongSolutions?.[0]?.code ?? 'print(0)\n',
    source: item.source,
  })),
];

const seen = new Set<string>();
for (const item of problems) {
  if (seen.has(item.title)) continue;
  seen.add(item.title);
  const limits = defaultLimits();
  const problem = (await db.collection('problems').findOneAndUpdate(
    { title: item.title },
    { $set: { statement: item.statement, samples: item.samples, tags: item.tags }, $setOnInsert: { title: item.title, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  ))!;
  await db.collection('problem_versions').updateOne(
    { problemId: problem._id, version: 1 },
    {
      $set: {
        title: item.title,
        statement: item.statement,
        samples: item.samples,
        editorial: item.editorial,
        tags: item.tags,
        difficulty: item.difficulty,
        ...(item.rating ? { rating: item.rating } : {}),
        ...(item.source ? { source: item.source } : {}),
        limits,
        tests: item.tests,
        reference: { language: 'python', code: item.reference },
        wrongSolutions: [{ label: 'wrong', language: 'python', code: item.wrong }],
        status: 'published',
        report: [],
      },
    },
    { upsert: true },
  );
}

const titles = [...seen];
await db.collection('problem_versions').deleteMany({ title: { $nin: titles } });
await db.collection('problems').deleteMany({ title: { $nin: titles } });

console.log(`seeded admin@codeclash.local (password "codeclash") and ${seen.size} practice problems`);
await client.close();
