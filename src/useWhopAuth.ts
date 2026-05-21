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

const TOKEN_CHANGED_EVENT = "sol-tracker-token-changed";

function notifyTokenChanged() {
  window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
}

/** Passed to ConvexProviderWithAuth — must not call useConvexAuth. */
export function useWhopAuthForConvex() {
  const [token, setToken] = useState<string | null>(() => getStoredAuthToken());
  const [whopProfileLoading, setWhopProfileLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setWhopProfileLoading(true);

    void (async () => {
      await fetchWhopSessionProfile();
      if (!active) return;
      setWhopProfileLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncToken = () => setToken(getStoredAuthToken());
    window.addEventListener(TOKEN_CHANGED_EVENT, syncToken);
    window.addEventListener("storage", syncToken);
    return () => {
      window.removeEventListener(TOKEN_CHANGED_EVENT, syncToken);
      window.removeEventListener("storage", syncToken);
    };
  }, []);

  const fetchAccessToken = useCallback(async () => {
    return getStoredAuthToken();
  }, []);

  return useMemo(
    () => ({
      isLoading: whopProfileLoading,
      isAuthenticated: Boolean(token),
      fetchAccessToken,
    }),
    [fetchAccessToken, token, whopProfileLoading],
  );
}

/** UI auth state — call only inside ConvexProviderWithAuth. */
export function useWhopAccess() {
  const convexAuth = useConvexAuth();
  const signInWithLicense = useAction(signInWithLicenseRef);
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

  const signIn = useCallback(
    async (licenseKey: string) => {
      const result = await signInWithLicense({
        licenseKey,
        whopUserId: whopProfile?.userId,
      });

      if (result.ok && result.accessToken) {
        setStoredAuthToken(result.accessToken);
        notifyTokenChanged();
      }

      return result;
    },
    [signInWithLicense, whopProfile?.userId],
  );

  const signOut = useCallback(() => {
    clearStoredAuthToken();
    notifyTokenChanged();
  }, []);

  const isLoading = whopProfileLoading || convexAuth.isLoading;
  const isAuthenticated = convexAuth.isAuthenticated;

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
    }),
    [isAuthenticated, isLoading, signIn, signOut, whopProfile, whopProfileLoading],
  );
}
