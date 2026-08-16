# Abhiyan — Deployment Architecture

## Overview

Abhiyan runs on AWS in the `ap-south-1` (Mumbai) region. The API runs as a Lambda function fronted by API Gateway. The background worker runs as a long-lived ECS Fargate task. Both share a private RDS PostgreSQL database and an ElastiCache Redis cluster.

Estimated cost: **~$43/month**

---

## Architecture Diagram

```
Internet
   │
   ├── app.yourdomain.com
   │       └── Vercel (React static site)
   │               └── calls api.yourdomain.com
   │
   ├── api.yourdomain.com
   │       └── API Gateway (HTTP API)
   │               └── Lambda Function (Go/Gin via adapter)
   │                       ├── RDS PostgreSQL  (private subnet)
   │                       └── ElastiCache Redis (private subnet)
   │
   └── worker dashboard
           └── SSM port-forward only (no public URL)
                   └── ECS Fargate Task (Worker binary)
                           ├── RDS PostgreSQL  (private subnet)
                           └── ElastiCache Redis (private subnet)

AWS Services (called directly, no VPC)
   ├── S3           — file storage, face photos, audio
   ├── SES          — email delivery
   └── Rekognition  — face validation + comparison
```

---

## AWS Services Used

| Service | Purpose | Size |
|---|---|---|
| Lambda | API server (Go/Gin) | 512 MB, arm64 |
| API Gateway | HTTP API, domain mapping | — |
| ECS Fargate | Background worker | 0.25 vCPU / 512 MB |
| RDS PostgreSQL | Primary database | db.t4g.micro, single-AZ |
| ElastiCache Redis | Task queue broker (Onion) | cache.t4g.micro |
| ECR | Docker image registry (worker) | — |
| S3 | File + face photo storage | — |
| SES | Transactional email | — |
| Rekognition | Face validation + comparison | — |
| ACM | SSL certificate | — |
| API Gateway domain | Custom domain for API | — |
| Route 53 | DNS hosted zone | — |
| SSM Parameter Store | App secrets + config | Standard tier |

---

## Networking

```
VPC: 10.0.0.0/16

Public Subnets (ECS Fargate worker — needs internet for Rekognition/Whisper):
  10.0.1.0/24  ap-south-1a
  10.0.2.0/24  ap-south-1b

Private Subnets (RDS + ElastiCache — no internet access):
  10.0.3.0/24  ap-south-1a
  10.0.4.0/24  ap-south-1b
```

Lambda runs outside the VPC (reaches AWS services directly via public endpoints). It connects to RDS via a **public RDS endpoint with security group restriction** — the RDS security group allows port 5432 only from Lambda's security group. This avoids needing a NAT Gateway for Lambda.

> **Note:** Alternatively Lambda can be placed inside the VPC. At this scale the cold-start penalty is negligible and VPC Lambda is the more secure option. The Terraform variable `lambda_in_vpc` controls this.

---

## Frontend — Vercel

The React frontend is a static site hosted on **Vercel**, completely separate from the backend Lambda. Vercel auto-deploys from GitHub and handles SSL, CDN, and domain mapping for free at this scale.

### How it connects to the API

The frontend uses `REACT_APP_BACKEND_URL` to know where to send requests. This is baked into the static build at deploy time — it is not fetched at runtime.

| Environment | `REACT_APP_BACKEND_URL` |
|---|---|
| Local dev | `http://localhost:8082/api/v1` |
| Vercel production | `https://api.yourdomain.com/api/v1` |

Set the production value in the Vercel dashboard under **Project → Settings → Environment Variables**, scoped to Production only. Vercel injects it at build time automatically.

### Custom domain on Vercel

1. Add your domain (e.g. `app.yourdomain.com`) in the Vercel project settings
2. Vercel gives you a CNAME record to add in Route 53
3. Add a `CNAME` record: `app.yourdomain.com → cname.vercel-dns.com`
4. Vercel provisions the SSL certificate automatically

### CI/CD

Vercel deploys automatically on every push to `main` (production) and every push to any other branch (preview URL). No workflow file needed — Vercel handles it via its GitHub integration.

