const AUTH_TOKEN_STORAGE_KEY = "sol_tracker_convex_token";

export function getConvexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");

  const cloudUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!cloudUrl) return null;
  return cloudUrl.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

export function getStoredAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAuthToken(token: string) {
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken() {
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function isEmbeddedInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isEmbeddedInWhop() {
  try {
    if (window.self === window.top) return false;
    return window.location.ancestorOrigins?.length
      ? Array.from(window.location.ancestorOrigins).some((origin) => origin.includes("whop.com"))
      : document.referrer.includes("whop.com");
  } catch {
    return true;
  }
}

export type WhopSessionProfile = {
  userId: string;
  appId: string;
};

export async function fetchWhopSessionProfile() {
  try {
    const response = await fetch("/api/whop/session", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: boolean; userId?: string; appId?: string };
    if (!body.ok || !body.userId || !body.appId) return null;
    return { userId: body.userId, appId: body.appId };
  } catch {
    return null;
  }
}
