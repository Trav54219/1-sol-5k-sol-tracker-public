# 1 SOL to 5,000 SOL Tracker

React + Convex tracker for Whop students. Access uses **Whop account + license key** (no WorkOS).

## Student flow (inside Whop)

1. Open **Software | Sol Tracker** in Whop (must use app URL `https://sol-speedrun-tracker.vercel.app/`).
2. Whop verifies their account automatically.
3. Paste **license key** from the Whop sidebar → **Activate license**.
4. Tracker loads; progress saves to their Whop-linked account.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

In another terminal:

```bash
npm run convex:dev
```

## Convex env vars

```bash
npx convex env set WHOP_API_KEY whop_...
npx convex env set WHOP_APP_ID app_...
```

Generate JWT keys once (RS256):

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
npx convex env set AUTH_JWT_PRIVATE_KEY "$(cat private.pem)"
npx convex env set AUTH_JWT_PUBLIC_KEY "$(cat public.pem)"
```

Local dev without Whop:

```bash
npx convex env set WHOP_ACCESS_BYPASS true
```

## Vercel env vars

- `VITE_CONVEX_URL`
- `VITE_APP_URL` = `https://sol-speedrun-tracker.vercel.app/`
- Update `vercel.json` rewrite destination to your `*.convex.site` URL if different

## Whop software app

- [Install Software app](https://whop.com/apps/app_jHH5YT7jHYQANi/install/) (marketplace template; your developer app ID is separate)
- **Download / app URL:** `https://sol-speedrun-tracker.vercel.app/` only (not `*.authkit.app`)
- See [Whop SaaS docs](https://docs.whop.com/supported-business-models/saas) for license keys and [email login](https://docs.whop.com/supported-business-models/saas#email-login-integration)

## License binding

On activation, Convex calls Whop `validate_license` with metadata `whop_user_id` so each key binds to one Whop user ([license key docs](https://docs.whop.com/supported-business-models/saas#license-key-integration)).
