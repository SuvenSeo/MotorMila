import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { spring } from "@/lib/motion";
import { motion } from "motion/react";

type RouteErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

class RouteErrorBoundaryInner extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true, message: null };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ message: error?.message || "Unknown page error" });
    console.error("Route render error", error, errorInfo);
    if (!import.meta.env.VITE_SENTRY_DSN) return;

    void import("@sentry/react")
      .then((Sentry) => {
        Sentry.captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack,
          },
        });
      })
      .catch(() => {
        // Ignore reporting failures so the fallback UI never crashes.
      });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center px-5 py-16 sm:px-6">
        <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <p className="text-caption font-medium text-muted-foreground">Page error</p>
          <h1 className="mt-3 font-display text-title3 font-semibold text-foreground">This page failed to load.</h1>
          <p className="mt-2 text-footnote text-muted-foreground">
            A fresh deploy may have left an old tab cached. Reload to pull the latest app bundle.
          </p>
          {this.state.message ? (
            <p className="mt-3 break-all rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-caption text-muted-foreground">
              {this.state.message}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <motion.button
              type="button"
              onClick={this.handleRetry}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              className="h-9 rounded-2xl bg-primary px-5 text-caption font-semibold text-white"
            >
              Reload page
            </motion.button>
            <Link
              to="/"
              className="h-9 rounded-2xl border border-border px-5 text-caption font-semibold text-foreground no-underline inline-flex items-center"
            >
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

/** Resets the error UI when the route changes so "Back home" is not stuck. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorBoundaryInner resetKey={`${location.pathname}${location.search}`}>
      {children}
    </RouteErrorBoundaryInner>
  );
}
