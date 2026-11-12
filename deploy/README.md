# Deployment

The demo host is a trial-credit VM, not Always Free. Delete it on 20 November 2026. If it is still running when the 30-day trial ends, the card is charged.

- Shape: `VM.Standard.E5.Flex`, 1 OCPU, 8 GB, Ubuntu 24.04
- Address: `129.225.92.29`
- Instance: `ocid1.instance.oc1.ap-hyderabad-1.anuhsljrgjdrkcycqdajtfknclhdwyi6bo5llpzkljfcsy3ut4e7tnjdqjca`
- Region: India South (Hyderabad), `ap-hyderabad-1`
- SSH: `ssh -i ~/.ssh/codeclash_oracle ubuntu@129.225.92.29`
- Ports open: 22, 80, 443. Do not publish Mongo, Redis, or Mailpit.

The free Ampere shape was out of host capacity on 6 November 2026. This machine spends trial credit, about $15 across the two weeks. Do not launch a second VM, and do not launch an EC2 instance.

CodeClash is one host. The API holds Socket.IO connections, the judge calls `docker run`, and MongoDB is a replica set. We do not put this on a static host, and we do not add a load balancer or a NAT gateway.

The public demo is http://129.225.92.29. This PC stays the backup. The AWS steps further down are for an account that still has the EC2 allowance. Ours does not. We checked on 5 November 2026 and did not launch an EC2 instance.

## 1. Processes

| Process | Where | Role |
| --- | --- | --- |
| MongoDB 7, replica set `rs0` | localhost | Source of truth |
| Redis 7 | localhost | `judge:contest`, `judge:practice`, `agent:harden` |
| Mailpit, or Oracle Email Delivery | SMTP 1025 on this PC; port 587 on the VM | The six-digit signup code |
| server | port 4000 | HTTP and Socket.IO |
| judge | this machine's Docker socket | One submission, one container |
| agent | optional `GEMINI_API_KEY` | One hardening run |
| client | Vite 5173 here, or Caddy on a VM | The pages |

Secrets stay in `server/.env` and `agent/.env`. We do not commit them.

## 2. This PC

Compose project name: `codeclash-srujan`. Do not restart the other compose project named `codeclash`.

```
docker compose up -d
npm run dev
```

Seed only when the database is empty:

```
npm run seed
```

- App: http://127.0.0.1:5173
- Mailpit: http://127.0.0.1:8025
- Seeded password: `codeclash`

The two-minute agent slot opens the saved files, not a fresh model call:

- `Deliverables/demo/hardening.json` — provider set, Larger of two
- `Deliverables/demo/hardening-empty.json` — provider unset

To record either file again:

```
node scripts/demo-harden.mjs
node scripts/demo-harden.mjs Deliverables/demo/hardening-empty.json
```

The second command needs `AGENT_PROVIDER` unset in that process. Leave `agent/.env` on `AGENT_PROVIDER=gemini` afterwards.

## 3. The VM we did not start

Confirm the allowance before any launch:

```
aws freetier get-free-tier-usage --query "freeTierUsages[].service" --output text
```

On 5 November 2026 our account listed only AWS Glue. EC2 was not in the 12-month allowance, so a `t3.micro` would have billed us. No instance was started. The steps below are for an account that still has the allowance.

1. Ubuntu or Amazon Linux, `t3.micro`, public subnet, a public IP, 20 GB gp3. Security group: port 22 from our address, port 80, nothing else. Add 1 GB of swap on the root disk.
2. Install Docker, Caddy, and Node 22. Clone the repo to `/opt/codeclash`.
3. Copy `deploy/Caddyfile` into Caddy. Put secrets in `server/.env` and `agent/.env`. Set `CLIENT_ORIGIN` to `http://<public-ip>`.
4. On the machine:

```
docker compose up -d
npm ci
npm run build
npm run seed
docker pull python:3.12-alpine
```

5. Install `deploy/codeclash-server.service`, `deploy/codeclash-judge.service`, and `deploy/codeclash-agent.service`, and start them. The judge uses that machine's Docker socket.
6. Caddy serves `client/dist` and proxies `/api`, `/socket.io`, `/health`, and `/metrics` to `127.0.0.1:4000`. Mailpit stays on `127.0.0.1:8025`. If the `/mail` prefix breaks the inbox assets, forward it with `ssh -L 8025:127.0.0.1:8025`.
7. From a machine that can reach the host:

```
API_URL=http://<public-ip> node scripts/demo-harden.mjs
```

8. Stop the instance after the slot:

```
aws ec2 stop-instances --instance-ids <id>
```

## 4. Real email

Mailpit is only the inbox on this PC. A message sent to `127.0.0.1:1025` is not delivered to Gmail.

On the VM, `SMTP_URL` is Oracle Email Delivery on port 587, and `MAIL_FROM` is the Gmail address Oracle approved. On 6 November a register of that address returned `mailed: true`, with no code in the response. The server log had no send error, so the relay accepted the message. We have not confirmed it in the Gmail inbox. Gmail can still drop a `gmail.com` From address signed by Oracle. Brevo (300 messages a day) is the backup only if that happens, and it needs a login we cannot confirm from here. A password that contains `@` is written as `%40` in the URL.

The signup request gives up after 10 seconds if the relay does not answer. It does not sit there waiting. The site is plain HTTP, so the submit button does not call `crypto.randomUUID` (that exists only on HTTPS and localhost). It uses `getRandomValues` instead.

Mongo, Redis, and Mailpit listen on `127.0.0.1` only. Caddy does not publish the inbox. The Ubuntu image allowed only SSH until we opened ports 80 and 443.

## 5. What we leave out

- A NAT gateway, a load balancer, and RDS. They bill immediately, and this host does not need them.
- A second judge machine. The judge uses the same Docker socket as the API.
- Keys in git. Gemini keys are unit environment or the gitignored env files.
