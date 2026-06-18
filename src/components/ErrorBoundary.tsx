import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Inline fallback label. */
  label?: string;
};

type State = { error: Error | null };

/**
 * Catches render errors in a subtree so a transient fault (e.g. a React
 * reconciliation crash from raw-SVG injection) recovers locally instead of
 * white-screening the whole SPA. The fallback offers a one-click remount.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a breadcrumb in the console for debugging; do not rethrow.
    console.error("ErrorBoundary caught:", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-3xl">😵‍💫</div>
          <div className="text-sm font-medium">{this.props.label ?? "Something hiccuped rendering this view."}</div>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary/10 text-primary border border-primary/40 hover:bg-primary/20 text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Reload this view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
