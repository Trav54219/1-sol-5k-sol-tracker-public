import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export default class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Sol Tracker crashed on boot", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", padding: 32, color: "#111315" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Sol Tracker failed to load</h1>
        <p style={{ color: "#7a8290", marginBottom: 16 }}>
          Open Whop Dev mode → Hosting → confirm Base URL is{" "}
          <strong>https://sol-speedrun-tracker.vercel.app/</strong> (complete URL), click Save, then Reload.
        </p>
        <pre
          style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 8,
            fontSize: 12,
            overflow: "auto",
            padding: 12,
          }}
        >
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
