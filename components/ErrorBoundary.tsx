"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Optional title shown when an error is caught */
  title?: string;
  /** Optional message shown when an error is caught */
  message?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * User-facing error boundary for CSR page sections.
 * Wraps the data-dependent content area so a single failed
 * fetch or render doesn't crash the whole page shell (header + nav stay intact).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="flex flex-col items-center justify-center gap-3 border border-slate-800 bg-slate-950/60 px-6 py-12">
          <p className="text-xs uppercase tracking-[0.18em] text-red-300">页面区域错误</p>
          <p className="max-w-lg text-center text-sm text-slate-400">
            {this.props.message ?? "该区域加载失败，但页面其余部分不受影响。"}
          </p>
          {process.env.NODE_ENV === "development" && this.state.error ? (
            <pre className="max-w-full overflow-auto rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-red-200">
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            className="border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20"
            onClick={() => this.setState({ hasError: false, error: null })}
            type="button"
          >
            重试
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
