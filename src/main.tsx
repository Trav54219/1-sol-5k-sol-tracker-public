import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import { makeFunctionReference } from "convex/server";
import AccessGate from "./AccessGate";
import App, { getLocalProgress, normalizeProgressSnapshot, type ProgressSnapshot } from "./App";
import type { EntitlementStatus } from "./AccessGate";
import { useWhopAuth } from "./useWhopAuth";
import { redirectEmbedToCanonical, shouldRedirectEmbedToCanonical } from "./authRouting";
import "./styles.css";

if (shouldRedirectEmbedToCanonical()) {
  redirectEmbedToCanonical();
}

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const whopMembershipUrl = import.meta.env.VITE_WHOP_MEMBERSHIP_URL as string | undefined;
const authConfigured = Boolean(convexUrl);

const progressApi = {
  get: makeFunctionReference<"query", Record<string, never>, ProgressSnapshot>("progress:get"),
  set: makeFunctionReference<"mutation", ProgressSnapshot, null>("progress:set"),
};

const entitlementApi = {
  getStatus: makeFunctionReference<"query", Record<string, never>, EntitlementStatus>("entitlements:getStatus"),
};

const accessApi = {
  refreshAccess: makeFunctionReference<"action", Record<string, never>, { ok: boolean; message: string | null }>(
    "access:refreshAccess",
  ),
};

function RemoteApp({ auth }: { auth: ReturnType<typeof useWhopAuth> }) {
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

  return (
    <AccessGate
      auth={auth}
      entitlement={entitlement}
      entitlementLoading={convexAuth.isAuthenticated && entitlement === undefined}
      whopMembershipUrl={whopMembershipUrl}
    >
      <App
        auth={{
          configured: true,
          canSync: convexAuth.isAuthenticated && Boolean(entitlement?.hasAccess),
          isLoading: auth.isLoading,
          isSignedIn: auth.isAuthenticated,
          userLabel: auth.userLabel,
          signOut: auth.signOut,
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
  if (!authConfigured || !convexUrl) {
    return (
      <AccessGate
        auth={{
          isLoading: false,
          isAuthenticated: false,
          userLabel: null,
          whopProfile: null,
          whopProfileLoading: false,
          embeddedInWhop: false,
          signIn: async () => ({ ok: false, message: "Convex is not configured." }),
          signOut: () => undefined,
          fetchAccessToken: async () => null,
        }}
        deploymentIssue="Add VITE_CONVEX_URL in Vercel, then redeploy."
        entitlement={undefined}
        entitlementLoading={false}
        whopMembershipUrl={whopMembershipUrl}
      >
        {null}
      </AccessGate>
    );
  }

  const convex = new ConvexReactClient(convexUrl);

  return <AuthenticatedApp convex={convex} />;
}

function AuthenticatedApp({ convex }: { convex: ConvexReactClient }) {
  const auth = useWhopAuth();

  return (
    <ConvexProviderWithAuth
      client={convex}
      useAuth={() => ({
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated,
        fetchAccessToken: auth.fetchAccessToken,
      })}
    >
      <RemoteApp auth={auth} />
    </ConvexProviderWithAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
