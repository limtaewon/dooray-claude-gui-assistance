import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Loader2, RefreshCw, Terminal } from 'lucide-react'
import type { GitHubStatus } from '@shared/types/github'
import { Button } from '../common/ds'

const INSTALL_URL = 'https://cli.github.com'
const LOGIN_HELP_URL = 'https://cli.github.com/manual/gh_auth_login'

/**
 * GitHub 연동 — `gh` CLI 의 상태를 그대로 비춘다.
 *
 * 앱은 토큰을 받지도 보관하지도 않는다. 이미 `gh auth login` 한 사람에게 PAT 를 또 만들라고 하는 건
 * 같은 일을 두 번 시키는 것이고, 앱이 토큰을 들고 있으면 만료·회수 관리 대상이 하나 더 생긴다.
 */
function GitHubSettings(): JSX.Element {
  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const load = useCallback(async (refresh = false): Promise<void> => {
    setChecking(true)
    try {
      setStatus(await window.api.github.status(refresh).catch(() => null))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const recheck = (
    <Button variant="ghost" size="sm" disabled={checking} onClick={() => void load(true)}>
      <RefreshCw size={11} className={checking ? 'animate-spin' : ''} /> 다시 확인
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="ds-card flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-text-primary">
            GitHub CLI (<code className="font-mono">gh</code>)
          </span>
          <StatusChip status={status} checking={checking} />
        </div>

        {status === null ? (
          <p className="flex items-center gap-1.5 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> 확인 중…
          </p>
        ) : status.state === 'not-installed' ? (
          <>
            <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">
              GitHub CLI 가 없습니다. 설치하면 이 앱이 별도 토큰 없이 그 로그인을 그대로 씁니다.
            </p>
            <Command text="brew install gh" />
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(INSTALL_URL, '_blank', 'noreferrer')}
              >
                <ExternalLink size={11} /> 설치 안내 열기
              </Button>
              {recheck}
            </div>
          </>
        ) : status.state === 'not-authenticated' ? (
          <>
            <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary">
              GitHub CLI 는 설치돼 있지만 로그인 전입니다. 터미널에서 아래 명령을 실행하세요.
            </p>
            <Command text="gh auth login" />
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(LOGIN_HELP_URL, '_blank', 'noreferrer')}
              >
                <ExternalLink size={11} /> 로그인 안내
              </Button>
              {recheck}
            </div>
          </>
        ) : (
          <>
            {status.accounts.map((account) => (
              <div
                key={`${account.host}:${account.login}`}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-bg-border bg-bg-surface"
              >
                <Check size={12} className="flex-none mt-0.5 text-c-emerald-fg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-primary">
                      {account.login}
                    </span>
                    <span className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                      {account.host}
                    </span>
                    {account.active && <span className="ds-chip neutral flex-none">활성</span>}
                  </div>
                  {account.scopes.length > 0 && (
                    <p className="mt-0.5 font-mono text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                      {account.scopes.join(', ')}
                    </p>
                  )}
                  {account.envToken && (
                    <p className="mt-1 flex items-start gap-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-c-orange-fg">
                      <AlertTriangle size={10} className="flex-none mt-0.5" />
                      <span>
                        <code>{account.envToken}</code> 환경변수가 키체인 로그인을 가리고 있습니다 —
                        이 상태에서는 <code>gh auth refresh</code> 가 아무 일도 하지 않습니다.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <Command text="gh auth switch" className="flex-1" />
              {recheck}
            </div>
          </>
        )}
      </section>

      <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
        이 앱은 GitHub 토큰을 받지도 보관하지도 않습니다 — <code>gh</code> 의 로그인을 그대로 씁니다.
        터미널의 <code>git</code> 도 각자의 자격증명(SSH 키·credential helper)을 그대로 씁니다.
      </p>
    </div>
  )
}

function StatusChip({ status, checking }: { status: GitHubStatus | null; checking: boolean }): JSX.Element {
  if (checking || status === null) return <span className="ds-chip neutral flex-none">확인 중</span>
  if (status.state === 'connected') {
    return (
      <span className="ds-chip emerald flex-none">
        <Check size={8} /> 연결됨
      </span>
    )
  }
  return (
    <span className="ds-chip orange flex-none">
      {status.state === 'not-installed' ? '설치 안 됨' : '로그인 안 됨'}
    </span>
  )
}

/** 터미널에 그대로 붙여 넣을 명령 — 눌러서 복사한다. */
function Command({ text, className = '' }: { text: string; className?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      title="클릭해서 복사"
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-bg-primary border border-bg-border text-left hover:border-bg-border-strong ${className}`}
    >
      <Terminal size={11} className="flex-none text-text-tertiary" />
      <code className="flex-1 min-w-0 truncate font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary">
        {text}
      </code>
      <span className="flex-none text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary">
        {copied ? '복사됨' : '복사'}
      </span>
    </button>
  )
}

export default GitHubSettings
