Nasiha web app — Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui, Prisma/PostgreSQL, Redis, Clerk.

## Auth (Clerk) setup

Login/logout, sessions, password reset, and email verification are handled by [Clerk](https://dashboard.clerk.com) — there is no self-hosted credential storage. Registration is **not** self-serve: Clerk accounts are only ever created server-side (`lib/clerk-admin.ts`), triggered by admin approval (a later objective) or, for local testing, the script below.

1. Create a Clerk application (or use an existing dev instance) and copy the API keys into `.env` (see `.env.example`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Set `NEXT_PUBLIC_APP_URL` to wherever the app is actually reachable (`http://localhost:3010` for local docker-compose, or your public domain e.g. `https://nasihaforyou.org`) — it's used to build the invitation redirect URL below.
2. **Required manual step — disable public sign-up:** in the Clerk Dashboard, go to **User & Authentication → Restrictions** and enable **Restricted** sign-up mode. This isn't automatable via Clerk's API; it must be set per Clerk project. With this enabled, `/accept-invite` (see below) still works for invited users — Clerk validates the invitation ticket regardless of this setting — but nobody can complete sign-up without one.
3. Register a webhook endpoint in the Clerk Dashboard pointing at `<your-app-url>/api/webhooks/clerk`, subscribed to `user.created`, `user.updated`, `user.deleted`. Copy its signing secret into `.env` as `CLERK_WEBHOOK_SIGNING_SECRET`. (Clerk's servers need a publicly reachable HTTPS URL to deliver this — a reverse proxy such as nginx proxy manager or Caddy fronting your public domain works, or for ad hoc local dev, a tunnel like ngrok.)
4. Provision a test user (stands in for the admin-approval flow):
   ```bash
   npx tsx scripts/create-test-user.ts you@example.com member
   ```
   `lib/clerk-admin.ts` creates this invitation with `notify: false`, so Clerk does **not** email it — Clerk's dev instances cap outbound email at 100/month, shared across every invitation and verification email on the project, and invitation email doesn't need Clerk's template/branding anyway. The script prints the accept-invite URL directly; for the real admin-approval flow, that same URL is emailed via Resend instead (see below). Whoever follows the link to `/accept-invite` sets their own password, and the local `User` row is created by the webhook once they accept.

### Auth routes

- `GET /sign-in` — Clerk's hosted sign-in UI (embedded `<SignIn/>` component), includes forgot-password and email-verification flows built in.
- `GET /accept-invite` — Clerk's hosted invitation-acceptance UI (embedded `<SignUp/>` component, ticket-only). This is where `lib/clerk-admin.ts`'s invitations redirect to set an initial password — it is **not** a public registration page: Clerk's Restricted sign-up mode (step 2 above) rejects anyone who lands here without a valid `__clerk_ticket`, regardless of the component existing.
- `GET /dashboard` — session-protected member page; redirects to `/sign-in` if unauthenticated.
- `GET /admin` — admin-only page; redirects to `/sign-in` if unauthenticated, renders a Forbidden message for non-admins.
- `POST /api/webhooks/clerk` — Clerk → local `User` sync, verified via Svix (exempt from the CSRF check below).

Both `/sign-in` and `/accept-invite` redirect an already-authenticated visitor straight to `/dashboard` rather than rendering the Clerk widget — Clerk's components render blank for a signed-in visitor since there's nothing left for them to do, so without this the page would just look broken.

Every protected route/page does its own server-side check via `requireUser()`/`requireRole()` in `lib/auth.ts` (Clerk session + local role), not just the middleware gate — see the comment in `middleware.ts` for why.

## Payments (Stripe) setup

`/donate` (§4.14) uses [Stripe Checkout](https://dashboard.stripe.com) for one-time and recurring donations. Checkout-session creation (`POST /api/donations`) never touches the database — a `Donation` row is only ever created by the webhook once Stripe confirms the payment actually succeeded.

1. Create a Stripe account (or use an existing one) and copy the **test mode** secret key from [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) into `.env` as `STRIPE_SECRET_KEY`.
2. Register a webhook endpoint pointing at `<your-app-url>/api/webhooks/stripe`, subscribed to `checkout.session.completed`. Copy its signing secret into `.env` as `STRIPE_WEBHOOK_SIGNING_SECRET`.
3. For local dev, instead of a dashboard endpoint, use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events and print a local webhook secret:
   ```bash
   stripe listen --forward-to localhost:3010/api/webhooks/stripe
   ```
4. Test a donation with Stripe's test card `4242 4242 4242 4242`, any future expiry date, any CVC, any ZIP.

### Donation routes

- `GET /donate` — public, no auth required; one-time or monthly giving.
- `POST /api/donations` — creates a Stripe Checkout Session; rate-limited (10 requests/hour/IP), CSRF-protected.
- `POST /api/webhooks/stripe` — Stripe → `Donation` row, verified via Stripe's signature (exempt from the CSRF check below, same rationale as the Clerk webhook).
- `GET /admin/donations`, `GET /api/admin/donations` (add `?export=csv` for a CSV download) — admin-only.

`Donation` has no relation to `ContributionLedger` or `users.tier` anywhere in the schema — donating never confers Knowledge Hours or membership advantage (§4.14).

## Email (Resend) setup

Outbound app email — application-confirmation, approval/welcome (with the account set-up link), event-registration confirmation, and contact-form notifications — goes through [Resend](https://resend.com), not Clerk. All four send functions live in `lib/email.ts`; each is best-effort (logs a warning and skips rather than throwing) if `RESEND_API_KEY` isn't set, so email being unconfigured never blocks the underlying action.

1. Create a Resend account and an API key at [resend.com/api-keys](https://resend.com/api-keys); copy it into `.env` as `RESEND_API_KEY`. Use a **sending-only** scoped key for `.env` — only use a **full access** key temporarily if you need to (re)create/verify a domain via the API, then revoke it once verified.
2. Verify a sending domain under **Domains** in the Resend dashboard. `mail.nasihaforyou.org` is already verified for this project (as a subdomain, not the apex `nasihaforyou.org`, to keep transactional-sender reputation separate from the root domain's own mail/forwarding setup). If it ever needs re-creating (domain transfer, moved DNS provider, etc.), Resend will generate fresh values, but the record *shapes* were:

   | Type | Host | Value | Priority |
   |------|------|-------|----------|
   | TXT | `resend._domainkey.mail` | Resend-provided DKIM public key (`p=...`) | — |
   | MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` | `10` |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — |

   Until a domain is verified, Resend's sandbox mode only delivers to the email address on your own Resend account — every other recipient silently fails, which matters for testing the approval-email flow with a real applicant address.

   **Namecheap-specific gotcha:** the MX record does *not* go in the regular Advanced DNS "Add New Record" dropdown — MX only appears in the separate **Mail Settings** section, and adding one there requires switching Mail Settings from its default to **Custom MX** first. If the domain already has mail forwarding configured through Namecheap's own "Email Forwarding" preset, switching to Custom MX can drop those records — note the existing forwarding config before switching, or add forwarding via a Custom-MX-compatible third-party service (e.g. ImprovMX) instead of Namecheap's native "Email Forwarding" preset, since the two Mail Settings modes are mutually exclusive. The two TXT records aren't affected by this — they go through the normal Host Records "Add New Record" flow regardless of Mail Settings mode.
3. Set `RESEND_FROM_EMAIL` in `.env` to an address on the verified domain (defaults to `NASIHA <no-reply@mail.nasihaforyou.org>` if unset).
4. Resend's free tier covers this project's current volume; check [resend.com/pricing](https://resend.com/pricing) for current limits before assuming they still apply.

## Getting Started (Docker)

From the repo root:

```bash
docker compose up
```

This starts the Next.js app, PostgreSQL, Redis, MinIO, Meilisearch, and the search-index worker together. On startup the app container generates the Prisma client and applies any pending migrations automatically. Once ready, open [http://localhost:3010](http://localhost:3010) (the app container's port 3000 is published as 3010 on the host).

## Getting Started (local, without Docker)

Requires local PostgreSQL and Redis instances. Copy `.env.example` to `.env` and adjust `DATABASE_URL` / `REDIS_URL` if needed, then:

```bash
npm install
npx prisma migrate dev
npm run dev
```

`npm run dev` only runs the Next.js dev server — the search-index worker is expected to run via the docker-compose `worker` service (`docker compose up worker meilisearch`, alongside your local Postgres/Redis). Profile edits won't reach Directory search without it running somewhere; see below.

## Search (Meilisearch)

Directory search (§7.2/§9) is powered by [Meilisearch](https://www.meilisearch.com), matching the docker-compose `meilisearch` service. Profile writes never touch Meilisearch inline in the request path — `PATCH /api/profile`, avatar upload, and avatar delete each enqueue a BullMQ job (`lib/queues/search-index-queue.ts`), and the standalone worker (its own `worker` service in docker-compose, running `scripts/worker.ts`) is what actually reads the DB and updates the `profiles` index. Only profiles with `listInDirectory = true` and a Directory-eligible tier are present in the index.

- `npm run worker` — runs the worker process directly; this is what the docker-compose `worker` service invokes. Configures the index's searchable/filterable attributes on boot.
- `npm run reindex:profiles` — one-off backfill; indexes all currently-eligible profiles. Needed once after standing up Meilisearch for the first time, since existing profiles predate the sync trigger.

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
