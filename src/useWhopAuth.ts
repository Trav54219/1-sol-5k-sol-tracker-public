import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  clearStoredAuthToken,
  fetchWhopSessionProfile,
  getStoredAuthToken,
  isEmbeddedInWhop,
  setStoredAuthToken,
  type WhopSessionProfile,
} from "./whopSession";

type SignInResult = {
  ok: boolean;
  message: string;
  accessToken?: string;
  userLabel?: string | null;
};

const signInWithLicenseRef = makeFunctionReference<
  "action",
  { licenseKey: string; whopUserId?: string },
  SignInResult
>("auth:signInWithLicense");

export function useWhopAuth() {
  const convexAuth = useConvexAuth();
  const signInWithLicense = useAction(signInWithLicenseRef);
  const [token, setToken] = useState<string | null>(() => getStoredAuthToken());
  const [whopProfile, setWhopProfile] = useState<WhopSessionProfile | null>(null);
  const [whopProfileLoading, setWhopProfileLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setWhopProfileLoading(true);

    void (async () => {
      const profile = await fetchWhopSessionProfile();
      if (!active) return;
      setWhopProfile(profile);
      setWhopProfileLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const fetchAccessToken = useCallback(async () => {
    if (!token) return null;
    return token;
  }, [token]);

  const signIn = useCallback(
    async (licenseKey: string) => {
      const result = await signInWithLicense({
        licenseKey,
        whopUserId: whopProfile?.userId,
      });

      if (result.ok && result.accessToken) {
        setStoredAuthToken(result.accessToken);
        setToken(result.accessToken);
      }

      return result;
    },
    [signInWithLicense, whopProfile?.userId],
  );

  const signOut = useCallback(() => {
    clearStoredAuthToken();
    setToken(null);
  }, []);

  const isLoading = whopProfileLoading || convexAuth.isLoading;
  const isAuthenticated = Boolean(token) && convexAuth.isAuthenticated;

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      userLabel: whopProfile?.userId ?? null,
      whopProfile,
      whopProfileLoading,
      embeddedInWhop: isEmbeddedInWhop(),
      signIn,
      signOut,
      fetchAccessToken,
    }),
    [fetchAccessToken, isAuthenticated, isLoading, signIn, signOut, whopProfile, whopProfileLoading],
  );
}
