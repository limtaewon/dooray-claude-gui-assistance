import { useEffect, useState } from 'react'
import { Zap, Loader2, AlertCircle, Check, X } from 'lucide-react'

interface BotStatus {
  state: string
  lastError: string | null
  ready: boolean
}

/**
 * 모니터링 사이드바 헤더에 박힌 Socket Mode 인디케이터 + inline 도메인 설정.
 * 클릭 시 도메인 입력 popover가 펼쳐진다.
 *
 * 도메인이 비어있고 토큰도 없으면: ⚪ 회색, "도메인 설정"
 * 연결 시도 중: 🔵 spinner, CONNECTING
 * 활성: 🟢 ACTIVE
 * 대기: 🟠 STANDBY (다른 세션이 잡고있음)
 * 에러: 🔴 + lastError
 */
export default function SocketModeBadge(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [domainDraft, setDomainDraft] = useState('')
  const [hasApiToken, setHasApiToken] = useState<boolean | null>(null)
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let unsub: (() => void) | undefined
    void (async () => {
      try {
        const [cfg, st, token] = await Promise.all([
          window.api.bot.getConfig().catch(() => ({ domain: '' })),
          window.api.bot.getStatus().catch(() => ({ state: 'DISCONNECTED', lastError: null, ready: false })),
          window.api.dooray.getToken().catch(() => null)
        ])
        setDomain(cfg.domain || '')
        setDomainDraft(cfg.domain || '')
        setStatus(st)
        setHasApiToken(!!token)
      } catch (err) {
        console.warn('[SocketModeBadge] init 실패:', err)
      }
    })()
    try {
      unsub = window.api.bot.onStateUpdate((s) => setStatus(s))
    } catch (err) {
      console.warn('[SocketModeBadge] onStateUpdate 등록 실패:', err)
    }
    return () => { if (unsub) unsub() }
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.api.bot.setConfig({ domain: domainDraft.trim() })
      setStatus(next)
      setDomain(domainDraft.trim())
      if (domainDraft.trim()) setOpen(false)
    } finally { setSaving(false) }
  }

  const clear = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.bot.setConfig({ domain: '' })
      setDomain('')
      setDomainDraft('')
      setStatus(await window.api.bot.getStatus())
    } finally { setSaving(false) }
  }

  const state = status?.state || 'DISCONNECTED'
  const isActive = state === 'ACTIVE'
  const isConnecting = state === 'CONNECTING'
  const isStandby = state === 'STANDBY'

  const tone = isActive
    ? { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'ACTIVE', desc: '실시간 push 수신 중' }
    : isConnecting
      ? { dot: 'bg-clover-blue animate-pulse', text: 'text-clover-blue', label: 'CONNECTING', desc: '연결 중...' }
      : isStandby
        ? { dot: 'bg-amber-400', text: 'text-amber-400', label: 'STANDBY', desc: '다른 세션 활성 — 대기 중' }
        : !domain
          ? { dot: 'bg-text-tertiary/40', text: 'text-text-tertiary', label: '폴링만', desc: '도메인 설정 시 실시간 모드' }
          : { dot: 'bg-red-400', text: 'text-red-400', label: '연결 안 됨', desc: status?.lastError || '에러' }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] hover:bg-bg-surface-hover transition-colors"
        title={tone.desc}
      >
        <Zap size={11} className="text-clover-orange flex-none" />
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        <span className={`font-semibold ${tone.text}`}>{tone.label}</span>
        {domain && (
          <span className="font-mono text-text-tertiary truncate flex-1 text-left">
            {domain}
          </span>
        )}
        {!domain && (
          <span className="text-text-tertiary flex-1 text-left">두레이 도메인 설정</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute z-40 mt-1 w-[300px] p-3 rounded-lg shadow-2xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Zap size={11} className="text-clover-orange" />
                Socket Mode (실시간 모드)
              </h4>
              <button onClick={() => setOpen(false)}
                className="text-text-tertiary hover:text-text-primary">
                <X size={12} />
              </button>
            </div>

            <p className="text-[10px] text-text-tertiary leading-relaxed mb-2">
              두레이 도메인을 입력하면 WebSocket으로 메시지를 실시간 수신합니다 (폴링 누락 0).
              두레이 API 토큰을 그대로 재사용해요.
            </p>

            {hasApiToken === false && (
              <div className="p-2 mb-2 rounded text-[10px] flex items-start gap-1.5"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                <AlertCircle size={11} className="flex-none mt-0.5" />
                <span>먼저 Settings → 두레이 연결에서 API 토큰을 등록하세요</span>
              </div>
            )}

            {/* 상태 */}
            <div className="px-2 py-1.5 mb-2 rounded text-[10px] flex items-center gap-1.5"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}>
              {isActive && <><Check size={10} className="text-emerald-400" /><span className="text-emerald-400 font-semibold">ACTIVE</span></>}
              {isConnecting && <><Loader2 size={10} className="text-clover-blue animate-spin" /><span className="text-clover-blue font-semibold">CONNECTING</span></>}
              {isStandby && <><AlertCircle size={10} className="text-amber-400" /><span className="text-amber-400 font-semibold">STANDBY</span></>}
              {!isActive && !isConnecting && !isStandby && (
                <><span className="w-1.5 h-1.5 rounded-full bg-text-tertiary/40" /><span className="text-text-tertiary">DISCONNECTED</span></>
              )}
              <span className="text-text-tertiary ml-auto">{tone.desc}</span>
            </div>

            {status?.lastError && (
              <div className="p-2 mb-2 rounded text-[10px] text-red-400"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                {status.lastError}
              </div>
            )}

            {/* 도메인 입력 */}
            <label className="text-[10px] font-medium text-text-secondary block mb-1">
              두레이 도메인
            </label>
            <input
              type="text"
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') { e.preventDefault(); void save() }
              }}
              placeholder="company.dooray.com"
              className="w-full px-2 py-1.5 rounded text-[11px] font-mono text-text-primary placeholder-text-tertiary focus:outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-border)' }}
            />

            <div className="flex items-center gap-1.5 mt-2">
              <button onClick={save} disabled={saving || !hasApiToken}
                className="flex-1 px-2 py-1 rounded text-[10px] font-semibold text-white bg-clover-orange hover:bg-clover-orange/80 disabled:opacity-40">
                {saving ? '연결 중...' : domain ? '재연결' : '연결'}
              </button>
              {domain && (
                <button onClick={clear} disabled={saving}
                  className="px-2 py-1 rounded text-[10px] text-red-400 hover:bg-red-500/10">
                  비활성화
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
