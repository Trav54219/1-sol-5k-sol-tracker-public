const productionAppUrl =
  (import.meta.env.VITE_APP_URL as string | undefined) ?? "https://sol-speedrun-tracker.vercel.app";

export function getCanonicalProductionUrl() {
  try {
    return normalizeAppUrl(new URL(productionAppUrl));
  } catch {
    return new URL("https://sol-speedrun-tracker.vercel.app/");
  }
}

export function isLegacyAuthkitEmbedHost() {
  return window.location.hostname.endsWith(".authkit.app");
}

export function shouldRedirectEmbedToCanonical() {
  const canonical = getCanonicalProductionUrl();
  const current = new URL(window.location.href);
  if (current.origin === canonical.origin) return false;
  return isLegacyAuthkitEmbedHost();
}

export function redirectEmbedToCanonical() {
  window.location.replace(getCanonicalProductionUrl().toString());
}

function normalizeAppUrl(url: URL) {
  if (url.pathname === "/" && !url.search && !url.hash) {
    return new URL(`${url.origin}/`);
  }
  return url;
}
