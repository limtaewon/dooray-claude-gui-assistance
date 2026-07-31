import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, ExternalLink, Github, Loader2 } from 'lucide-react'
import type { GitHubStatus } from '@shared/types/github'
import { Button, Input, useToast } from '../common/ds'

const TOKEN_HELP_URL = 'https://github.com/settings/tokens'

/**
 * GitHub 계정 연결.
 *
 * **이미 `gh` 로 로그인돼 있으면 그것을 그대로 쓴다** — CLI 로 로그인한 사람에게 토큰을 또 만들라고
 * 하는 건 같은 일을 두 번 시키는 것이다. `gh` 가 없을 때만 개인 액세스 토큰을 받는다.
 * 토큰은 OS 키체인에만 두고 화면에는 다시 내려주지 않는다.
 */
function GitHubSettings(): JSX.Element {
  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const load = useCallback(async (refresh = false): Promise<void> => {
    setStatus(await window.api.github.status(refresh).catch(() => ({ connected: false })))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.github.connect(token)
      setStatus(next)
      if (next.connected) {
        setToken('')
        toast.success('GitHub 연결됨', next.account?.login)
      } else {
        toast.error('연결하지 못했습니다', next.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.github.disconnect()
      setStatus({ connected: false })
      toast.success('연결을 해제했습니다')
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account

  return (
    <div className="flex flex-col gap-4">
      <section className="ds-card flex flex-col gap-3">
        {status === null ? (
          <p className="flex items-center gap-1.5 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> 확인 중…
          </p>
        ) : account ? (
          <div className="flex items-center gap-3">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="w-9 h-9 rounded-full flex-none" />
            ) : (
              <Github size={18} className="flex-none text-text-tertiary" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[calc(13px_*_var(--app-font-scale,1))] font-medium text-text-primary truncate">
                  {account.login}
                </span>
                <span className="ds-chip emerald flex-none">
                  <Check size={8} /> {status?.source === 'gh' ? 'gh 로그인' : '토큰 연결됨'}
                </span>
              </div>
              {account.name && (
                <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                  {account.name}
                </p>
              )}
            </div>
            <a
              href={account.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-link flex-none"
            >
              프로필 <ExternalLink size={10} />
            </a>
            {status?.source === 'gh' ? (
              <Button variant="ghost" size="sm" onClick={() => void load(true)}>
                다시 확인
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
                연결 해제
              </Button>
            )}
          </div>
        ) : (
          <>
            {status.hasStoredToken && status.error && (
              <p className="flex items-start gap-1.5 text-[calc(11px_*_var(--app-font-scale,1))] text-c-orange-fg">
                <AlertCircle size={12} className="flex-none mt-0.5" />
                저장된 토큰이 더 이상 유효하지 않습니다 — {status.error}. 새 토큰을 넣어주세요.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="password"
                size="sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && token.trim()) void connect()
                }}
                placeholder="ghp_… 또는 github_pat_…"
                className="font-mono"
                aria-label="GitHub 개인 액세스 토큰"
              />
              <Button
                variant="primary"
                size="sm"
                className="flex-none"
                disabled={busy || !token.trim()}
                onClick={() => void connect()}
              >
                {busy ? '확인 중…' : '연결'}
              </Button>
            </div>
            <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              터미널에서 <code>gh auth login</code> 으로 로그인해 두면 토큰 없이 그대로 잡힙니다.{' '}
              <button onClick={() => void load(true)} className="text-link">
                다시 확인
              </button>
            </p>
            <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
              직접 넣으려면{' '}
              <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer" className="text-link">
                GitHub → Settings → Developer settings → Personal access tokens
              </a>{' '}
              에서 만듭니다. 비공개 저장소를 다루려면 <code>repo</code> 권한이 필요합니다.
            </p>
          </>
        )}
      </section>

      <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
        {status?.source === 'gh'
          ? 'GitHub CLI(gh)의 로그인을 그대로 씁니다 — 앱이 토큰을 따로 보관하지 않습니다.'
          : '토큰은 OS 키체인에만 저장되고 앱 밖으로 나가지 않습니다.'}{' '}
        터미널의 <code>git</code> 은 이 값이 아니라 각자의 자격증명(SSH 키·credential helper)을 그대로 씁니다.
      </p>
    </div>
  )
}

export default GitHubSettings
