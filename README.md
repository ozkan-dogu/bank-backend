# bank-backend

Backend for the **Bank Transactions Simulator** — a NestJS + TypeORM + PostgreSQL API that
simulates many people depositing money into a single shared bank account at the same time,
while guaranteeing that the resulting balance is always correct.

## Overview

The API exposes:

- `GET /persons` — the list of seeded persons who can send money
- `GET /bank` — the current balance of the single bank account
- `GET /transactions` — recent transactions, newest first
- `POST /transactions` — accepts a **batch** of `{ personId, amount }` deposits, processes
  them **concurrently**, and returns the outcome of each one plus how long the batch took
- `GET /health` — liveness/readiness check, including DB connectivity
- `GET /api/docs` — Swagger UI

On startup, the app seeds five persons (`John`, `Mike`, `Sarah`, `Anna`, `Alex`) and a single
bank account with `balance = 0`, if they don't already exist.

## Architecture

- **NestJS** — modular structure (`persons`, `bank`, `transactions`, `health`, `common`,
  `config`), global `ValidationPipe` with DTO validation (`class-validator`), Swagger docs.
- **TypeORM** — entities (`Person`, `Bank`, `Transaction`), `synchronize: true` and
  `autoLoadEntities: true` for a frictionless setup, configured purely from `DATABASE_URL`.
- **PostgreSQL** — single source of truth for persons, the bank balance, and transaction
  history.

High-level flow for `POST /transactions`:

```
Client ──► POST /transactions [{ personId, amount }, ...]
              │
              ├─► validate each item (DTO: personId is a positive int, amount > 0)
              │
              ├─► Promise.all( for each item: process it independently )
              │        └─► open its own DB transaction, lock the bank row,
              │            credit the balance, record a Transaction row, commit
              │
              └─► respond with per-item results + total durationMs
```

## Concurrency Strategy (Mandatory reading)

This is the most important part of the assessment: **the bank balance must end up exactly
correct, no matter how many transactions are processed at the same time.**

### The race condition

The naive way to credit the balance is:

```
1. read balance           (e.g. 0)
2. compute newBalance     (0 + 100 = 100)
3. write newBalance back
```

If two requests run this sequence concurrently, both can read `balance = 0` before either
writes back, so the final balance becomes `100` instead of the correct `300` — a classic
**lost update**. No amount of application-level care (e.g. read-then-write in plain
TypeORM repository calls) fixes this; the database itself must serialize the
read-modify-write.

### The fix: per-transfer DB transaction + pessimistic row lock

Each `{ personId, amount }` item is processed by `TransactionsService.processSingleTransfer`
(`src/transactions/transactions.service.ts`), which:

1. Opens its **own** `QueryRunner` and starts a database transaction
   (`queryRunner.startTransaction()`).
2. Looks up the `Person`. If they don't exist, records a `FAILED` transaction and returns
   — without ever touching the bank row.
3. Loads the **single** `Bank` row with a pessimistic write lock:
   ```ts
   queryRunner.manager.findOne(Bank, {
     where: {},
     lock: { mode: 'pessimistic_write' },
   });
   ```
   TypeORM translates this into `SELECT ... FOR UPDATE`. PostgreSQL then **blocks** any other
   transaction that tries to acquire the same lock on that row until the current one commits
   or rolls back.
4. Computes `balance + amount` and saves it, then inserts a `SUCCESS` `Transaction` row, then
   commits. On any error, the whole transaction is rolled back and a `FAILED` result is
   returned.

Because the lock is acquired **inside** the same DB transaction that performs the read and
the write, and every concurrent transfer goes through the exact same code path, PostgreSQL
serializes the critical section for us: transaction B's `SELECT ... FOR UPDATE` simply waits
until transaction A commits and releases the lock, at which point B sees A's already-updated
balance. The read-modify-write can never interleave, so lost updates are impossible.

### Why per-transfer transactions (not one transaction for the whole batch)?

`TransactionsService.processBatch` runs all items via `Promise.all`, and each item gets its
own `QueryRunner`/transaction/lock acquisition. This means:

