# Abhiyan — Deployment Architecture

## Overview

Abhiyan runs on AWS in the `ap-south-1` (Mumbai) region. The API runs as a Lambda function fronted by API Gateway. The background worker runs as a long-lived ECS Fargate task. Both share a private RDS PostgreSQL database and an ElastiCache Redis cluster.

Estimated cost: **~$43/month**

---

## Architecture Diagram

```
Internet
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

## Secrets — SSM Parameter Store

All application config lives in SSM. Nothing is baked into images or committed to git.

| SSM Path | Description | Type |
|---|---|---|
| `/abhiyan/prod/DB_URL` | Full Postgres connection string | SecureString |
| `/abhiyan/prod/JWT_SECRET` | JWT signing secret | SecureString |
| `/abhiyan/prod/OPENAI_API_KEY` | Whisper transcription | SecureString |
| `/abhiyan/prod/BROKER_URL` | Redis connection string | SecureString |
| `/abhiyan/prod/DASHBOARD_URL` | Onion dashboard bind address | String |
| `/abhiyan/prod/FRONTEND_URL` | Frontend origin for invite/reset links | String |
| `/abhiyan/prod/AWS_S3_BUCKET_NAME` | S3 bucket name | String |

Both Lambda and ECS pull these at startup via their IAM task/execution roles. Your Go code continues to use `os.Getenv()` — nothing changes in the application.

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
2.  terraform apply modules/data           — RDS, ElastiCache (takes ~10 min)
3.  Run Atlas migrations against RDS       — atlas migrate apply --env prod
4.  Push SSM parameters                    — manually or via terraform apply
5.  terraform apply modules/compute        — ECR, ECS cluster, Lambda, API Gateway
6.  Build + push worker image to ECR       — triggers first ECS deployment
7.  Build + upload API zip                 — triggers first Lambda deployment
8.  terraform apply modules/routing        — ACM cert, Route 53 records
9.  Verify DNS propagation                 — dig api.yourdomain.com
10. Smoke test                             — curl https://api.yourdomain.com/api/v1/auth/login
```

---

## Environment Parity

| | Local | Production |
|---|---|---|
| API | `go run ./cmd/api` on `:8082` | Lambda + API Gateway |
| Worker | `go run ./cmd/worker` | ECS Fargate |
| Database | Docker Compose postgres | RDS PostgreSQL |
| Redis | Docker Compose redis | ElastiCache |
| Secrets | `.env` file | SSM Parameter Store |
| S3 | LocalStack or real S3 | AWS S3 |

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
