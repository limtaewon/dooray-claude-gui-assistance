import { useState, useEffect } from 'react'
import { KeyRound, ArrowRight, ExternalLink, XCircle, CheckCircle2 } from 'lucide-react'

interface DooraySetupProps {
  onConfigured: () => void
}

function DooraySetup({ onConfigured }: DooraySetupProps): JSX.Element {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    const checkExisting = async (): Promise<void> => {
      try {
        const existing = await window.api.dooray.getToken()
        if (!existing) return

        const result = await window.api.dooray.validateToken()
        if (result.valid) {
          onConfigured()
          return
        }

        // 인증 실패(401/403)일 때만 토큰 폐기. 그 외(네트워크/타임아웃/429/5xx)는 유지 — 사용자가 다시 로그인할 필요 없게.
        const msg = result.error || ''
        const isAuthFailure = /\b(401|403)\b/.test(msg)
        if (isAuthFailure) {
          await window.api.dooray.deleteToken()
        } else {
          // 서버/네트워크 이슈로 추정 — 토큰은 키체인에 남기고, 일단 대시보드 진입. 이후 개별 API 호출이 실제 상태를 드러냄.
          console.warn('[DooraySetup] validate failed but keeping token (non-auth error):', msg)
          onConfigured()
        }
      } catch (err) {
        console.warn('[DooraySetup] token check threw:', err)
      } finally {
        setChecking(false)
      }
    }
    checkExisting()
  }, [onConfigured])

  const handleSave = async (): Promise<void> => {
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    setUserName(null)
    try {
      await window.api.dooray.setToken(token.trim())
      // 실제 API 호출로 토큰 유효성 검증
      const result = await window.api.dooray.validateToken()
      if (result.valid) {
        setUserName(result.name || null)
        // 잠시 이름을 보여주고 이동
        setTimeout(() => onConfigured(), 800)
      } else {
        await window.api.dooray.deleteToken()
        setError(result.error || '유효하지 않은 토큰입니다. 토큰을 다시 확인해 주세요.')
      }
    } catch (err) {
      setError('토큰 저장에 실패했습니다.')
      console.error('토큰 저장 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const openTokenPage = (): void => {
    window.open('https://nhnent.dooray.com/member/apiKey', '_blank')
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-sm">
        설정 확인 중...
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-[420px] bg-bg-surface border border-bg-border rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-clover-blue/10 flex items-center justify-center">
            <KeyRound size={20} className="text-clover-blue" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">두레이 연결 설정</h2>
            <p className="text-xs text-text-secondary">개인 API 토큰으로 연결합니다</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* 토큰 발급 안내 */}
          <div className="bg-bg-primary border border-bg-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-text-primary">API 토큰 발급 방법</p>
            <ol className="text-[11px] text-text-secondary space-y-1 list-decimal list-inside">
              <li>두레이 우측 상단 프로필 → 설정</li>
              <li>보안 탭 → "개인 API 토큰" 섹션</li>
              <li>토큰 생성 후 복사</li>
            </ol>
            <button
              onClick={openTokenPage}
              className="flex items-center gap-1.5 text-[11px] text-clover-blue hover:text-clover-blue/80 transition-colors"
            >
              <ExternalLink size={11} />
              두레이 토큰 설정 페이지 열기
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">API 토큰</label>
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(null) }}
              placeholder="두레이 개인 API 토큰 입력"
              className="w-full px-3 py-2.5 bg-bg-primary border border-bg-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-clover-blue"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* 상태 메시지 */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <XCircle size={12} />
              {error}
            </div>
          )}
          {userName && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 size={12} />
              {userName}님으로 연결되었습니다
            </div>
          )}

          <p className="text-[10px] text-text-secondary leading-relaxed">
            토큰은 macOS 키체인에 안전하게 저장됩니다.
          </p>

          <button
            onClick={handleSave}
            disabled={!token.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-clover-blue text-white text-sm font-medium hover:bg-clover-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              '연결 중...'
            ) : (
              <>
                두레이 연결
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DooraySetup
