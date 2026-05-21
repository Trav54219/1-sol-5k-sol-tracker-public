import { useState } from "react";
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
  const [licenseKey, setLicenseKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deploymentIssue) {
    return (
      <AccessShell step={1} title="App setup incomplete">
        <p className="access-lead">{deploymentIssue}</p>
      </AccessShell>
    );
  }

  if (auth.isLoading || entitlementLoading) {
    return (
      <AccessShell step={1} title="Loading">
        <p className="access-lead">Connecting to Whop and your tracker…</p>
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
    const handleSubmit = async () => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await auth.signIn(licenseKey);
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

    const whopConnected = Boolean(auth.whopProfile);
    const step = whopConnected ? 2 : 1;

    return (
      <AccessShell step={step} title="Activate your tracker">
        {auth.embeddedInWhop ? (
          <p className="access-hint access-hint--prominent">
            {whopConnected
              ? "You're signed in to Whop. Paste your license key below to unlock the tracker."
              : "Open this page from your Whop course (Software | Sol Tracker) so we can verify your Whop account."}
          </p>
        ) : (
          <p className="access-lead">
            Open <strong>Software | Sol Tracker</strong> inside Whop, then paste your license key here.
          </p>
        )}

        {whopConnected ? (
          <p className="access-lead">
            Whop account: <strong>{auth.whopProfile?.userId}</strong>
          </p>
        ) : null}

        <div className="access-field">
          <label className="access-label" htmlFor="license-key">
            Whop license key
          </label>
          <input
            autoComplete="off"
            className="access-input"
            id="license-key"
            onChange={(event) => setLicenseKey(event.target.value)}
            placeholder="Paste key from Whop (sidebar or receipt)"
            spellCheck={false}
            value={licenseKey}
          />
        </div>
        <div className="access-actions">
          <button
            className="access-btn access-btn--primary"
            disabled={submitting || !licenseKey.trim() || (!whopConnected && auth.embeddedInWhop)}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {submitting ? "Validating…" : "Activate license"}
          </button>
        </div>
        {entitlement?.message ? <p className="access-hint">{entitlement.message}</p> : null}
        {error ? <p className="access-error" role="alert">{error}</p> : null}
        <p className="access-footnote">
          Find your key in the Whop sidebar or on{" "}
          <a href={whopMembershipUrl} rel="noopener noreferrer" target="_blank">
            your Whop memberships page
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
        <header className="access-brand">
          <div className="access-brand-mark">
            <span className="access-brand-dot" aria-hidden="true" />
            <span className="access-brand-kicker">Course access</span>
          </div>
          <p className="access-brand-title">1 SOL → 5000 SOL Speedrun</p>
        </header>

        <nav className="access-stepper" aria-label="Access steps">
          <StepPill done={step > 1} active={step === 1} label="Whop" detail="Your account" />
          <span className="access-stepper-line" aria-hidden="true" />
          <StepPill done={false} active={step === 2} label="License" detail="Whop key" />
        </nav>

        <h1 className="access-title">{title}</h1>
        <div className="access-body">{children}</div>
      </div>
    </div>
  );
}

function StepPill({
  active,
  done,
  label,
  detail,
}: {
  active: boolean;
  done: boolean;
  label: string;
  detail: string;
}) {
  const state = done ? "done" : active ? "active" : "upcoming";
  return (
    <div className={`access-step-pill access-step-pill--${state}`}>
      <span className="access-step-pill-label">{label}</span>
      <span className="access-step-pill-detail">{detail}</span>
    </div>
  );
}
