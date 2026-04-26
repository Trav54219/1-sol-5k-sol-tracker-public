# 1 SOL to 5,000 SOL Tracker

React + Convex tracker with WorkOS AuthKit support.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables, the app runs in guest mode and saves progress in `localStorage`.

## Enable Cloud Progress

1. Create/configure a Convex project:

```bash
npm run convex:dev
```

2. Add your WorkOS AuthKit values:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_WORKOS_CLIENT_ID=client_...
VITE_WORKOS_REDIRECT_URI=http://localhost:5173
```

3. Set the WorkOS client ID in Convex so Convex can validate WorkOS JWTs:

```bash
npx convex env set WORKOS_CLIENT_ID client_...
```

4. In WorkOS, add `http://localhost:5173` as an allowed redirect URI.

When signed in, checked days are saved to the Convex `progress` table by authenticated user. Any existing guest progress in the browser is migrated to the account the first time the signed-in account has no saved progress.

This is a client-only Vite app, so AuthKit is configured with `devMode` to store the refresh token in browser storage. For a larger production app, replace this with a custom WorkOS auth domain and cookie-based sessions.

This uses WorkOS AuthKit for login and Convex JWT validation for backend auth. The optional `@convex-dev/workos-authkit` sync/webhook component is not required for progress saving; add it later only if you want Convex to mirror WorkOS user records and handle WorkOS webhook events.