```
push to develop  →  Vercel preview deploy  (https://abhiyan-git-develop-xyz.vercel.app)
push to main     →  Vercel production deploy  (https://app.yourdomain.com)
```

---

## Secrets — SSM Parameter Store

All application config lives in SSM. Nothing is baked into images or committed to git.

| SSM Path | Description | Type |
|---|---|---|
| `/abhiyan/prod/DB_URL` | Full Postgres connection string | SecureString |
| `/abhiyan/prod/JWT_SECRET` | JWT signing secret | SecureString |
| `/abhiyan/prod/OPENAI_API_KEY` | Whisper transcription | SecureString |
| `/abhiyan/prod/WHATSAPP_ACCESS_TOKEN` | WhatsApp Business API token | SecureString |
| `/abhiyan/prod/BROKER_URL` | Redis connection string | SecureString |
| `/abhiyan/prod/DASHBOARD_URL` | Onion dashboard bind address | String |
| `/abhiyan/prod/FRONTEND_URL` | Frontend origin for invite/reset links | String |
| `/abhiyan/prod/AWS_S3_BUCKET_NAME` | S3 bucket name | String |
| `/abhiyan/prod/AWS_SES_SENDER` | Verified SES sender email | String |
| `/abhiyan/prod/PHONE_ID` | WhatsApp Business phone ID | String |
| `/abhiyan/prod/COOKIE_DOMAIN` | Cookie domain | String |

Both Lambda and ECS pull these at startup via their IAM task/execution roles. Your Go code continues to use `os.Getenv()` — nothing changes in the application.

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **not stored anywhere** in production — Lambda and ECS authenticate via their IAM roles automatically.

---

## IAM Roles

### Lambda Execution Role
- `ssm:GetParameters` on `/abhiyan/prod/*`
- `kms:Decrypt` (for SecureString params)
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket
- `rekognition:DetectFaces`, `rekognition:CompareFaces`
- `ses:SendEmail`, `ses:SendRawEmail`
- `logs:CreateLogGroup`, `logs:PutLogEvents`

### ECS Task Execution Role (pull image + read SSM at launch)
- `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`
- `ssm:GetParameters` on `/abhiyan/prod/*`
- `kms:Decrypt`
- `logs:CreateLogGroup`, `logs:PutLogEvents`

### ECS Task Role (runtime permissions for worker)
- `s3:GetObject`, `s3:PutObject` on the bucket
- `rekognition:DetectFaces`, `rekognition:CompareFaces`
- `ses:SendEmail`
- `ssm:GetParameters` on `/abhiyan/prod/*`

---

## Domain Setup

### API — `api.yourdomain.com`
1. ACM issues a certificate for `api.yourdomain.com` in `us-east-1` (API Gateway custom domains require this region for the cert)
2. API Gateway HTTP API is created
3. A custom domain `api.yourdomain.com` is attached to the API Gateway
4. Route 53 A record (alias) points to the API Gateway regional endpoint

### Worker Dashboard — no public domain
The Onion dashboard (port 8081) is not exposed publicly. Access it via SSM:

```bash
# Find the running task ARN
aws ecs list-tasks --cluster abhiyan-prod --service-name abhiyan-worker

# Open a tunnel
aws ecs execute-command \
  --cluster abhiyan-prod \
  --task <task-arn> \
  --container worker \
  --interactive \
  --command "/bin/sh"

# Or use SSM port forwarding to the task's private IP
aws ssm start-session \
  --target <ec2-or-ecs-target> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8081"],"localPortNumber":["8081"]}'
```

Then open `http://localhost:8081` in your browser.

---

## Lambda — Gin Adapter

The API `main.go` needs a small change to support both local dev and Lambda:

```go
// server/cmd/api/main.go

func buildRouter() *gin.Engine {
    // move all your existing router setup here
    // return r instead of r.Run()
}

func main() {
    if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
        // Running on Lambda
        lambda.Start(ginadapter.NewV2(buildRouter()).ProxyWithContext)
    } else {
        // Local dev
        buildRouter().Run(":8082")
    }
}
```

Add the adapter dependency:
```bash
go get github.com/awslabs/aws-lambda-go-api-proxy/gin
go get github.com/aws/aws-lambda-go/lambda
```

