import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types/update'

const INITIAL: UpdateState = {
  stage: 'idle',
  currentVersion: '',
  latestVersion: null,
  releaseUrl: null,
  progressPercent: 0,
  message: null,
  canInstallInPlace: false
}

export interface AppUpdate {
  state: UpdateState
  /** 사용자에게 무언가 보여줄 게 있는 상태인지 — 평소에는 UI 를 아예 띄우지 않는다 */
  hasNews: boolean
  /** 버튼에 쓸 문구. stage 와 플랫폼에 따라 갈린다 */
  actionLabel: string
  /** 버튼을 눌렀을 때 할 일 */
  act: () => void
  check: () => void
  openReleasePage: () => void
}

/**
 * 앱 업데이트 상태 구독. main 이 시작 직후 한 번 확인하고, 이후 진행 상황을 push 로 보낸다.
 *
 * 버튼 문구가 플랫폼마다 다른 건 의도다 — Windows 는 재시작만으로 설치가 끝나지만
 * macOS 는 dmg 를 열어 사용자가 직접 옮겨야 한다 (ad-hoc 서명이라 자동 설치가 막혀 있음).
 */
export function useAppUpdate(): AppUpdate {
  const [state, setState] = useState<UpdateState>(INITIAL)

  useEffect(() => {
    let alive = true
    window.api.update.check().then((s) => { if (alive) setState(s) }).catch(() => { /* 오프라인이면 조용히 */ })
    const unsubscribe = window.api.update.onStatus(setState)
    return () => { alive = false; unsubscribe() }
  }, [])

  const check = useCallback(() => {
    window.api.update.check().then(setState).catch(() => { /* ok */ })
  }, [])

  const openReleasePage = useCallback(() => {
    void window.api.update.openReleasePage()
  }, [])

  const act = useCallback(() => {
    if (state.stage === 'available' || state.stage === 'error') {
      window.api.update.download().then(setState).catch(() => { /* 상태는 push 로 온다 */ })
      return
    }
    if (state.stage === 'downloaded') void window.api.update.install()
  }, [state.stage])

  const actionLabel = (() => {
    switch (state.stage) {
      case 'available': return `업데이트 ${state.latestVersion ?? ''}`.trim()
      case 'downloading': return `받는 중 ${state.progressPercent}%`
      case 'downloaded': return state.canInstallInPlace ? '재시작하고 설치' : '설치 파일 열기'
      case 'error': return '다시 시도'
      default: return ''
    }
  })()

  return {
    state,
    hasNews: ['available', 'downloading', 'downloaded', 'error'].includes(state.stage),
    actionLabel,
    act,
    check,
    openReleasePage
  }
}
