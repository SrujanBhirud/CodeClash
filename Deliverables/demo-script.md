# Ten-minute demo

Primary host: this PC, `http://127.0.0.1:5173`. The API is `http://127.0.0.1:4000`. Mailpit is `http://127.0.0.1:8025`.

The AWS account signed in on 5 November 2026 has no EC2 free-tier allowance (`aws freetier get-free-tier-usage` lists only Glue). A `t3.micro` would bill, so no instance was started. `deploy/README.md` is the host recipe for an account that still has the allowance. If that host is up, use `http://<public-ip>` and the same clicks. This PC is the backup either way.

Every password is `codeclash`.

| who | email | used for |
| --- | --- | --- |
| Aarav Sharma | aarav.sharma@students.codeclash.dev | submit, last seat, the 403 |
| Ishaan Verma | ishaan.verma@students.codeclash.dev | the second browser on Last seat |
| Meghna Raghavan | meghna.raghavan@codeclash.dev | the hardening run |
| Admin | admin@codeclash.local | only if a staff page is asked for |

Have two browser profiles open before the slot. Sign Aarav into the first and Ishaan into the second, both already on Contests, so the seat click is the only action in that minute.

## 0. Before the slot

`docker compose up -d`, then `npm run dev`, then `npm run seed` if the database is empty. Confirm `curl http://127.0.0.1:4000/health` prints `"ok":true`. Open the saved run at `Deliverables/demo/hardening.json`. The repeat command is:

```
node scripts/demo-harden.mjs
```

The empty-provider repeat is the same command after the agent is started with `AGENT_PROVIDER` unset, writing `Deliverables/demo/hardening-empty.json`. That one finishes in seconds. Do not start a fresh Gemini call during the ten minutes.

## 1. End to end, 1.5 minutes

Aarav, Warmup round, enter. Open the first problem, Sum of two integers. Language Python. Paste:

```
a, b = map(int, input().split())
print(a + b)
```

Submit. Wait until the verdict is AC. That is the transaction: seat already held, submit, judge, one verdict.

## 2. Agent, 2 minutes

Sign out. Sign in as Meghna. Authoring. Find Larger of two. Open Check. Open the saved run `Deliverables/demo/hardening.json` beside it if the page shows the latest run instead. That run is completed, `aiStatus` AVAILABLE, two calls, 1089 tokens. Attacks are boundary 4, random 25, max 1, shape 0, model 1. The note list is empty; the two held proposals are the text: a solution that takes absolute values, and one that compares the inputs as strings. Say what the agent may do (read the problem, run the sandbox, propose a test) and what it may not (publish, edit the tests, change a score). The deny is the test `agent/src/engine/ai.test.ts`, which records a `publish` tool call as denied. If someone asks to see it live, the empty-provider file is `hardening-empty.json`: `aiStatus` DISABLED and the note `No AGENT_PROVIDER is set.` Do not wait on the model.

## 3. Concurrency, 2.5 minutes

Both browsers, Contests, Last seat. Capacity is 1 and nobody is seated. Aarav registers, then Ishaan registers. One is seated. The other is waitlisted. Say the write is allowed only while `reserved < capacity`, and a unique index stops a second seat for the same person. Then show the line from the test report: 400 distinct users, 200 seats, exactly 200 seated. That run is `server/src/domain/domain.test.ts`.

## 4. Failure, 1.5 minutes

In a terminal:

```
curl http://127.0.0.1:4000/health
docker restart codeclash-srujan-redis-1
curl http://127.0.0.1:4000/health
```

The first health is ok. The second fails or reports redis false, then ok returns. Submit once more as Aarav if the restart finishes inside the minute, and show one verdict. If it does not, read the recorded lines:

```
PASS  redis: /health recovers
PASS  redis: the in-flight submission is judged once · judged AC
PASS  mongo: /health recovers
PASS  mongo: seat counts match active seats
PASS  judge: the claimed submission gets one verdict after restart · judged AC
```

## 5. Security, 1 minute

Still Aarav. Click Admin. The app leaves the page. That is the same rule as the 403 on an admin route, audited, in `server/src/http/auth.test.ts`. One line from the escape suite: a fork bomb inside the sandbox ends as RE or TLE, not as a host failure.

## 6. Traceability, 1.5 minutes

One row, said out loud.

- Requirement: compiled languages must be judged, not rejected because the compiler cannot write.
- Jira: CC-53, Done.
- GitHub: pull request 47, merged 5 November 2026. `check` and `e2e` were green.
- Test: `judge/src/languages.test.ts` accepts a sum program in C, C++, Java, and Go.

## If the network or the VM is the thing that fails

Stay on this PC. The accounts, the Last seat contest, Mailpit, and the saved hardening file are already here. Do not reseed during the slot.