The Lambda is built as a zip artifact, not a Docker image:
```bash
GOOS=linux GOARCH=arm64 go build -o bootstrap ./cmd/api/main.go
zip api.zip bootstrap
```

---

## Docker — Worker

The worker is deployed as a Docker container on ECS Fargate. The existing `Dockerfile.worker` is used with one change — **remove the `.env` copy line**. Secrets come from SSM, not a file.

```dockerfile
# Remove this line from Dockerfile.worker:
# COPY server/.env /app/.env
```

---

## CI/CD — GitHub Actions

Two workflows:

### `deploy-api.yml` — triggers on push to `main` (changes in `server/`)
```
1. go test ./...
2. Build Lambda zip (GOOS=linux GOARCH=arm64)
3. Upload zip to S3 (Lambda deployment bucket)
4. aws lambda update-function-code --zip-file
5. aws lambda wait function-updated
```

### `deploy-worker.yml` — triggers on push to `main` (changes in `server/` or `Dockerfile.worker`)
```
1. docker build -t worker .
2. docker push to ECR
3. aws ecs update-service --force-new-deployment
4. ECS drains old task, starts new one with new image
```

Both workflows use an IAM role via OIDC (no long-lived AWS access keys stored in GitHub secrets).

---

## First-Time Deployment Sequence

```
1.  terraform apply modules/networking     — VPC, subnets, security groups
2.  terraform apply modules/data           — RDS, ElastiCache + SSM params (takes ~10 min)
3.  Set real secrets in SSM               — JWT_SECRET, OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN
      aws ssm put-parameter --name "/abhiyan/prod/JWT_SECRET" --value "..." --type SecureString --overwrite
4.  Run Atlas migrations against RDS       — atlas migrate apply --env prod
5.  terraform apply modules/compute        — ECR, ECS cluster, Lambda, API Gateway
6.  Build + push worker image to ECR       — triggers first ECS deployment
7.  Build + upload API zip                 — triggers first Lambda deployment
8.  terraform apply modules/routing        — ACM cert, Route 53 records
9.  Connect Vercel to GitHub repo          — import project, set REACT_APP_BACKEND_URL env var
10. Add custom domain in Vercel            — app.yourdomain.com → add CNAME in Route 53
11. Verify DNS propagation                 — dig api.yourdomain.com && dig app.yourdomain.com
12. Smoke test                             — curl https://api.yourdomain.com/api/v1/auth/login
```

---

## Environment Parity

| | Local | Production |
|---|---|---|
| Frontend | `npm start` on `:3000` | Vercel (`app.yourdomain.com`) |
| API | `go run ./cmd/api` on `:8082` | Lambda + API Gateway (`api.yourdomain.com`) |
| Worker | `go run ./cmd/worker` | ECS Fargate |
| Database | Docker Compose postgres | RDS PostgreSQL |
| Redis | Docker Compose redis | ElastiCache |
| Secrets | `.env` file | SSM Parameter Store |
| S3 | Real S3 bucket (`abhiyan-bucket-dev`) | Real S3 bucket (`abhiyan-uploads`) |
| API URL (FE) | `http://localhost:8082/api/v1` | `https://api.yourdomain.com/api/v1` |

---

## Rollback

**API (Lambda):** Lambda keeps the previous deployment as an alias. Rollback is instant:
```bash
aws lambda update-alias --function-name abhiyan-api --name prod --function-version <previous-version>
```

**Worker (ECS):** ECS keeps the previous task definition revision. Rollback:
```bash
aws ecs update-service --cluster abhiyan-prod --service abhiyan-worker --task-definition abhiyan-worker:<previous-revision>
```

---

## Migration Plan — ElastiCache → Postgres Broker (~$14.60/month savings, $0 added cost)

Replaces the Redis broker with a `FOR UPDATE SKIP LOCKED`-based queue table on
the existing RDS Postgres instance — no new AWS resource of any kind. This
supersedes the earlier SQS plan: SQS needed a ~$7.30/mo VPC interface endpoint
because Lambda has no NAT/internet egress from the private subnets, but Lambda
and the worker already reach RDS privately over the existing `rds_sg` rule, so
that whole networking problem doesn't exist here. Full ElastiCache removal,
zero added infra cost.

