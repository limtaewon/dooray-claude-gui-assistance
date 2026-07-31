import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, ExternalLink, Loader2 } from 'lucide-react'
import { Button, Input, Modal } from '../common/ds'

export type SetupStepId = 'dooray' | 'bot' | 'caldav' | 'github'

interface StepState {
  /** 이미 연결돼 있는지 — 다시 켰을 때 다 채워진 화면을 보여준다 */
  done: boolean
  detail?: string
}

/**
 * 처음 켰을 때의 연결 안내.
 *
 * 앱을 깔자마자 보이는 화면이 빈 목록이면 무엇부터 해야 할지 알 수 없다. 필요한 연결을 한 자리에
 * 모아 순서대로 묻되, **전부 건너뛸 수 있다** — 두레이만 쓰는 사람에게 GitHub 토큰을 강요하지 않는다.
 */
function SetupWizard({ onClose }: { onClose: () => void }): JSX.Element {
  const [state, setState] = useState<Record<SetupStepId, StepState>>({
    dooray: { done: false },
    bot: { done: false },
    caldav: { done: false },
    github: { done: false }
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    const [dooray, bot, caldav, github] = await Promise.all([
      window.api.dooray.validateToken().catch(() => null),
      window.api.bot.getConfig().catch(() => null),
      window.api.caldav.status().catch(() => null),
      window.api.github.status().catch(() => null)
    ])
    setState({
      dooray: { done: dooray?.valid === true, detail: dooray?.name },
      bot: { done: Boolean(bot?.domain), detail: bot?.domain },
      caldav: { done: caldav?.connected === true },
      github: {
        done: github?.state === 'connected',
        detail: github?.accounts.find((a) => a.active)?.login ?? github?.accounts[0]?.login
      }
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const finish = (): void => {
    void window.api.settings.set('setupCompleted', true)
    onClose()
  }

  return (
    <Modal open onClose={finish} title="Clauday 시작하기">
      <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-secondary mb-3">
        쓸 것만 연결하면 됩니다. 지금 건너뛰어도 언제든 ⚙ 설정에서 이어서 할 수 있습니다.
        토큰은 모두 OS 키체인에 저장되고 앱 밖으로 나가지 않습니다.
      </p>

      {loading ? (
        <p className="flex items-center justify-center gap-1.5 py-8 text-[calc(11.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          <Loader2 size={12} className="animate-spin" /> 확인 중…
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <DoorayStep state={state.dooray} onDone={refresh} />
          <BotStep state={state.bot} onDone={refresh} />
          <CalDavStep state={state.caldav} />
          <GitHubStep state={state.github} />
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-bg-border">
        <p className="flex-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
          연결이 끝나면 좌측 <strong className="text-text-secondary">온보딩</strong> 에서 기능 안내를 볼 수 있습니다.
        </p>
        <Button variant="primary" size="sm" onClick={finish}>
          시작하기 <ArrowRight size={11} />
        </Button>
      </div>
    </Modal>
  )
}

/** 단계 껍데기 — 제목·설명·완료 표시를 한 모양으로 맞춘다. */
function Step({
  title,
  description,
  state,
  children
}: {
  title: string
  description: string
  state: StepState
  children?: React.ReactNode
}): JSX.Element {
  return (
    <div className="ds-card flat flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-text-primary">
          {title}
        </span>
        {state.done && (
          <span className="ds-chip emerald flex-none">
            <Check size={8} /> {state.detail || '연결됨'}
          </span>
        )}
      </div>
      <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
        {description}
      </p>
      {!state.done && children}
    </div>
  )
}

function DoorayStep({ state, onDone }: { state: StepState; onDone: () => void }): JSX.Element {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.dooray.setToken(token.trim())
      const result = await window.api.dooray.validateToken()
      if (!result.valid) {
        setError(result.error || '토큰이 유효하지 않습니다')
        return
      }
      setToken('')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step
      title="두레이 API 토큰"
      description="업무·위키·캘린더·메신저를 앱에서 보려면 필요합니다. 두레이 → 설정 → API 에서 발급합니다."
      state={state}
    >
      <div className="flex items-center gap-2">
        <Input
          type="password"
          size="sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="두레이 API 토큰"
          className="font-mono"
          aria-label="두레이 API 토큰"
        />
        <Button variant="primary" size="sm" className="flex-none" disabled={busy || !token.trim()} onClick={() => void save()}>
          {busy ? '확인 중…' : '연결'}
        </Button>
      </div>
      {error && <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-c-red-fg">{error}</p>}
    </Step>
  )
}

function BotStep({ state, onDone }: { state: StepState; onDone: () => void }): JSX.Element {
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.bot.setConfig({ domain: domain.trim() })
      setDomain('')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step
      title="두레이 도메인 (실시간 수신)"
      description="메신저 모니터링과 @clauday 봇이 쓰는 WebSocket 연결입니다. 두레이 API 토큰을 그대로 재사용합니다."
      state={state}
    >
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="company.dooray.com"
          className="font-mono"
          aria-label="두레이 도메인"
        />
        <Button variant="primary" size="sm" className="flex-none" disabled={busy || !domain.trim()} onClick={() => void save()}>
          {busy ? '연결 중…' : '연결'}
        </Button>
      </div>
    </Step>
  )
}

function CalDavStep({ state }: { state: StepState }): JSX.Element {
  return (
    <Step
      title="캘린더 (CalDAV)"
      description="일정을 앱에서 보고 바로 고칩니다. 입력할 값이 여러 개라 설정 화면에서 이어서 합니다."
      state={state}
    >
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('goto-settings', { detail: { tab: 'caldav' } }))}
        className="self-start flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-link"
      >
        설정에서 연결하기 <ExternalLink size={10} />
      </button>
    </Step>
  )
}

function GitHubStep({ state }: { state: StepState }): JSX.Element {
  return (
    <Step
      title="GitHub (선택)"
      description="앱이 토큰을 받지 않습니다 — 터미널에서 gh auth login 으로 로그인해 두면 그 계정을 그대로 씁니다."
      state={state}
    >
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('goto-settings', { detail: { tab: 'github' } }))}
        className="self-start flex items-center gap-1 text-[calc(11px_*_var(--app-font-scale,1))] text-link"
      >
        설정에서 상태 확인 <ExternalLink size={10} />
      </button>
    </Step>
  )
}

export default SetupWizard
