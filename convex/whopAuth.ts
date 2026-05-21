"use node";

import { WhopServerSdk } from "@whop/api";

export type WhopUserIdentity = {
  userId: string;
  appId: string;
};

function getWhopAppId() {
  return process.env.WHOP_APP_ID?.trim() ?? "";
}

function getWhopApiKey() {
  return process.env.WHOP_API_KEY?.trim() ?? "";
}

export function getWhopSdk() {
  const appApiKey = getWhopApiKey();
  const appId = getWhopAppId();
  if (!appApiKey || !appId) {
    return null;
  }

  return WhopServerSdk({
    appApiKey,
    appId,
  });
}

export async function verifyWhopUserToken(token: string | null | undefined) {
  if (!token) return null;

  const sdk = getWhopSdk();
  if (!sdk) return null;

  try {
    const payload = await sdk.verifyUserToken(token, { dontThrow: true });
    if (!payload?.userId) return null;
    return { userId: payload.userId, appId: payload.appId };
  } catch {
    return null;
  }
}

export function readWhopTokenFromRequest(request: Request) {
  return request.headers.get("x-whop-user-token");
}
