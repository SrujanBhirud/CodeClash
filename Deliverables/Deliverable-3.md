# CodeClash — Deliverable 3

Team repository: https://github.com/SrujanBhirud/CodeClash
Branch for this pack: `feature/CC-58-demo-pack`
The submitted document is `Deliverable-3.tex` (and the PDF next to it). This file is the working note.
Measured on 5 November 2026, with Docker Desktop 29.8.1, Node 22, and the local compose stack `codeclash-srujan`.

Published `main` is not rewritten. Pull requests #40–#46 stay as they were merged. CC-53 is pull request 47. CC-58 is this branch. CC-52 is not merged.

## Test report

`npm run lint` and `npm run typecheck` passed. `npm test` and `npm run test:coverage` passed. Counts from the coverage run:

| workspace | tests | result |
| --- | --- | --- |
| packages/shared | 33 | pass |
| agent | 37 | pass |
| server | 81 | pass |
| judge | 22 | pass |

The judge run includes the language suite (Python, JavaScript, C, C++17, Java 21, Go all AC), the batch suite (AC, AC, WA rather than three compile errors), and the escape suite (fork bomb contained, host file not read, time limit, memory limit as MLE, stdout flood cut off).

Server integration covers authoring through the publish check, contest registration, waitlist promotion, freeze, rejudge, quiz, email verification before a seat, ratings, and the test-hardening enqueue. Playwright is `e2e/core.spec.ts` (three tests) and runs as the `e2e` job on GitHub. It was green on `main` at `55a433c` and is required green on this branch before merge.

Agent failure behaviour is in `agent/src/engine/ai.test.ts`: a `publish` tool call is denied and audited, and a spent per-run or monthly token cap returns `BUDGET_EXCEEDED` and denies the next model call.

## Coverage

The gate is 80% lines, functions, and statements in each workspace. Branches are reported and are not part of the gate.

| workspace | lines | functions | statements | branches |
| --- | ---: | ---: | ---: | ---: |
| shared | 94.99 | 95.65 | 94.99 | 85.58 |
| agent | 96.24 | 98.50 | 96.24 | 85.42 |
| server | 92.24 | 95.60 | 92.24 | 73.53 |
| judge | 94.31 | 87.50 | 94.31 | 83.72 |

## Concurrency

`server/src/domain/domain.test.ts` registers 400 distinct users into a contest of 200 seats. The coverage run recorded that case at about 87 seconds. The result is exactly 200 seats and no duplicate seat.

The write is a filtered update: a seat is inserted only while `reserved < capacity`, and a unique partial index rejects a second active seat for the same user. Two requests cannot both observe spare capacity and both commit. The same file checks that a stale judge claim token does not apply a second verdict, and that a first solve is awarded once.

## Security

| threat | what holds it |
| --- | --- |
| Submitted code escapes the host | `docker run` with capabilities dropped, a read-only root, no network, a pid limit, and an unprivileged run user. `/work` is read-only for the run. |
| A participant calls an admin route | Role check returns 403 and the denial is audited. |
| A used refresh token is replayed | The refresh chain is revoked. |
| Registration oversells the room | Filtered seat update and the unique partial index. |
| Copied solutions are treated as independent | Winnowing similarity at 0.7 when a contest ends, and from Control. A match is a review. Nothing is disqualified automatically. |

Three tests: the escape suite in `judge/src/isolation.test.ts`, the 403-and-audit case in `server/src/http/auth.test.ts`, and the refresh-replay case in the same file. The participant-to-admin case is that 403.

## Performance

The before/after of the archive aggregation is the 3 October run in `tests/load/results/k6.md`. After the change, archive latency was p50 30.4 ms and p95 49.1 ms, at 99.9 requests/s, with 0% failed. The leaderboard script held p95 23.5 ms at 236.6 requests/s.

The 5 November rerun on this laptop, while Docker and the dev processes were busy, is in the same file. Throughput stayed near the target (99.6/s on `api`, 138/s on `leaderboard`) and 0% of requests failed. Latency thresholds on the `api` script were missed on this machine (archive p95 807 ms). The leaderboard script stayed inside its 1000 ms threshold (p95 248 ms). That rerun is not the aggregation comparison.

## Failure

`node tests/failure/run.mjs redis mongo` and `node tests/failure/run.mjs judge` against the running stack, compose project `codeclash-srujan`. `JUDGE_RESTART=touch` so `tsx watch` brought the judge back.

```
PASS  redis: /health recovers
PASS  redis: the in-flight submission is judged once · judged AC
PASS  mongo: /health recovers
PASS  mongo: seat counts match active seats
PASS  mongo: new submissions are judged after the restart
PASS  judge: the claimed submission gets one verdict after restart · judged AC
```

## Five defects

| bug | defect | regression |
| --- | --- | --- |
| CC-53 | Compiled languages failed in CI. The compile container drops every capability, so a mode-755 temp directory rejected `/work/main` and the verdict was CE. | `judge/src/languages.test.ts`, `judge/src/batch.test.ts` |
| CC-54 | Concurrent registration could hand out more seats than capacity. | `domain.test.ts`, exactly 200 seats for 400 users |
| CC-55 | A stale judge claim could award the same solve twice. | `domain.test.ts`, stale claim token |
| CC-56 | A used refresh token could be replayed into a new session. | `auth.test.ts`, refresh replay |
| CC-57 | A participant could call an admin route. | `auth.test.ts`, 403 and an audit row |

