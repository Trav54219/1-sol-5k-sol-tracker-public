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
  getSignInUrl: (opts?: { state?: { returnTo?: string } }) => Promise<string>;
};

async function resolveSignInUrl(
  client: SignInClient,
  returnTo: string,
  attempts = 8,
): Promise<string> {
  const opts = { state: { returnTo } };
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const url = await client.getSignInUrl(opts);
      if (url) return url;
    } catch (error) {
      lastError = error;
      console.error("getSignInUrl failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
  }

  if (lastError) {
    throw lastError;
  }

  return "";
}

export async function prefetchSignInUrl(client: SignInClient, returnTo: string) {
  try {
    return await resolveSignInUrl(client, returnTo, 12);
  } catch {
    return "";
  }
}

export async function startWorkOSSignIn(client: SignInClient, returnTo: string): Promise<SignInResult> {
  let url: string;
  try {
    url = await resolveSignInUrl(client, returnTo);
  } catch {
    return { ok: false, message: "Sign-in could not start. Refresh the page and try again." };
  }

  if (!url) {
    return {
      ok: false,
      message: "Sign-in is still loading. Wait a moment and try again, or refresh the page.",
    };
  }

  if (isEmbeddedInIframe()) {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      return { ok: true, mode: "tab" };
    }
  }

  window.location.href = url;
  return { ok: true, mode: "same-window" };
}