### 1. Onion (separate repo) — status
- `broker/postgres.go` is implemented: `PostgresBroker` satisfies `Enqueue`,
  `Dequeue`, `Ping`, `Len` via an atomic `SELECT ... FOR UPDATE SKIP LOCKED`
  pop against a self-migrating `onion_queue` table, polling on a short
  interval since Postgres has no blocking-pop primitive like `BRPOP`.
- `app.Config.BrokerAddr` is now a `{Broker BrokerType, Addr string}` struct
  (`broker.BrokerRedis` / `broker.BrokerPostgres`) instead of a bare string,
  dispatched through `brokerHelper` in `app/app.go`.
- Before tagging a release: `brokerHelper` is missing a `default` case in its
  type switch — an unmatched/unset `BrokerType` currently returns a nil
  broker with a nil error, which panics on the `Ping` call right after. Needs
  a one-line fix (mirror `backendHelper`'s `default: return nil, fmt.Errorf(...)`).
  Also decide whether to keep or delete the now-orphaned `broker/sqs.go` stub
  before tagging, and run `go mod tidy` after that decision (it currently
  carries the full AWS SDK v2 dependency tree for an unused file).

### 2. Abhiyan code changes
- Bump `server/go.mod`'s pinned Onion version to the release with the fix
  above.
- `cmd/api/main.go` and `cmd/worker/main.go`: change how `app.Config.BrokerAddr`
  is built — from `app.BrokerAddr{Broker: broker.BrokerRedis, Addr: <redis addr>}`
  to `app.BrokerAddr{Broker: broker.BrokerPostgres, Addr: <postgres DSN>}`.
  The DSN shape is identical to what `DB_URL` already uses (`NewPostgresBroker`
  and the backend's `NewPostgres` both just `sql.Open("postgres", connStr)`) —
  simplest is to point `BROKER_URL` at the same connection string as `DB_URL`.
- Drop worker `Concurrency` from `10` to `5` in `cmd/worker/main.go` while
  you're in there — halves the number of goroutines independently polling
  `onion_queue`, for free, unrelated to correctness but worth doing in the
  same pass.

### 3. `terraform/modules/data`
- Update `aws_ssm_parameter.broker_url` to hold a Postgres connection string
  instead of the Redis `address:6379` value — can literally reuse the same
  value as `aws_ssm_parameter.db_url`.
- Remove `aws_elasticache_subnet_group.main` and `aws_elasticache_cluster.redis`
  once cutover is verified (not on first apply — keep Redis running until the
  new broker is confirmed working in prod).
- No new resources needed — `onion_queue` is created automatically by
  `PostgresBroker`'s self-migration on first connect, same as how
  `onion_tasks` already gets created by the backend.

### 4. `terraform/modules/networking`
- Nothing to add. No VPC endpoint, no NAT Gateway — this is the entire
  category of work the SQS plan required, and it goes away.
- After cutover, remove the `aws_security_group.redis` security group (now
  unused) along with the ElastiCache resources.

### 5. `terraform/modules/compute/iam.tf`
- No changes. Postgres access is security-group-based (already granted via
  `rds_sg`'s existing ingress from `worker_sg`/`lambda_sg`), not IAM-based —
  unlike SQS, there's no new IAM policy to write.

### 6. Cutover sequence
1. `terraform apply` the `broker_url` SSM value change in `modules/data` —
   Redis keeps running, this is just updating what the parameter *will* point
   to once the new code reads it.
2. Deploy the new worker (ECS) and API (Lambda) builds with the bumped Onion
   version and updated `BrokerAddr` wiring. First connection creates
   `onion_queue` automatically.
3. Verify tasks flow correctly (dashboard, logs) — confirm both `Enqueue`
   from Lambda and `Dequeue` from the worker are hitting Postgres, not Redis.
4. Remove `aws_elasticache_cluster.redis`, its subnet group, and the
   `redis_sg` security group in `modules/networking`/`modules/data`;
   `terraform apply`.
