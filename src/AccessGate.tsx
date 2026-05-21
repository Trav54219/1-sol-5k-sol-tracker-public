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
  /** Shown only when the app deployment is missing required env vars (operators). */
  deploymentIssue?: string | null;
  children: React.ReactNode;
};

export default function AccessGate({
  auth,
  entitlement,
  entitlementLoading,
  onActivateLicense,
  whopMembershipUrl = "https://whop.com/@me/settings/memberships/",
  deploymentIssue = null,
  children,
}: AccessGateProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: 1 | 2 = auth.isSignedIn ? 2 : 1;

  if (deploymentIssue) {
    return (
      <AccessShell step={1} title="App setup incomplete">
        <p className="access-lead">{deploymentIssue}</p>
        <p className="access-footnote">Students will see sign-in and license activation once Convex and WorkOS are configured.</p>
      </AccessShell>
    );
  }

  if (auth.isLoading || entitlementLoading) {
    return (
      <AccessShell step={step} title="Checking your access">
        <p className="access-lead">Hang tight while we load your session.</p>
        <div className="access-loading" aria-hidden="true">
          <span className="access-loading-dot" />
          <span className="access-loading-dot" />
          <span className="access-loading-dot" />
        </div>
      </AccessShell>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <AccessShell step={1} title="Sign in to unlock the tracker">
        <p className="access-lead">
          This speedrun tracker is included with your course. Use the same email you purchased with so your progress stays on your account.
        </p>
        <ol className="access-checklist">
          <li>Sign in securely with WorkOS</li>
          <li>Paste your Whop license key on the next screen</li>
        </ol>
        <div className="access-actions access-actions--stack">
          <button className="access-btn access-btn--primary" onClick={() => void auth.signIn()} type="button">
            Continue with WorkOS
          </button>
        </div>
        <p className="access-footnote">No account yet? Use the email from your purchase receipt when prompted.</p>
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
      <AccessShell step={2} title="Activate your license">
        <p className="access-lead">
          Signed in as <strong>{auth.userLabel ?? "your account"}</strong>. Paste the license key from your Whop receipt or orders page to unlock the tracker.
        </p>
        <div className="access-field">
          <label className="access-label" htmlFor="license-key">
            Whop license key
          </label>
          <input
            autoComplete="off"
            className="access-input"
            id="license-key"
            onChange={(event) => setLicenseKey(event.target.value)}
            placeholder="e.g. mem_xxxxxxxx or key from your receipt"
            spellCheck={false}
            value={licenseKey}
          />
        </div>
        <div className="access-actions">
          <button
            className="access-btn access-btn--primary"
            disabled={submitting || !licenseKey.trim()}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {submitting ? "Validating…" : "Activate license"}
          </button>
          <button className="access-btn access-btn--ghost" onClick={() => void auth.signOut()} type="button">
            Sign out
          </button>
        </div>
        {entitlement?.message ? <p className="access-hint">{entitlement.message}</p> : null}
        {error ? <p className="access-error" role="alert">{error}</p> : null}
        <p className="access-footnote">
          Find your key in your Whop purchase email or on{" "}
          <a href={whopMembershipUrl} rel="noopener noreferrer" target="_blank">
            your Whop memberships page
          </a>
          . Need to renew? Manage billing there.
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
          <StepPill done={step > 1} active={step === 1} label="Sign in" detail="WorkOS" />
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
