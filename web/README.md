Nasiha web app — Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui, Prisma/PostgreSQL, Redis.

## Getting Started (Docker)

From the repo root:

```bash
docker compose up
```

This starts the Next.js app, PostgreSQL, and Redis together. On startup the app container generates the Prisma client and applies any pending migrations automatically. Once ready, open [http://localhost:3000](http://localhost:3000).

## Getting Started (local, without Docker)

Requires a local PostgreSQL and Redis instance. Copy `.env.example` to `.env` and adjust `DATABASE_URL` / `REDIS_URL` if needed, then:

```bash
npm install
npx prisma migrate dev
npm run dev
```

## Reference API routes

- `GET /api/health` — checks DB and Redis connectivity
- `GET|POST /api/example` — reference Redis-backed rate limiter (5 requests/minute per identifier)
- `GET /api/protected/me` — reference protected route; rejects requests without a `session` cookie (placeholder until real auth, see `middleware.ts`)

All non-GET `/api/*` requests require a matching `X-CSRF-Token` header and `csrf_token` cookie (double-submit pattern, see `middleware.ts`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
