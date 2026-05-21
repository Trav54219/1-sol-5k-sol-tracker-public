import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import AccessGate from "./AccessGate";
import App, { getLocalProgress, normalizeProgressSnapshot, type ProgressSnapshot } from "./App";
import type { EntitlementStatus } from "./AccessGate";
import {
  consumeWhopEmbedFlag,
  getCanonicalProductionUrl,
  getReturnToUrl,
  isEmbeddedInWhop,
  isLocalOrigin,
  redirectEmbedToCanonical,
  shouldRedirectEmbedToCanonical,
} from "./authRouting";
import { startWorkOSSignIn } from "./workosSignIn";
import "./styles.css";

if (shouldRedirectEmbedToCanonical()) {
  redirectEmbedToCanonical();
}

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const whopMembershipUrl = import.meta.env.VITE_WHOP_MEMBERSHIP_URL as string | undefined;
const authConfigured = Boolean(convexUrl && workosClientId);

const progressApi = {
  get: makeFunctionReference<"query", Record<string, never>, ProgressSnapshot>("progress:get"),
  set: makeFunctionReference<"mutation", ProgressSnapshot, null>("progress:set"),
};

const entitlementApi = {
  getStatus: makeFunctionReference<"query", Record<string, never>, EntitlementStatus>("entitlements:getStatus"),
};

const accessApi = {
  activateLicense: makeFunctionReference<"action", { licenseKey: string }, { ok: boolean; message: string }>(
    "access:activateLicense",
  ),
  refreshAccess: makeFunctionReference<"action", Record<string, never>, { ok: boolean; message: string | null }>(
    "access:refreshAccess",
  ),
};

function RemoteApp() {
  const auth = useAuth();
  const convexAuth = useConvexAuth();
  const entitlement = useQuery(
    entitlementApi.getStatus,
    convexAuth.isAuthenticated ? {} : "skip",
  );
  const remoteProgress = useQuery(
    progressApi.get,
    convexAuth.isAuthenticated && entitlement?.hasAccess ? {} : "skip",
  );
  const setProgress = useMutation(progressApi.set);
  const activateLicense = useAction(accessApi.activateLicense);
  const refreshAccess = useAction(accessApi.refreshAccess);
  const migratedLocal = useRef(false);
  const refreshedAccess = useRef(false);
  const [awaitingWhopReturn] = useState(() => consumeWhopEmbedFlag());

  useEffect(() => {
    if (!convexAuth.isAuthenticated || entitlement === undefined || refreshedAccess.current) return;
    if (!entitlement.configured) return;
    refreshedAccess.current = true;
    void refreshAccess({});
  }, [convexAuth.isAuthenticated, entitlement, refreshAccess]);

  useEffect(() => {
    if (!entitlement?.hasAccess) {
      refreshedAccess.current = false;
    }
  }, [entitlement?.hasAccess]);

  useEffect(() => {
    if (!convexAuth.isAuthenticated || !entitlement?.hasAccess || remoteProgress === undefined || migratedLocal.current) {
      return;
    }

    const localProgress = getLocalProgress();
    const normalizedRemoteProgress = normalizeProgressSnapshot(remoteProgress);
    const mergedProgress: ProgressSnapshot = {
      activePlan: normalizedRemoteProgress.activePlan,
      planHistory: normalizedRemoteProgress.planHistory,
      sol: mergeModeProgress(normalizedRemoteProgress.sol, localProgress.sol),
      usdc: mergeModeProgress(normalizedRemoteProgress.usdc, localProgress.usdc),
    };
    if (!isSameProgress(normalizedRemoteProgress, mergedProgress)) {
      migratedLocal.current = true;
      void setProgress(mergedProgress);
    }
  }, [convexAuth.isAuthenticated, entitlement?.hasAccess, remoteProgress, setProgress]);

  const userLabel = auth.user?.email ?? auth.user?.firstName ?? "your account";
  const signIn = () => startWorkOSSignIn(auth, getReturnToUrl());
  const signOut = () => auth.signOut({ returnTo: getReturnToUrl() });

  return (
    <AccessGate
      auth={{
        isLoading: auth.isLoading,
        isSignedIn: Boolean(auth.user),
        userLabel,
        signIn,
        signOut,
        embeddedInWhop: isEmbeddedInWhop(),
        awaitingWhopReturn,
      }}
      entitlement={entitlement}
      entitlementLoading={convexAuth.isAuthenticated && entitlement === undefined}
      onActivateLicense={async (licenseKey) => activateLicense({ licenseKey })}
      whopMembershipUrl={whopMembershipUrl}
    >
      <App
        auth={{
          configured: true,
          canSync: convexAuth.isAuthenticated && Boolean(entitlement?.hasAccess),
          isLoading: auth.isLoading,
          isSignedIn: Boolean(auth.user),
          userLabel,
          signIn: () => {
            void signIn();
          },
          signOut,
        }}
        onRemoteChange={
          convexAuth.isAuthenticated && entitlement?.hasAccess
            ? async (progress) => {
                await setProgress(progress);
              }
            : undefined
        }
        remoteProgress={convexAuth.isAuthenticated && entitlement?.hasAccess ? remoteProgress : undefined}
        remoteLoading={convexAuth.isAuthenticated && entitlement?.hasAccess && remoteProgress === undefined}
      />
    </AccessGate>
  );
}

