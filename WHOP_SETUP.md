# Whop setup (Sol Tracker)

Your code **is already a Whop app**. It runs at `https://sol-speedrun-tracker.vercel.app/` and connects to Convex. You do **not** need to rewrite the project in Next.js.

## Fix blank white screen (do this first)

1. [Developer dashboard](https://whop.com/dashboard/developer) → **Sol Tracker** → **App details** → **Hosting**
2. **Base URL** must be the **full** URL (not cut off):
   ```
   https://sol-speedrun-tracker.vercel.app/
   ```
3. **Experience path** — either is fine:
   - `/experiences/[experienceId]` (default), or
   - `/` (simpler)
4. Click **Save changes** at the bottom of the page.
5. In Whop, open **Sol Tracker** → **Dev mode** (top right) → **Reload**.

If the iframe still shows only white (no “Loading Sol Tracker…” text), Whop is not loading your URL — fix step 2.

## Install on Breezy Growth

1. https://whop.com/apps/app_fzTPuAf6g5bs9a/install/
2. Install into **Breezy Growth**
3. Open **Sol Tracker** in the sidebar (not the old marketplace “Software | Sol Tracker” unless that one also has the download URL set).

## Secrets (already configured)

| Variable | Where |
|----------|--------|
| `WHOP_API_KEY` | Convex prod only (server) |
| `WHOP_APP_ID` = `app_fzTPuAf6g5bs9a` | Convex prod |
| `VITE_WHOP_APP_ID` | Vercel |
| `VITE_CONVEX_URL` | Vercel |

Do **not** put `WHOP_API_KEY` in Vercel or GitHub.

OAuth **redirect URLs** are not required for iframe + license key auth.

## Student flow

1. Open app inside Whop
2. Whop account detected automatically
3. Paste license key → **Activate license**
4. Progress saves to their Whop-linked account
