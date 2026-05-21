/** WorkOS AuthKit cannot load inside Whop's iframe (X-Frame-Options). Break out to the top window. */

export function isEmbeddedInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

type SignInClient = {
  signIn: (opts?: { state?: { returnTo?: string } }) => Promise<void>;
  getSignInUrl: (opts?: { state?: { returnTo?: string } }) => Promise<string>;
};

export async function startWorkOSSignIn(client: SignInClient, returnTo: string) {
  const opts = { state: { returnTo } };

  if (isEmbeddedInIframe()) {
    const url = await client.getSignInUrl(opts);
    const target = window.top ?? window;
    target.location.assign(url);
    return;
  }

  await client.signIn(opts);
}