function mergeModeProgress(remote: ProgressSnapshot["sol"], local: ProgressSnapshot["sol"]) {
  const shouldUseLocalChecked = remote.checkedDays.length === 0 && local.checkedDays.length > 0;
  return {
    checkedDays: shouldUseLocalChecked ? local.checkedDays : remote.checkedDays,
    completions: Math.max(remote.completions, local.completions),
  };
}

function isSameProgress(left: ProgressSnapshot, right: ProgressSnapshot) {
  return isSameModeProgress(left.sol, right.sol) && isSameModeProgress(left.usdc, right.usdc);
}

function isSameModeProgress(left: ProgressSnapshot["sol"], right: ProgressSnapshot["sol"]) {
  return left.completions === right.completions && left.checkedDays.join(",") === right.checkedDays.join(",");
}

function Root() {
  if (!authConfigured || !convexUrl || !workosClientId) {
    return (
      <AccessGate
        auth={{ isLoading: false, isSignedIn: false, userLabel: null, signIn: () => undefined, signOut: () => undefined }}
        deploymentIssue="Add VITE_CONVEX_URL and VITE_WORKOS_CLIENT_ID in your hosting provider, then redeploy."
        entitlement={undefined}
        entitlementLoading={false}
        onActivateLicense={async () => ({ ok: false, message: "Sign-in is not configured yet." })}
      >
        {null}
      </AccessGate>
    );
  }

  const canonicalUrl = getCanonicalProductionUrl();
  if (shouldRedirectPreviewToCanonical(canonicalUrl)) {
    window.location.replace(`${canonicalUrl.origin}${window.location.pathname}${window.location.search}${window.location.hash}`);
    return null;
  }

  const convex = new ConvexReactClient(convexUrl);
  const redirectUri = getWorkOSRedirectUri();

  return (
    <AuthKitProvider
      clientId={workosClientId}
      devMode={isLocalOrigin()}
      onRedirectCallback={({ state }) => {
        const url = getCanonicalProductionUrl();
        const returnTo = typeof state?.returnTo === "string" ? state.returnTo : null;
        if (returnTo) {
          try {
            if (new URL(returnTo).searchParams.has("whop_embed")) {
              url.searchParams.set("whop_embed", "1");
            }
          } catch {
            // ignore malformed returnTo
          }
        }
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }}
      redirectUri={redirectUri}
    >
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <RemoteApp />
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}

function getWorkOSRedirectUri() {
  if (isLocalOrigin()) return window.location.origin;
  return getCanonicalProductionUrl().origin + "/";
}

function shouldRedirectPreviewToCanonical(canonicalUrl: URL) {
  if (canonicalUrl.origin === window.location.origin) return false;
  return /-trav54219s-projects\.vercel\.app$/i.test(window.location.hostname);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
