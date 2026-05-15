import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { clearAppShellCache, isStaleBundleError, recoverFromStaleBundle } from '../lib/appUpdate'

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

  componentDidCatch(error: Error) {
    void recoverFromStaleBundle(error)
  }

  private async reloadClean() {
    await clearAppShellCache()
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    const staleBundle = isStaleBundleError(this.state.error)

    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-6">
        <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center space-y-5">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-charcoal">Something went wrong</h1>
            <p className="text-sm text-gray-400 mt-1">
              {staleBundle
                ? 'A new app version is ready. Reload to finish updating.'
                : 'Your app account data is safe. Reload the app to reconnect.'}
            </p>
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 rounded-2xl px-4 py-3 font-mono text-left break-words">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => void this.reloadClean()}
            className="inline-flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-black transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload app
          </button>
        </section>
      </main>
    )
  }
}
