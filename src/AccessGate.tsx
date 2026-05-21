import { useState } from "react";
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

export type AccessAuthState = {
  isLoading: boolean;
  isSignedIn: boolean;
  userLabel: string | null;
  signIn: () => void | Promise<void>;
  signOut: () => void | Promise<void>;
};

type AccessGateProps = {
  auth: AccessAuthState;
  entitlement: EntitlementStatus | undefined;
  entitlementLoading: boolean;
  onActivateLicense: (licenseKey: string) => Promise<{ ok: boolean; message: string }>;
  whopMembershipUrl?: string;
  children: React.ReactNode;
};

export default function AccessGate({
  auth,
  entitlement,
  entitlementLoading,
  onActivateLicense,
  whopMembershipUrl = "https://whop.com/@me/settings/memberships/",
  children,
}: AccessGateProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.isLoading || entitlementLoading) {
    return <AccessShell step={auth.isSignedIn ? 2 : 1} title="Checking access">Loading your session...</AccessShell>;
  }

  if (!entitlement?.configured) {
    return (
      <AccessShell step={1} title="Setup required">
        <p>{entitlement?.message ?? "Configure Convex, WorkOS, and Whop environment variables before students can sign in."}</p>
      </AccessShell>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <AccessShell step={1} title="Sign in to continue">
        <p>This tracker is included with your course purchase. Sign in with the same email you use for WorkOS so your progress stays tied to your account.</p>
        <button className="access-btn" onClick={() => void auth.signIn()} type="button">
          Sign in with WorkOS
        </button>
      </AccessShell>
    );
  }

  const hasAccess = entitlement?.hasAccess ?? false;
  if (!hasAccess) {
    const handleSubmit = async () => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await onActivateLicense(licenseKey);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setLicenseKey("");
      } catch (submitError) {
        console.error(submitError);
        setError("Could not validate your license key. Try again or contact support.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <AccessShell step={2} title="Activate your Whop license">
        <p>
          Signed in as <strong>{auth.userLabel ?? "your account"}</strong>. Paste the license key from your Whop receipt or orders page to unlock the tracker.
        </p>
        <label className="access-label" htmlFor="license-key">
          License key
        </label>
        <input
          autoComplete="off"
          className="access-input"
          id="license-key"
          onChange={(event) => setLicenseKey(event.target.value)}
          placeholder="Paste license key from Whop"
          spellCheck={false}
          value={licenseKey}
        />
        <div className="access-actions">
          <button className="access-btn" disabled={submitting || !licenseKey.trim()} onClick={() => void handleSubmit()} type="button">
            {submitting ? "Validating..." : "Validate license"}
          </button>
          <button className="access-btn secondary" onClick={() => void auth.signOut()} type="button">
            Sign out
          </button>
        </div>
        {entitlement?.message ? <p className="access-hint">{entitlement.message}</p> : null}
        {error ? <p className="access-error">{error}</p> : null}
        <p className="access-footnote">
          Need to renew? Manage your membership on{" "}
          <a href={whopMembershipUrl} rel="noopener noreferrer" target="_blank">
            Whop
          </a>
          .
        </p>
      </AccessShell>
    );
  }

  return <>{children}</>;
}

function AccessShell({
  children,
  step,
  title,
}: {
  children: React.ReactNode;
  step: 1 | 2;
  title: string;
}) {
  return (
    <div className="access-gate">
      <div className="access-panel">
        <div className="access-steps" aria-label="Access steps">
          <span className={step === 1 ? "access-step active" : "access-step done"}>1. WorkOS sign-in</span>
          <span className={step === 2 ? "access-step active" : "access-step"}>2. Whop license</span>
        </div>
        <h1 className="access-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}
