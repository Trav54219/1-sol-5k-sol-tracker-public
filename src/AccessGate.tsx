import type { useWhopAccess } from "./useWhopAuth";

export type EntitlementStatus = {
  configured: boolean;
  hasAccess: boolean;
  status: "active" | "inactive" | "none";
  membershipId: string | null;
  expiresAt: number | null;
  lastValidatedAt: number | null;
  needsRevalidation: boolean;
  message: string | null;
};

export type AccessAuthState = ReturnType<typeof useWhopAccess>;

type AccessGateProps = {
  auth: AccessAuthState;
  entitlement: EntitlementStatus | undefined;
  entitlementLoading: boolean;
  whopMembershipUrl?: string;
  deploymentIssue?: string | null;
  children: React.ReactNode;
};

export default function AccessGate({
  auth,
  entitlement,
  entitlementLoading,
  whopMembershipUrl = "https://whop.com/@me/settings/memberships/",
  deploymentIssue = null,
  children,
}: AccessGateProps) {
  if (deploymentIssue) {
    return (
      <AccessShell title="App setup incomplete">
        <p className="access-lead">{deploymentIssue}</p>
      </AccessShell>
    );
  }

  if (auth.isLoading || entitlementLoading) {
    return (
      <AccessShell title="Loading">
        <p className="access-lead">
          {auth.activating ? "Verifying your Whop membership…" : "Connecting to Whop and your tracker…"}
        </p>
        <div className="access-loading" aria-hidden="true">
          <span className="access-loading-dot" />
          <span className="access-loading-dot" />
          <span className="access-loading-dot" />
        </div>
      </AccessShell>
    );
  }

  const hasAccess = auth.isAuthenticated && (entitlement?.hasAccess ?? false);

  if (!hasAccess) {
    const whopConnected = Boolean(auth.whopProfile);
    const message =
      auth.activationError ??
      entitlement?.message ??
      (whopConnected
        ? "Your Whop membership could not be verified for this course."
        : "Open this page from your Whop course so we can verify your account.");

    return (
      <AccessShell title="Membership required">
        {auth.embeddedInWhop ? (
          <p className="access-hint access-hint--prominent">
            {whopConnected
              ? "You're signed in to Whop. This tracker unlocks automatically when you have an active membership."
              : "Open this page from your Whop course (Sol Tracker) so we can verify your Whop account."}
          </p>
        ) : (
          <p className="access-lead">Open <strong>Sol Tracker</strong> inside Whop to use this app.</p>
        )}

        {whopConnected ? (
          <p className="access-lead">
            Whop account: <strong>{auth.whopProfile?.userId}</strong>
          </p>
        ) : null}

        <p className="access-error" role="alert">
          {message}
        </p>

        <div className="access-actions">
          <button
            className="access-btn access-btn--primary"
            disabled={auth.activating || (!whopConnected && auth.embeddedInWhop)}
            onClick={() => void auth.activateMembership()}
            type="button"
          >
            {auth.activating ? "Checking…" : "Check membership again"}
          </button>
        </div>

        <p className="access-footnote">
          Manage your plan on{" "}
          <a href={whopMembershipUrl} rel="noopener noreferrer" target="_blank">
            your Whop memberships page
          </a>
          , then click <strong>Check membership again</strong>.
        </p>
      </AccessShell>
    );
  }

  return <>{children}</>;
}

function AccessShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="access-gate">
      <div className="access-panel">
        <header className="access-brand">
          <div className="access-brand-mark">
            <span className="access-brand-dot" aria-hidden="true" />
            <span className="access-brand-kicker">Course access</span>
          </div>
          <p className="access-brand-title">1 SOL → 5000 SOL Speedrun</p>
        </header>

        <h1 className="access-title">{title}</h1>
        <div className="access-body">{children}</div>
      </div>
    </div>
  );
}
