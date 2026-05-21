# 1 SOL to 5,000 SOL Tracker

React + Convex tracker for Whop students. Access uses **Whop iframe auth + membership** (no WorkOS, no license key).

## Student flow (inside Whop)

1. Open **Sol Tracker** in Whop (app URL `https://sol-speedrun-tracker.vercel.app/`).
2. Whop verifies their account automatically.
3. Active membership is checked via Whop API (no license key).
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
# Optional if experience id is not in the iframe URL:
npx convex env set WHOP_EXPERIENCE_ID exp_...
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
- See [Whop app docs](https://docs.whop.com/apps) for hosting and iframe auth

## Membership access

On sign-in, Convex calls Whop `checkIfUserHasAccessToExperience` (or access pass / company) for the signed-in `user_...` id. Entitlements are keyed by Whop user + experience (not a pasted license key).
