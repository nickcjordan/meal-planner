# Meal Planner

Family meal planning platform powered by Claude AI.

## Quality Gates

```bash
npm ci
npm run check   # build + typecheck + lint + test + test:integration via turbo --force
```

Never push if either of these fail.

## Project Structure

Turborepo monorepo:
- `apps/web` — Next.js 15 App Router frontend + API routes
- `packages/types` — Shared TypeScript type definitions
- `packages/db` — DynamoDB client, entity CRUD operations

## Scripts

- `npm run setup:db` — Create DynamoDB table (idempotent)
- `npm run seed` — Seed starter recipes into DynamoDB
- `npm run dev` — Start local development

## Architecture

- **AI**: Claude Agent SDK on Next.js backend (uses Claude subscription, not API tokens)
- **Database**: DynamoDB single-table design with GSI1 inverted index
- **MCP**: Custom in-process MCP server gives Claude read/write access to DynamoDB

## DynamoDB

Table name configured via `DYNAMODB_TABLE_NAME` env var (defaults to `meal-planner-dev`).
AWS credentials resolved from local environment (`~/.aws/credentials` or env vars).

## Conventions

- TypeScript strict mode everywhere
- Vitest for unit and integration tests
- ESLint flat config + Prettier