CC-54, CC-55, CC-56, and CC-57 were already fixed on `main` and are marked Done. CC-53 is fixed on this branch. At least two of the five (CC-54, CC-55, CC-57, and the escape suite beside them) come from the concurrency, security, and failure set. CC-53 is the sandbox defect that made `check` red from pull request #40 onward.

## Cost

Estimated cost was $0. Actual cost is $0. The stack is local Docker. Gemini is the free tier (`gemini-3.6-flash`, keys only in gitignored `.env`). There is no paid judge fleet. No cloud VM was already running, so nothing was launched for this measurement. The deploy section says what a free-tier host would cost if one is created later: an AWS t2.micro or t3.micro, or a GCP e2-micro, inside the account free tier, with disk and egress kept inside the course cap.

## Timeline

Taken from `git log` on `origin/main`. There is no fourth sprint.

| when | what landed |
| --- | --- |
| 24 Oct | #27 CC-41 failure drills |
| 25 Oct | #28 CC-42 escape suite, #29 CC-46 backups |
| 26 Oct | #30 CC-31 quiz |
| 27 Oct | #31 CC-35 publish check, #32 CC-44 practice slot |
| 1 Nov | #33 CC-32 rejudge, #34 CC-33 freeze |
| 2 Nov | #35 CC-38 workers |
| 3 Nov | #36 CC-39 audit search, #37 CC-43 profile |
| 4 Nov | #38 CC-45 ratings (last green `check`), #39 CC-48 metrics, #40 languages, #41 batch judge, #42 IOI subtasks, #43 CodeContests, #44 hardening engine, #45 hardening UI, #46 k6 and smoke |
| 5 Nov | CC-53 sandbox permission, similarity, mail, guide |

## Deploy

Not Vercel. The API holds Socket.IO connections, the judge is a Redis consumer that calls `docker run`, and Mongo is a replica set. A static host cannot run that.

One small Linux VM (AWS t2.micro / t3.micro in the free tier, or a GCP e2-micro) with Docker. The same `docker compose` file runs Mongo and Redis on that machine. The Node processes (server, judge, agent, and a built client served by the server or by a static file server on the same host) run beside them. The judge uses that machine's Docker socket. Secrets stay in the VM environment, not in git. Free-tier disk and egress stay inside the course cap.

On 5 November 2026 `aws freetier get-free-tier-usage` listed only AWS Glue. EC2 was not in the allowance, so a `t3.micro` would bill and no instance was started. `deploy/README.md` is the host recipe for an account that still has the allowance, including `aws ec2 stop-instances`. The demo runs on this PC.

## Traceability

Requirement, the issue that names it, the pull request that merged it, the test that locks it, and the result on this branch.

| requirement | Jira | PR | test | result |
| --- | --- | --- | --- | --- |
| Rejudge | CC-32 | #33 | flows, rejudge | pass |
| Freeze and reveal | CC-33 | #34 | flows, frozen board | pass |
| Workers register, drain, evict | CC-38 | #35 | flows, workers | pass |
| Audit search | CC-39 | #36 | flows, audit search | pass |
| Profile edits | CC-43 | #37 | auth, rename and password | pass |
| Ratings | CC-45 | #38 | flows, rate on publish | pass |
| Prometheus `/metrics` | CC-48 | #39 | server metrics route | pass |
| C, C++17, Java, Go | (no key; #40) | #40 | `languages.test.ts` | pass after CC-53 |
| Batch judge | (no key; #41) | #41 | `batch.test.ts` | pass after CC-53 |
| IOI subtasks | (no key; #42) | #42 | scoring tests | pass |
| CodeContests import | (no key; #43) | #43 | `codecontests.test.ts` | pass |
| Hardening engine | CC-35 still To Do for the auditor; engine is #44 | #44 | `pipeline.test.ts`, `ai.test.ts` | pass |
| Hardening UI | (no key; #45) | #45 | flows, enqueue and approve | pass |
| k6 and smoke | CC-40 still To Do; scripts are #46 | #46 | `tests/load`, `tests/smoke` | ran; see Performance |
| Compile permission | CC-53 | this branch | languages and batch | pass |
| Similarity / integrity | CC-37 | this branch | `similarity.test.ts`, Control | pass |
| Seats, 400 vs 200 | CC-54 | already on main | `domain.test.ts` | pass |
| Stale claim | CC-55 | already on main | `domain.test.ts` | pass |
| Refresh replay | CC-56 | already on main | `auth.test.ts` | pass |
| Participant to admin | CC-57 | already on main | `auth.test.ts` | pass |

Pull requests #40–#46 were merged by their authors with no review, and `check` was red from #40 because of CC-53. This branch does not rewrite those merges. It makes `check` able to go green.

## AI log

Short entries L9 (sandbox compile directory) and L10 (one hardening run with Gemini and one with the provider empty) are in `Deliverables/AI-Engineering-Log.tex`.