- Transfers are **genuinely concurrent** at the application layer (satisfying the
  "use `Promise.all`, don't process sequentially" requirement) — PostgreSQL only serializes
  the few milliseconds each transfer spends holding the row lock, not the entire request.
- One invalid or failing transfer (e.g. an unknown `personId`) cannot roll back or block the
  others in the same batch — each is fully independent.

### Why this is the right amount of machinery

No Redis, queues, CQRS, or distributed locks are needed: there is exactly one row that is
ever contended (the single `Bank` row), and PostgreSQL's native row-level locking inside a
transaction is the simplest, standard, battle-tested tool for exactly this problem.

## Edge cases handled

- **Missing fields / wrong types / non-positive amounts / non-positive `personId`** — rejected
  for the whole batch with `400 Bad Request` by the global `ValidationPipe`
  (`class-validator` on `CreateTransactionItemDto`, enforced via `ParseArrayPipe`).
- **Unknown `personId`** — can only be detected by querying the database, so it is recorded
  as an individual `FAILED` transaction (with a `reason`) without affecting the rest of the
  batch or the balance.
- **Database failures during processing** — caught, the transaction is rolled back, and the
  item is reported as `FAILED` with a generic reason; the error is logged server-side.

## Setup Instructions

### Prerequisites

- Node.js 22+
- Docker (for local PostgreSQL via `docker-compose.yml`)

### 1. Start PostgreSQL locally

```bash
docker compose up -d
```

This starts a `postgres:16-alpine` container on `localhost:5432` with the credentials used
in `.env.example` (`bank` / `bank` / database `bank`).

### 2. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` already match `docker-compose.yml`.

### 3. Install dependencies and run

```bash
npm install
npm run start:dev
```

The API is now available at `http://localhost:3000`, with Swagger at
`http://localhost:3000/api/docs`. On first boot, the seed persons and the bank account
(`balance = 0`) are created automatically.

## Running the tests

### Unit tests

```bash
npm run test
```

These mock `DataSource`/`QueryRunner` and verify `TransactionsService`'s behaviour in
isolation: successful credits, `FAILED` handling for unknown persons, rollback on errors,
and that a batch is processed concurrently.

### Concurrency e2e tests (the proof of correctness)

These spin up the full Nest application against a **real PostgreSQL** instance and prove
that the balance cannot be corrupted under load — this is the most important test in the
project.

1. Make sure the local database is running and reachable via the `DATABASE_URL` in `.env`:

   ```bash
   docker compose up -d
   cp .env.example .env   # if you haven't already
   ```

2. Run:

   ```bash
   npm run test:e2e
   ```

`test/concurrency.e2e-spec.ts` does the following:

- Sends a **single batch request containing 80 deposits** (processed concurrently via
  `Promise.all` inside one `POST /transactions` call) and asserts that the balance increased
  by **exactly** the sum of the amounts.
- Fires **50 separate, simultaneous HTTP requests** (`Promise.all` over `supertest` calls,
  simulating 50 different clients hitting the API at the same time) and asserts that the
  balance increased by **exactly** `50 × amount`.

Both assertions are **delta-based** (`finalBalance - initialBalance`), so the test is
repeatable and independent of whatever data already exists in the database — if even a
single update were lost to a race condition, the delta would be smaller than expected and
the test would fail.

## Environment Variables

| Variable       | Description                                | Example (local)                              |
| -------------- | ------------------------------------------ | -------------------------------------------- |
| `PORT`         | Port the NestJS HTTP server listens on     | `3000`                                        |
| `DATABASE_URL` | PostgreSQL connection string               | `postgresql://bank:bank@localhost:5432/bank`  |

See `.env.example` for a ready-to-copy template.

## Deployment Information

| Component | Platform           | URL                                       |
| --------- | ------------------ | ----------------------------------------- |
| API       | Railway            | `https://api-bank.ozkandogu.dev`           |
| Database  | Railway PostgreSQL | (internal — accessed via `DATABASE_URL`)   |
| Swagger   | Railway            | `https://api-bank.ozkandogu.dev/api/docs`  |

On Railway, set `DATABASE_URL` to the Railway-managed PostgreSQL connection string. Railway
injects `PORT` automatically and the app already reads `process.env.PORT`.
