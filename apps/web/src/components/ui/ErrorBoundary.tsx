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
      <div className="grid min-h-screen place-items-center p-6">
        <div className="panel rivets max-w-md px-6 py-5 text-center">
          <h2 className="font-display text-[20px] uppercase tracking-[0.16em] text-gold">Something went wrong</h2>
          <p className="mt-2 text-muted">Something went wrong while drawing the game. Your progress is saved.</p>
          <pre className="mt-3 max-h-32 overflow-auto text-left text-[12px] text-ember">{this.state.error.message}</pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              Main menu
            </button>
            <button className="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
