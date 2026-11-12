// Twelve DEMO bots request one seat at the same moment, on a contest this script owns.
// DEMO One seat is never registered for, so the click-through demo stays empty.
//   node demo/concurrency.mjs [--url http://129.225.92.29] [--bots 12] [--hold]
//   --hold leaves the winner seated. By default the winner then withdraws and the
//   first person on the waitlist is promoted, which is the same hand-off as the talk.
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
};
const BASE = flag('--url', process.env.CODECLASH_URL ?? 'http://129.225.92.29').replace(/\/$/, '');
const BOTS = Math.min(12, Math.max(2, Number(flag('--bots', '12')) || 12));
const HOLD = args.includes('--hold');
const TITLE = 'DEMO Concurrency race';
const TALK = 'DEMO One seat';
const PASSWORD = 'codeclash';
const EXTRAS = 5;

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (text) => paint('1', text);
const dim = (text) => paint('2', text);
const green = (text) => paint('32', text);
const red = (text) => paint('31', text);
const yellow = (text) => paint('33', text);
const cyan = (text) => paint('36', text);

function say(text = '') {
  console.log(text);
}

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: response.status, body: json };
}

function fail(message) {
  say(red(message));
  process.exit(1);
}

function explain(result) {
  return result.body?.error || result.body?.raw || `HTTP ${result.status}`;
}

