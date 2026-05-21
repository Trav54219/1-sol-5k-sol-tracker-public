import { isEmbeddedInIframe } from "./workosSignIn";

const workosRedirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined;

export function getCanonicalProductionUrl() {
  if (workosRedirectUri) {
    try {
      return normalizeAppUrl(new URL(workosRedirectUri, window.location.origin));
    } catch {
      // fall through
    }
  }
  return normalizeAppUrl(new URL(window.location.origin));
}

export function isLocalOrigin() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function isLegacyAuthkitEmbedHost() {
  return window.location.hostname.endsWith(".authkit.app");
}

export function hasOAuthCallbackParams() {
  return new URL(window.location.href).searchParams.has("code");
}

/** Whop must embed the Vercel app URL — not *.authkit.app (no session + iframe errors). */
export function shouldRedirectEmbedToCanonical() {
  if (isLocalOrigin() || !workosRedirectUri) return false;

  const canonical = getCanonicalProductionUrl();
  const current = new URL(window.location.href);

  if (current.origin === canonical.origin) return false;

  return isLegacyAuthkitEmbedHost() || (isEmbeddedInIframe() && hasOAuthCallbackParams());
}

export function redirectEmbedToCanonical() {
  const canonical = getCanonicalProductionUrl();
  const current = new URL(window.location.href);
  const target = new URL(canonical);

  for (const key of ["code", "state"]) {
    const value = current.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  if (isEmbeddedInIframe() || isLegacyAuthkitEmbedHost()) {
    target.searchParams.set("whop_embed", "1");
  }

  window.location.replace(target.toString());
}

export function getReturnToUrl() {
  const url = getCanonicalProductionUrl();

  if (isEmbeddedInIframe() || isLegacyAuthkitEmbedHost()) {
    url.searchParams.set("whop_embed", "1");
  }

  return url.toString();
}

export function consumeWhopEmbedFlag() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("whop_embed")) return false;
  url.searchParams.delete("whop_embed");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
  return true;
}

export function isEmbeddedInWhop() {
  try {
    if (window.self === window.top) {
      return new URL(window.location.href).searchParams.has("whop_embed");
    }
    return window.location.ancestorOrigins?.length
      ? Array.from(window.location.ancestorOrigins).some((origin) => origin.includes("whop.com"))
      : document.referrer.includes("whop.com");
  } catch {
    return true;
  }
}

export function normalizeAppUrl(url: URL) {
  if (url.pathname === "/" && !url.search && !url.hash) {
    return new URL(`${url.origin}/`);
  }
  return url;
}
