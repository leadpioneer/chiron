# AGENTS.md — Chiron

## What this is

Chiron is an adaptive strength-training diary for beginners and returning lifters.
It is a wellness planning tool, not a medical system. The product is Russian-first.

Read `docs/decisions/v1-decisions.md` before changing product behaviour.

## Non-negotiable invariants

1. The LLM never writes the plan or the database. It parses language and explains a decision already made by the rules engine.
2. A plan is immutable. Every change creates a new `plan_version` linked to a `decision` and an `audit_event`.
3. Missing data is stored as `null`. Never substitute zero, an average, an e1RM, or a guess.
4. Safety outranks progression and exercise independence.
5. One decision changes one parameter of one exercise. A deload is one scoped decision and may touch several exercises.
6. Metrics are per exercise. Never add tonnage across exercises into a "strength score".
7. Every recommendation, parse and plan change stores rules, prompt, model and schema versions.
8. No diagnosis, no "this pain is safe", no "the app prevented injury", no guaranteed results.
9. An LLM request carries only the system prompt and workout text. It never includes `userId`, email, Telegram id, display name, session cookie or other identifiers.

## Architecture

```
apps/web                 Next.js App Router UI + REST API
packages/core            pure TypeScript domain: metrics, rules, safety, LLM contract
packages/contracts       Zod schemas shared by API and UI
packages/db              Drizzle schema, client, migrations, seed
```

`packages/core` must not import Next.js, React, Drizzle or `packages/db`.
Database access belongs to `packages/db` and `apps/web/src/lib`.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run db:migrate && npm run db:seed
npm run dev
```

Without Docker, `npm run db:dev` starts an embedded PostgreSQL, applies
migrations and seeds the catalog, then `npm run dev` starts the app.

Postgres for local development:

```bash
docker compose up -d db
copy .env.example .env
```

## Local machine notes

Machine-specific access notes live in `AGENTS.local.md` next to this file. It is
gitignored and must not be committed. Read it before deployment or server work.

## Change gates

Ask the owner before changing:

- database migrations;
- rule thresholds in `packages/core/src/rules.ts`;
- safety word lists;
- prompt text or LLM provider/model;
- API contracts;
- auth;
- retention or deletion policy.

## Definition of done

Code + tests + updated docs/decision record + demo on staging + audit check + no regressions.
