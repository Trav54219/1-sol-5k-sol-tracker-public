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
const authConfigured = Boolean(convexUrl && workosClientId && workosRedirectUri);
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

  return (
    <App
      auth={{
        configured: true,
        isLoading: auth.isLoading || convexAuth.isLoading,
        isSignedIn: Boolean(auth.user && convexAuth.isAuthenticated),
        userLabel,
        signIn: auth.signIn,
        signOut: auth.signOut,
      }}
      onRemoteChange={async (checkedDays) => {
        await setProgress({ checkedDays });
      }}
      remoteCheckedDays={convexAuth.isAuthenticated ? remoteCheckedDays : undefined}
      remoteLoading={convexAuth.isAuthenticated && remoteCheckedDays === undefined}
    />
  );
}

function Root() {
  if (!authConfigured || !convexUrl || !workosClientId || !workosRedirectUri) {
    return <App auth={{ configured: false, isLoading: false, isSignedIn: false, userLabel: null }} />;
  }

  const convex = new ConvexReactClient(convexUrl);

  return (
    <AuthKitProvider clientId={workosClientId} redirectUri={workosRedirectUri}>
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <RemoteApp />
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
