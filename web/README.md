Nasiha web app — Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui, Prisma/PostgreSQL, Redis, Clerk.

## Auth (Clerk) setup

Login/logout, sessions, password reset, and email verification are handled by [Clerk](https://dashboard.clerk.com) — there is no self-hosted credential storage. Registration is **not** self-serve: Clerk accounts are only ever created server-side (`lib/clerk-admin.ts`), triggered by admin approval (a later objective) or, for local testing, the script below.

1. Create a Clerk application (or use an existing dev instance) and copy the API keys into `.env` (see `.env.example`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
2. **Required manual step — disable public sign-up:** in the Clerk Dashboard, go to **User & Authentication → Restrictions** and enable **Restricted** sign-up mode. This isn't automatable via Clerk's API; it must be set per Clerk project. Without this, Clerk's hosted sign-up UI would accept self-registration.
3. Register a webhook endpoint in the Clerk Dashboard pointing at `<your-app-url>/api/webhooks/clerk`, subscribed to `user.created`, `user.updated`, `user.deleted`. Copy its signing secret into `.env` as `CLERK_WEBHOOK_SIGNING_SECRET`. (For local dev, use the Clerk CLI or a tunnel like ngrok to receive webhooks.)
4. Provision a test user (stands in for the admin-approval flow, which doesn't exist yet):
   ```bash
   npx tsx scripts/create-test-user.ts you@example.com member
   ```
   This sends a Clerk invitation email; the recipient sets their own password via Clerk's hosted flow, and the local `User` row is created by the webhook once they accept.

### Auth routes

- `GET /sign-in` — Clerk's hosted sign-in UI (embedded `<SignIn/>` component), includes forgot-password and email-verification flows built in. There is no `/sign-up` route anywhere in this app.
- `GET /dashboard` — session-protected member page; redirects to `/sign-in` if unauthenticated.
- `GET /admin` — admin-only page; redirects to `/sign-in` if unauthenticated, renders a Forbidden message for non-admins.
- `POST /api/webhooks/clerk` — Clerk → local `User` sync, verified via Svix (exempt from the CSRF check below).

Every protected route/page does its own server-side check via `requireUser()`/`requireRole()` in `lib/auth.ts` (Clerk session + local role), not just the middleware gate — see the comment in `middleware.ts` for why.

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
- `GET /api/protected/me` — reference protected route; 401 without a valid Clerk session, else the caller's local user record
- `GET /api/admin/ping` — reference admin-only route; 401 unauthenticated, 403 non-admin, 200 for admins

All non-GET `/api/*` requests require a matching `X-CSRF-Token` header and `csrf_token` cookie (double-submit pattern, see `middleware.ts`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
