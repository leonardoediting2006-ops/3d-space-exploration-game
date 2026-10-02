import { Component, type ReactNode } from 'react';

const AUTOSAVE_KEY = 'keyframe-studio:autosave';

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>{error.message}</p>
        <p className="note">Your project is autosaved in this browser. If the problem comes back after reloading, discard the autosave to start fresh.</p>
        <div className="modal-actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => location.reload()}>Reload</button>
          <button
            className="primary"
            onClick={() => {
              try {
                localStorage.removeItem(AUTOSAVE_KEY);
              } catch {
                /* storage unavailable */
              }
              location.reload();
            }}
          >
            Discard autosave &amp; reload
          </button>
        </div>
      </div>
    );
  }
}
