# One host

The API holds Socket.IO connections, the judge calls `docker run`, and Mongo is a replica set. One small Linux VM runs all of it. There is no load balancer and no NAT gateway.

## Free tier

Before launching, confirm the account still has the EC2 12-month allowance:

```
aws freetier get-free-tier-usage --query "freeTierUsages[].service" --output text
```

On 5 November 2026 the signed-in account listed only AWS Glue. EC2 was not in the allowance, so a `t3.micro` would bill. No instance was started. The commands below are what to run on an account that still has the allowance. Stop the instance after the demo:

```
aws ec2 stop-instances --instance-ids <id>
```

## Instance

Ubuntu or Amazon Linux, `t3.micro`, public subnet, a public IP, 20 GB gp3. Security group: port 22 from the presenter's address, port 80 open, nothing else. Add 1 GB of swap on the root disk. Mongo, Redis, and Mailpit stay on localhost.

## On the machine

Install Docker, Caddy, and Node 22. Clone the repo to `/opt/codeclash`. Copy `deploy/Caddyfile` into Caddy. Put secrets in `server/.env` and `agent/.env`, not in git. `CLIENT_ORIGIN` is `http://<public-ip>`.

```
docker compose up -d
npm ci
npm run build
npm run seed
docker pull python:3.12-alpine
```

Install the three unit files from this directory and start them. The judge uses the machine's Docker socket. Caddy serves `client/dist` and proxies `/api`, `/socket.io`, `/health`, and `/metrics` to port 4000. Mailpit's inbox is on the VM at `127.0.0.1:8025`. Forward it with `ssh -L 8025:127.0.0.1:8025` if the `/mail` prefix breaks the inbox assets.

Then, from a machine that can reach the host:

```
API_URL=http://<public-ip> node scripts/demo-harden.mjs
```
