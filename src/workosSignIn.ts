/** WorkOS AuthKit cannot load inside Whop's iframe (X-Frame-Options). */

export function isEmbeddedInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export type SignInResult =
  | { ok: true; mode: "tab" | "same-window" }
  | { ok: false; message: string };

type SignInClient = {
  signIn: (opts?: { state?: { returnTo?: string } }) => Promise<void>;
  getSignInUrl: (opts?: { state?: { returnTo?: string } }) => Promise<string>;
};

export async function startWorkOSSignIn(client: SignInClient, returnTo: string): Promise<SignInResult> {
  const opts = { state: { returnTo } };

  let url: string;
  try {
    url = await client.getSignInUrl(opts);
  } catch (error) {
    console.error(error);
    return { ok: false, message: "Sign-in could not start. Refresh the page and try again." };
  }

  if (!url) {
    return { ok: false, message: "Sign-in is still loading. Wait a second and try again." };
  }

  if (isEmbeddedInIframe()) {
    // Whop embeds us on whop.com — browsers block changing window.top (silent failure).
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      return { ok: true, mode: "tab" };
    }

    try {
      window.location.assign(url);
      return { ok: true, mode: "same-window" };
    } catch (error) {
      console.error(error);
      return {
        ok: false,
        message: "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.",
      };
    }
  }

  await client.signIn(opts);
  return { ok: true, mode: "same-window" };
}
