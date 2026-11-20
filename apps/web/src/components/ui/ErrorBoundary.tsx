import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps a render error from blanking the page; the autosave survives either way. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Catan Night render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="hc-hall hc-scope grid min-h-screen place-items-center p-6">
        <div className="hc-parchment max-w-md px-7 py-6 text-center">
          <h2 className="hc-title text-[36px] text-[color:var(--rubric-dark)]">Something went wrong</h2>
          <p className="mt-2 text-[18px]">Something went wrong while drawing the game. Your progress is saved.</p>
          <pre className="mt-3 max-h-32 overflow-auto text-left text-[13px] text-[color:var(--rubric)]">{this.state.error.message}</pre>
          <div className="mt-4 flex justify-center gap-3">
            <button
              className="hc-btn"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              Main menu
            </button>
            <button className="hc-paper-btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
