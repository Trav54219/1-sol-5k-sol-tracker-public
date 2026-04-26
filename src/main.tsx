import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import App, { getLocalCheckedDays } from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const workosRedirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined;
const authConfigured = Boolean(convexUrl && workosClientId);
const progressApi = {
  get: makeFunctionReference<"query", Record<string, never>, number[]>("progress:get"),
  set: makeFunctionReference<"mutation", { checkedDays: number[] }, null>("progress:set"),
};

function RemoteApp() {
  const auth = useAuth();
  const convexAuth = useConvexAuth();
  const remoteCheckedDays = useQuery(progressApi.get, convexAuth.isAuthenticated ? {} : "skip");
  const setProgress = useMutation(progressApi.set);
  const migratedLocal = useRef(false);

  useEffect(() => {
    if (!convexAuth.isAuthenticated || remoteCheckedDays === undefined || migratedLocal.current) return;

    const localCheckedDays = getLocalCheckedDays();
    if (remoteCheckedDays.length === 0 && localCheckedDays.length > 0) {
      migratedLocal.current = true;
      void setProgress({ checkedDays: localCheckedDays });
    }
  }, [convexAuth.isAuthenticated, remoteCheckedDays, setProgress]);

  const userLabel = auth.user?.email ?? auth.user?.firstName ?? "your account";
  const redirectUri = getWorkOSRedirectUri();

  return (
    <App
      auth={{
        configured: true,
        canSync: convexAuth.isAuthenticated,
        isLoading: auth.isLoading,
        isSignedIn: Boolean(auth.user),
        userLabel,
        signIn: () => auth.signIn({ state: { returnTo: redirectUri } }),
        signOut: () => auth.signOut({ returnTo: redirectUri }),
      }}
      onRemoteChange={
        convexAuth.isAuthenticated
          ? async (checkedDays) => {
              await setProgress({ checkedDays });
            }
          : undefined
      }
      remoteCheckedDays={convexAuth.isAuthenticated ? remoteCheckedDays : undefined}
      remoteLoading={convexAuth.isAuthenticated && remoteCheckedDays === undefined}
    />
  );
}

function Root() {
  if (!authConfigured || !convexUrl || !workosClientId) {
    return <App auth={{ configured: false, canSync: false, isLoading: false, isSignedIn: false, userLabel: null }} />;
  }

  const convex = new ConvexReactClient(convexUrl);
  const redirectUri = getWorkOSRedirectUri();

  return (
    <AuthKitProvider
      clientId={workosClientId}
      devMode
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
  return workosRedirectUri || window.location.origin;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