async function signIn(email) {
  const login = await call('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (login.status !== 200) fail(`${email} could not sign in (${login.status}): ${explain(login)}`);
  return { email, name: login.body.user.displayName, id: login.body.user.id, token: login.body.access };
}

function box(lines, color) {
  const width = Math.max(...lines.map((line) => line.length), 24);
  const edge = (left, mid, right) => color(left + mid.repeat(width + 2) + right);
  say(edge('┌', '─', '┐'));
  for (const line of lines) say(color(`│ ${line.padEnd(width)} │`));
  say(edge('└', '─', '┘'));
}

say(bold('CodeClash  ·  concurrency'));
say(`Twelve accounts request the one seat of "${TITLE}" at the same moment.`);
say(dim(`"${TALK}" is the click-through contest. This script does not register anyone for it.`));
say();

let talkBefore = null;
const listed = await call('/api/contests');
if (!Array.isArray(listed.body)) fail(`Could not read contests from ${BASE}: ${explain(listed)}`);
const talk = listed.body.find((contest) => contest.title === TALK);
if (talk) talkBefore = { id: talk.id, reserved: talk.reserved, capacity: talk.capacity };

say(dim('Signing in'));
const organiser = await signIn('demo-organiser@codeclash.dev');
const bots = await Promise.all(
  Array.from({ length: BOTS }, (_, i) => signIn(`demo-bot-${String(i + 1).padStart(2, '0')}@codeclash.dev`)),
);
const byId = new Map(bots.map((bot) => [bot.id, bot]));

say(dim('Preparing a fresh contest'));
for (const contest of listed.body.filter((contest) => contest.title === TITLE && contest.status !== 'cancelled' && contest.status !== 'published')) {
  const cancelled = await call(`/api/contests/${contest.id}/transition`, {
    token: organiser.token, method: 'POST', body: { to: 'cancelled' },
  });
  if (cancelled.status !== 200) fail(`Could not retire the previous "${TITLE}" (${cancelled.status}): ${explain(cancelled)}`);
  say(dim(`  retired the previous run (${contest.reserved}/${contest.capacity} seats were taken)`));
}

const startAt = Date.now() + 365 * 24 * 60 * 60_000;
const created = await call('/api/contests', {
  token: organiser.token,
  method: 'POST',
  body: {
    title: TITLE,
    type: 'quiz',
    capacity: 1,
    scoringMode: 'quiz',
    problemIds: [],
    registrationOpensAt: new Date(Date.now() - 60_000).toISOString(),
    startsAt: new Date(startAt).toISOString(),
    freezeAt: new Date(startAt + 60 * 60_000).toISOString(),
    endsAt: new Date(startAt + 90 * 60_000).toISOString(),
  },
});
if (created.status !== 201) fail(`Could not create "${TITLE}" (${created.status}): ${explain(created)}`);
const contestId = created.body.id;
const opened = await call(`/api/contests/${contestId}/transition`, {
  token: organiser.token, method: 'POST', body: { to: 'registration_open' },
});
if (opened.status !== 200 || opened.body?.to !== 'registration_open') {
  fail(`Could not open registration (${opened.status}): ${explain(opened)}`);
}
const before = await call(`/api/contests/${contestId}`);
if (before.body?.reserved !== 0 || before.body?.capacity !== 1) {
  fail(`The new contest is not an empty one-seat contest: ${JSON.stringify(before.body)}`);
}

say(`Host     ${BASE}`);
say(`Contest  ${TITLE}`);
say(`Before   ${before.body.reserved} / ${before.body.capacity}`);
say();

const requests = [
  ...bots.map((bot) => ({ bot, extra: false })),
  ...Array.from({ length: EXTRAS }, () => ({ bot: bots[0], extra: true })),
];
say(bold(`Releasing ${requests.length} requests together`) + dim(`  ·  ${BOTS} bots, plus ${EXTRAS} extra clicks from ${bots[0].name}`));

let openGate;
const gate = new Promise((resolve) => { openGate = resolve; });
const pending = requests.map(async ({ bot, extra }) => {
  await gate;
  const start = performance.now();
  try {
    const out = await call(`/api/contests/${contestId}/seats`, { token: bot.token, method: 'POST' });
    return {
      bot, extra, start, end: performance.now(),
      status: out.status,
      outcome: out.body?.outcome ?? 'error',
      error: out.body?.error,
      seatId: out.body?.seatId ?? null,
      position: out.body?.position ?? null,
    };
  } catch (error) {
    return { bot, extra, start, end: performance.now(), status: 0, outcome: 'error', error: error.message, seatId: null, position: null };
  }
});
openGate();
const results = await Promise.all(pending);

const origin = Math.min(...results.map((row) => row.start));
const span = Math.max(1, Math.max(...results.map((row) => row.end)) - origin);
const spread = Math.max(...results.map((row) => row.start)) - origin;
const wall = Math.max(...results.map((row) => row.end)) - origin;
const added = results.reduce((sum, row) => sum + (row.end - row.start), 0);

const events = results.flatMap((row) => [{ t: row.start, d: 1 }, { t: row.end, d: -1 }]);
events.sort((a, b) => a.t - b.t || b.d - a.d);
let inFlight = 0;
let peak = 0;
for (const event of events) {
  inFlight += event.d;
  peak = Math.max(peak, inFlight);
}

const tone = {
  reserved: green,
  waitlisted: yellow,
  existing: cyan,
  error: red,
};
const tagOf = (row) => {
  if (row.outcome === 'reserved') return 'SEAT';
  if (row.outcome === 'waitlisted') return `WAIT ${row.position}`;
  if (row.outcome === 'existing') return 'AGAIN';
  return 'FAIL';
};
const detailOf = (row) => {
  if (row.outcome === 'reserved') return 'took the seat';
  if (row.outcome === 'waitlisted') return 'on the waitlist';
  if (row.outcome === 'existing') return row.extra ? 'extra click, same seat' : 'already in';
  return row.error || 'request failed';
};
const order = { reserved: 0, waitlisted: 1, existing: 2, error: 3 };
const shown = [...results].sort((a, b) => order[a.outcome] - order[b.outcome] || (a.position ?? 0) - (b.position ?? 0) || a.bot.name.localeCompare(b.bot.name) || Number(a.extra) - Number(b.extra));

say();
const barWidth = 28;
for (const row of shown) {
  const color = tone[row.outcome] ?? red;
  const from = Math.round(((row.start - origin) / span) * barWidth);
  const to = Math.max(from + 1, Math.round(((row.end - origin) / span) * barWidth));
  const bar = ' '.repeat(from) + '█'.repeat(Math.min(barWidth, to) - from);
  const ms = String(Math.round(row.end - row.start)).padStart(5);
  say(`  ${color(tagOf(row).padEnd(8))} ${row.bot.name.padEnd(14)} ${detailOf(row).padEnd(24)} ${dim(`${ms} ms`)}  ${color(bar)}`);
}

say();
say(dim('Bars share one clock. A bar that begins at the left was already in flight with the others.'));
say(`Released within ${spread < 1 ? spread.toFixed(2) : Math.round(spread)} ms of each other.`);
say(`Peak in flight   ${bold(String(peak))} of ${requests.length}`);
say(`Wall clock       ${bold(`${Math.round(wall)} ms`)} for every answer`);
say(`Added up         ${Math.round(added)} ms if they had queued one after another`);
say(`Overlap          ${bold(`${(added / wall).toFixed(1)}×`)}`);

const after = await call(`/api/contests/${contestId}`);
const seats = await Promise.all(bots.map(async (bot) => ({ bot, seat: (await call(`/api/contests/${contestId}/seat`, { token: bot.token })).body })));
const holders = seats.filter((row) => row.seat && row.seat.status === 'reserved');
const waiting = seats.filter((row) => row.seat?.status === 'waitlisted');
const positions = waiting.map((row) => row.seat.position);
const firstClicks = results.filter((row) => row.bot === bots[0]);
const firstSeatIds = new Set(firstClicks.map((row) => row.seatId).filter(Boolean));
const httpOk = results.every((row) => row.status === 200 || row.status === 201);

const checks = [
  ['exactly 1 seat taken', after.body?.reserved === 1 && holders.length === 1],
  [`${waiting.length} distinct waitlist positions`, positions.length === BOTS - 1 && new Set(positions).size === positions.length],
  [`${bots[0].name} sent ${EXTRAS + 1} clicks and kept 1 place`, firstSeatIds.size === 1 && firstClicks.every((row) => row.outcome !== 'error')],
  [`all ${requests.length} answers came back`, httpOk],
  [`${peak} requests were in flight at once`, peak === requests.length],
];

say();
say(bold('Race'));
for (const [label, ok] of checks) say(`  ${ok ? green('PASS') : red('FAIL')}  ${label}`);
const winner = holders[0];
if (winner) {
  const firstInLine = [...waiting].sort((a, b) => a.seat.position - b.seat.position)[0];
  say();
  say(`${green(winner.bot.name)} took the only seat. ${waiting.length} others are queued${firstInLine ? `, with ${firstInLine.bot.name} first` : ''}.`);
}

let handoffOk = true;
if (!HOLD && winner) {
  say();
  say(bold('The seat changes hands'));
  const withdrawn = await call(`/api/seats/${winner.seat.seatId}`, { token: winner.bot.token, method: 'DELETE' });
  const promoted = byId.get(withdrawn.body?.promotedUserId);
  if (withdrawn.status !== 200 || !promoted) {
    handoffOk = false;
    say(`  ${red('FAIL')}  withdraw did not promote the next person (${withdrawn.status}): ${explain(withdrawn)}`);
  } else {
    const again = await call(`/api/contests/${contestId}`);
    const now = await Promise.all(bots.map(async (bot) => ({ bot, seat: (await call(`/api/contests/${contestId}/seat`, { token: bot.token })).body })));
    const nowHolding = now.filter((row) => row.seat?.status === 'reserved');
    const nowWaiting = now.filter((row) => row.seat?.status === 'waitlisted');
    const expected = [...waiting].sort((a, b) => a.seat.position - b.seat.position)[0];
    const stillOne = again.body?.reserved === 1 && nowHolding.length === 1 && nowHolding[0].bot.id === promoted.id;
    const wasHead = expected?.bot.id === promoted.id;
    const winnerGone = now.find((row) => row.bot.id === winner.bot.id)?.seat == null;
    const stillUnique = new Set(nowWaiting.map((row) => row.seat.position)).size === nowWaiting.length;
    handoffOk = stillOne && wasHead && winnerGone && stillUnique && nowWaiting.length === waiting.length - 1;
    say(`  ${winner.bot.name} withdrew.`);
    say(`  ${green(promoted.name)} was #${expected?.seat.position} and now holds the seat.`);
    say(`  Seats are still ${again.body?.reserved} / ${again.body?.capacity}. ${nowWaiting.length} remain on the waitlist, in their original positions.`);
    say(`  ${handoffOk ? green('PASS') : red('FAIL')}  one seat, given to the head of the waitlist`);
  }
} else if (HOLD) {
  say();
  say(dim('--hold: the winner stays seated. Run again without --hold to show the hand-off.'));
}

const talkAfter = talkBefore ? (await call(`/api/contests/${talkBefore.id}`)).body : null;
const talkUntouched = !talkBefore || (talkAfter?.reserved === talkBefore.reserved && talkAfter?.capacity === talkBefore.capacity);
say();
say(bold(TALK));
if (!talkBefore) {
  say(dim(`  ${TALK} is not on this server.`));
} else {
  say(`  ${talkUntouched ? green('PASS') : red('FAIL')}  still ${talkAfter.reserved} / ${talkAfter.capacity}, same as before this script`);
}

const passed = checks.every(([, ok]) => ok) && handoffOk && talkUntouched;
say();
if (passed) {
  box([
    'CONCURRENCY HELD',
    `${peak} requests in flight, ${holders.length} seat taken.`,
    HOLD ? 'The winner is still seated.' : 'The waitlist head took the seat on withdraw.',
    talkBefore ? `${TALK} was not touched.` : '',
  ].filter(Boolean), green);
} else {
  box(['CONCURRENCY BROKE', 'A red FAIL above says which check missed.'], red);
}
process.exit(passed ? 0 : 1);
