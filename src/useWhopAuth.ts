import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  clearStoredAuthToken,
  fetchWhopSessionProfile,
  getExperienceIdFromPath,
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

const signInWithWhopRef = makeFunctionReference<
  "action",
  { whopUserId: string; experienceId?: string },
  SignInResult
>("auth:signInWithWhop");

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
  const signInWithWhop = useAction(signInWithWhopRef);
  const [whopProfile, setWhopProfile] = useState<WhopSessionProfile | null>(null);
  const [whopProfileLoading, setWhopProfileLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const activationAttempted = useRef(false);

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

  const activateMembership = useCallback(async () => {
    if (!whopProfile?.userId) {
      return { ok: false, message: "Open this app from Whop so we can verify your account." };
    }

    setActivating(true);
    setActivationError(null);

    try {
      const result = await signInWithWhop({
        whopUserId: whopProfile.userId,
        experienceId: getExperienceIdFromPath() ?? undefined,
      });

      if (result.ok && result.accessToken) {
        setStoredAuthToken(result.accessToken);
        notifyTokenChanged();
      } else if (!result.ok) {
        setActivationError(result.message);
      }

      return result;
    } catch (error) {
      console.error(error);
      const message = "Could not verify your Whop membership. Try reloading the page.";
      setActivationError(message);
      return { ok: false, message };
    } finally {
      setActivating(false);
    }
  }, [signInWithWhop, whopProfile?.userId]);

  useEffect(() => {
    if (whopProfileLoading || !whopProfile?.userId || convexAuth.isAuthenticated) return;
    if (activationAttempted.current) return;
    activationAttempted.current = true;
    void activateMembership();
  }, [activateMembership, convexAuth.isAuthenticated, whopProfile?.userId, whopProfileLoading]);

  const signOut = useCallback(() => {
    clearStoredAuthToken();
    activationAttempted.current = false;
    notifyTokenChanged();
  }, []);

  const isLoading = whopProfileLoading || activating || convexAuth.isLoading;
  const isAuthenticated = convexAuth.isAuthenticated;

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      activating,
      activationError,
      userLabel: whopProfile?.userId ?? null,
      whopProfile,
      whopProfileLoading,
      embeddedInWhop: isEmbeddedInWhop(),
      activateMembership,
      signOut,
    }),
    [
      activateMembership,
      activating,
      activationError,
      isAuthenticated,
      isLoading,
      signOut,
      whopProfile,
      whopProfileLoading,
    ],
  );
}
