# 1 SOL to 5,000 SOL Tracker

React + Convex tracker with WorkOS sign-in and Whop license-key access control.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables, the app shows a setup screen instead of the tracker.

## Student access flow

1. **WorkOS sign-in** — ties progress to their email/account.
2. **Whop license key** — pasted from their Whop receipt/orders page; validated on the server against Whop.
3. **Tracker** — only loads after both steps succeed.

If their Whop membership expires, the next refresh marks access inactive and they must renew on Whop and re-validate.

## Enable Cloud Progress + Whop

1. Create/configure a Convex project:

```bash
npm run convex:dev
```

2. Add frontend env vars:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_WORKOS_CLIENT_ID=client_...
VITE_WORKOS_REDIRECT_URI=http://localhost:5173
VITE_WHOP_MEMBERSHIP_URL=https://whop.com/@me/settings/memberships/
```

3. Set Convex env vars:

```bash
npx convex env set WORKOS_CLIENT_ID client_...
npx convex env set WHOP_API_KEY whop_...
```

4. In WorkOS, add `http://localhost:5173` as an allowed redirect URI.

5. In Whop (see [SaaS + license keys](https://docs.whop.com/supported-business-models/saas#license-key-integration)):
   - Create your whop and **Software** product with license keys enabled.
   - Add the [Whop Software app](https://whop.com/apps/app_jHH5YT7jHYQANi/install/) to your whop.
   - Create an app and API key with membership validate permissions.
   - Send students your hosted checkout link; they receive a license key after purchase.

### Local dev without Whop

```bash
npx convex env set WHOP_ACCESS_BYPASS true
```

Never enable bypass in production.

## How license binding works

- On activation, Convex calls Whop `POST /api/v2/memberships/{licenseKey}/validate_license` with metadata `workos_subject` so the key binds to one WorkOS account ([Whop docs](https://docs.whop.com/supported-business-models/saas#license-key-integration)).
- Convex stores the membership id and re-checks status on each visit via Whop’s membership API.
- Progress reads/writes require an active entitlement server-side, not only UI gating.

This is a client-only Vite app, so AuthKit uses `devMode` on localhost. Production should use a stable `VITE_WORKOS_REDIRECT_URI` on your canonical domain.
