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

1. **Email sign-in (WorkOS)** — ties cloud progress to their email. Required even inside Whop; login opens in the **top window** because WorkOS cannot run inside Whop's iframe.
2. **Whop license key** — pasted from their Whop receipt, orders page, or the license key panel in Whop; validated server-side.
3. **Tracker** — only loads after both steps succeed.

### Whop embed (Software app)

Whop loads your app in an iframe. WorkOS AuthKit blocks iframe embedding (`refused to connect`). This repo breaks out to the top window for sign-in and returns users to the embed URL afterward.

In the **WorkOS dashboard**, add every URL where the app runs as an allowed redirect, for example:

- `https://sol-speedrun-tracker.vercel.app`
- Your Whop software host if different (e.g. `https://….authkit.app`)

Set the Whop software **download / app URL** to **`https://sol-speedrun-tracker.vercel.app/`** only — do **not** use a `*.authkit.app` link (that causes “refused to connect” and a sign-in loop).

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
