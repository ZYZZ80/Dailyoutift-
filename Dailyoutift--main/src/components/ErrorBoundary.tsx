import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full text-center space-y-4 animate-scale-in">
          <div className="w-14 h-14 bg-danger-bg rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-danger" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-charcoal">Something went wrong</h1>
            <p className="text-sm text-charcoal-muted mt-1">
              An unexpected error occurred. Your data is safe.
            </p>
          </div>
          <p className="text-xs text-charcoal-muted bg-surface-overlay rounded-xl px-4 py-3 font-mono text-left break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload App
          </button>
        </div>
      </div>
    )
  }
}
