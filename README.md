# Abhiyan

Abhiyan is a full-stack workforce management platform built for organizations that need more than a simple to-do list. It combines task tracking, team collaboration, smart reminders, biometric attendance, and employee performance scoring into a single, role-aware system.

---

## Features

### Organization & User Management

Admins register their organization once. From there, they invite employees via secure email links. Each user belongs to one organization and carries one or more system roles: **Super Admin**, **Admin** (team lead), or **Employee**. Users can switch active roles without logging out.

Invited users receive a time-limited link, click it, set their name, phone, and password, and their account becomes active. Super Admins can suspend or re-activate accounts, and users who are suspended are blocked at the middleware level across all routes.

---

### Team & Task Management

Super Admins create **Teams** and assign members to them. Admins manage the teams they lead. Tasks are created within a team, assigned to one or more members, and can carry a due date, description, and file attachments.

The task lifecycle is:

```
OPEN → [employee submits] → PENDING REVIEW → [admin approves or rejects] → CLOSED / OPEN
```

Tasks also support **updates** (progress posts by any team member) and threaded **comments** on those updates.

---

### Smart Reminders (WhatsApp & Email)

Admins can attach reminders to tasks. A reminder fires at a scheduled time via the channel of choice — **WhatsApp** or **Email** — and can be set to recur on a fixed interval (minutes, hours, days, weeks, or months).

**How it works:** A background worker polls the database for due reminders on a cron schedule. When a reminder is due, it dispatches individual messages for each assignee through a priority-based task queue (Redis-backed). For recurring reminders, after dispatching, the worker inserts a brand-new reminder row for the next scheduled occurrence and marks the current one complete. This means recurring reminders are stateless row-by-row — there is no persistent schedule object to drift.

---

### Audio Attachments with Transcription

When a task update includes an audio file attachment, Abhiyan automatically transcribes it in the background. The transcription appears inline in the task thread once it is ready.

**How it works:** The client uploads audio directly to S3 via a presigned URL. The API inserts a `transcription` row in a `PENDING` state. The background worker picks up the transcription job, downloads the audio from S3, and sends it to the **OpenAI Whisper API**. On success, the transcription text is saved and the status is set to `COMPLETED`. The frontend polls the transcription endpoint until it resolves.

---

### Biometric Face Attendance

Employees mark their attendance daily by taking a live selfie through the browser. The system compares that selfie against their registered face photo using AWS Rekognition. A match means present; no match means absent.

**Registration:** When an employee registers their face, the photo is uploaded directly to S3. A background validation job runs **AWS Rekognition DetectFaces**, checking that the photo contains exactly one face with sufficient confidence (≥ 90%), brightness (≥ 40), and sharpness (≥ 40). If the image fails validation, the employee is notified with a specific reason (e.g., `low_brightness`).

**Daily check-in:** When an employee submits their attendance selfie, the API creates an attendance record and enqueues a **CompareFaces** job. The worker calls AWS Rekognition's `CompareFaces` with an 80% similarity threshold, comparing the live selfie (target) against the registered photo (source). The result (`matched` or `unmatched`) is written back to the attendance record. A daily cron job batch-inserts `absent` records for any employee in an attendance-enabled org who never submitted a selfie that day.

Attendance is opt-in at the organization level — Super Admins can toggle it on or off. Admins can view attendance by date and team, and download CSV reports.

---

### Gamified Performance Scoring & Leaderboard

Every approved task earns the assignee points. The scoring model rewards early completion with a bonus on top of the base score.

**Scoring formula:**
- **On-time completion**: 10 base points + up to 5 bonus points. The bonus scales linearly with how much time remained between approval and the due date, relative to the total task window.
- **Late completion**: 3 points (task was approved after its due date).
- **Rejection**: 0 points; the previous score event for that task is superseded.
- **Re-open**: all prior score events for the task are superseded and start fresh when it is eventually approved.

**How it works:** Scoring happens inside the same database transaction as the approval or rejection action. `SupersedeScoreEvents` marks any prior score events for that task/user pair as inactive before inserting the new event. This means the leaderboard always reflects the current state of a task, not stale intermediate states.

Admins can toggle the **leaderboard** on or off per team, controlling whether employees can see how they rank. Admins always have full visibility. Score reports — per-employee or bulk across teams — can be downloaded as CSV.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Go, Gin |
| Database | PostgreSQL 16, sqlc (type-safe queries), Atlas (migrations) |
| Task Queue | Onion (Redis-backed, priority queues) |
| Frontend | React |
| File Storage | AWS S3 (direct presigned-URL uploads) |
| Face Recognition | AWS Rekognition |
| Speech-to-Text | OpenAI Whisper API |
| Auth | JWT (RS/HS256), bcrypt |
| Infrastructure | Docker Compose |

---

## Architecture Overview

```
Browser (React)
    │
    ├─ uploads files directly → AWS S3 (presigned URL)
    │
    └─ REST API calls → Go API Server (Gin, :8082)
                            │
                            ├─ PostgreSQL (state, users, tasks, attendance, scores)
                            │
                            └─ Onion Task Queue (Redis broker)
                                    │
                                    └─ Go Worker Process
                                            ├─ Email delivery
                                            ├─ WhatsApp delivery
                                            ├─ Reminder polling
                                            ├─ Audio transcription (Whisper)
                                            └─ Face validation / comparison (Rekognition)
```

---

## Role Hierarchy

| Role | Capabilities |
|---|---|
| **Super Admin** | Org-wide: invite users, create teams, manage all members, view all attendance, toggle attendance feature |
| **Admin** | Team-scoped: create tasks, manage team members, approve/reject submissions, view leaderboard |
| **Employee** | View assigned tasks, post updates, submit tasks for review, mark attendance, view leaderboard (if enabled) |

---

## Getting Started

### Prerequisites

- Go 1.22+
- Node.js 18+
- Docker & Docker Compose
- AWS credentials (S3, Rekognition)
- OpenAI API key (for transcription)

### Run infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL (port 5432), Redis (port 6381), and the background worker (dashboard on port 8081).

### Run the API

```bash
cd server
cp .env.example .env   # fill in DB_URL, JWT_SECRET, AWS credentials, OPENAI_API_KEY
go run ./cmd/api
```

The API listens on `:8082`.

### Run the frontend

```bash
cd web
npm install
npm start
```

### Run migrations

```bash
atlas migrate apply --env local
```
