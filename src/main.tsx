import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import AccessGate from "./AccessGate";
import App, { getLocalProgress, normalizeProgressSnapshot, type ProgressSnapshot } from "./App";
import type { EntitlementStatus } from "./AccessGate";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const workosRedirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined;
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

  return (
    <AccessGate
      auth={{
        isLoading: auth.isLoading,
        isSignedIn: Boolean(auth.user),
        userLabel,
        signIn: () => auth.signIn({ state: { returnTo: getReturnToUrl() } }),
        signOut: () => auth.signOut({ returnTo: window.location.origin }),
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
          signIn: () => auth.signIn({ state: { returnTo: getReturnToUrl() } }),
          signOut: () => auth.signOut({ returnTo: window.location.origin }),
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

  const canonicalUrl = getCanonicalAppUrl();
  if (canonicalUrl && shouldRedirectToCanonical(canonicalUrl)) {
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
        const returnTo = typeof state?.returnTo === "string" ? state.returnTo : null;
        if (!returnTo) return;

        const target = new URL(returnTo, redirectUri);
        if (target.origin === window.location.origin) {
          window.history.replaceState({}, "", `${target.pathname}${target.search}${target.hash}`);
        } else {
          window.location.assign(target.toString());
        }
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
  if (!workosRedirectUri) return window.location.origin;

  try {
    return normalizeRedirectUri(new URL(workosRedirectUri, window.location.origin));
  } catch {
    // Fall back to the current origin if the env var is malformed.
  }

  return window.location.origin;
}

function getCanonicalAppUrl() {
  if (isLocalOrigin() || !workosRedirectUri) return null;

  try {
    return new URL(workosRedirectUri, window.location.origin);
  } catch {
    return null;
  }
}

function shouldRedirectToCanonical(canonicalUrl: URL) {
  if (canonicalUrl.origin === window.location.origin) return false;

  const currentHost = window.location.hostname;
  const canonicalHost = canonicalUrl.hostname;
  return currentHost.endsWith(".vercel.app") && canonicalHost.endsWith(".vercel.app");
}

function normalizeRedirectUri(url: URL) {
  if (url.pathname === "/" && !url.search && !url.hash) {
    return url.origin;
  }

  return url.toString();
}

function isLocalOrigin() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getReturnToUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  return url.toString();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
