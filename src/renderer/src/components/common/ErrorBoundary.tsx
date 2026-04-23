import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface State { err: Error | null; info: ErrorInfo | null }

/**
 * 렌더 중 예외가 발생해도 화면이 완전히 비지 않도록 보여주는 경계.
 * DevTools를 안 열어도 사용자에게 에러가 보인다.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { err: null, info: null }

  static getDerivedStateFromError(err: Error): State {
    return { err, info: null }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    this.setState({ err, info })
    console.error('[ErrorBoundary]', this.props.label || '', err, info)
  }

  private reset = (): void => this.setState({ err: null, info: null })

  render(): ReactNode {
    if (this.state.err) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
          <div className="max-w-xl w-full rounded-lg border border-red-500/30 bg-red-500/10 p-5">
            <div className="text-sm font-semibold text-red-400 mb-2">
              ⚠ 화면 렌더 중 문제가 발생했습니다{this.props.label ? ` (${this.props.label})` : ''}
            </div>
            <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-words mb-3"
              style={{ maxHeight: 240, overflow: 'auto' }}>
              {this.state.err.message}
              {'\n\n'}
              {this.state.err.stack?.split('\n').slice(0, 8).join('\n')}
            </pre>
            <button onClick={this.reset}
              className="px-3 py-1.5 rounded-md bg-clover-blue text-white text-xs hover:bg-clover-blue/80">
              다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
