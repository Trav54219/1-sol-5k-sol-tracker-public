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
  signIn: () => void | Promise<{ ok: boolean; message?: string; mode?: "tab" | "same-window" }>;
  signOut: () => void | Promise<void>;
  /** True when running inside Whop's iframe (WorkOS must open in the top window). */
  embeddedInWhop?: boolean;
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
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInOpenedTab, setSignInOpenedTab] = useState(false);

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
      <AccessShell step={1} title="Sign in to save your progress">
        <p className="access-lead">
          Use the <strong>same email</strong> you used on Whop. That email is how your tracker progress is stored in the cloud.
        </p>
        <ol className="access-checklist">
          <li>Sign in with your email (one-time)</li>
          <li>Paste your Whop license key from the sidebar on the next screen</li>
        </ol>
        {auth.embeddedInWhop ? (
          <p className="access-hint access-hint--prominent">
            Sign-in opens in a <strong>new tab</strong> (Whop blocks login inside this panel). After you finish, come back to this Whop tab and refresh if needed.
          </p>
        ) : null}
        {signInOpenedTab ? (
          <p className="access-hint access-hint--prominent">
            Sign-in tab opened. Complete login there, then return here and refresh this page.
          </p>
        ) : null}
        <div className="access-actions access-actions--stack">
          <button
            className="access-btn access-btn--primary"
            disabled={signInBusy || auth.isLoading}
            onClick={() => {
              setSignInBusy(true);
              setSignInError(null);
              void Promise.resolve(auth.signIn())
                .then((result) => {
                  if (result && !result.ok) {
                    setSignInError(result.message ?? "Sign-in could not start.");
                    return;
                  }
                  if (result?.mode === "tab") {
                    setSignInOpenedTab(true);
                  }
                })
                .catch(() => {
                  setSignInError("Sign-in could not start. Allow pop-ups and try again.");
                })
                .finally(() => setSignInBusy(false));
            }}
            type="button"
          >
            {signInBusy ? "Opening sign-in…" : "Continue with email"}
          </button>
        </div>
        {signInError ? (
          <p className="access-error" role="alert">
            {signInError}
          </p>
        ) : null}
        <p className="access-footnote">Your license key proves you purchased the course; your email keeps progress tied to you.</p>
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
          <StepPill done={step > 1} active={step === 1} label="Sign in" detail="Your email" />
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
