/**
 * 설정 섹션 셸 — 헤더(제목·설명·구분선) + 카드 본문.
 *
 * 구조는 Orca(https://github.com/stablyai/orca — orca@1.4.162-rc.0,
 * `src/renderer/src/components/settings/SettingsSection.tsx`)를 이식했다.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 섹션별 검색 카탈로그 등록을 없애고(카탈로그는 `settingsNav.ts` 가 소유),
 *   활성 섹션 판정과 검색어를 같은 Provider 에서 내려준다.
 */
import { createContext, useContext, type ReactNode } from 'react'

interface SettingsSectionContextValue {
  activeSectionId: string
  /** 적용된(디바운스 끝난) 검색어 — 행 게이팅에 쓴다 */
  query: string
}

const SettingsSectionContext = createContext<SettingsSectionContextValue>({
  activeSectionId: '',
  query: ''
})

/**
 * 활성 섹션 id 와 검색어를 트리 전체에 내려준다.
 * prop 으로 흘리면 모든 섹션 호출부에 drilling 이 생긴다.
 */
export function SettingsSectionProvider({
  activeSectionId,
  query,
  children
}: SettingsSectionContextValue & { children: ReactNode }): JSX.Element {
  return (
    <SettingsSectionContext.Provider value={{ activeSectionId, query }}>
      {children}
    </SettingsSectionContext.Provider>
  )
}

/** 설정 행이 자기를 숨길지 판단할 때 쓰는 검색어. */
export function useSettingsSearchQuery(): string {
  return useContext(SettingsSectionContext).query
}

interface SettingsSectionProps {
  id: string
  title: ReactNode
  description?: ReactNode
  /** 헤더 오른쪽에 붙는 동작 (가져오기 등) */
  headerAction?: ReactNode
  badge?: ReactNode
  /** 본문을 카드로 감싸지 않는다 — 자체 레이아웃을 가진 패널용 */
  bare?: boolean
  children: ReactNode
}

/**
 * 섹션 하나. **활성 섹션이 아니면 아무것도 렌더하지 않는다** — 설정 패널은 저마다
 * IPC 를 때리므로 전부 마운트하면 설정 진입이 느려진다.
 */
function SettingsSection({
  id,
  title,
  description,
  headerAction,
  badge,
  bare,
  children
}: SettingsSectionProps): JSX.Element | null {
  const { activeSectionId } = useContext(SettingsSectionContext)
  if (activeSectionId !== id) return null

  return (
    <section id={id} data-settings-section={id} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-bg-border pb-5">
        <div className="min-w-0 space-y-2">
          <h2 className="flex flex-wrap items-center gap-2 text-[calc(20px_*_var(--app-font-scale,1))] font-semibold leading-tight text-text-primary">
            {title}
            {badge}
          </h2>
          {description && (
            <p className="max-w-2xl text-[calc(12px_*_var(--app-font-scale,1))] leading-relaxed text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {headerAction && <div className="flex-none">{headerAction}</div>}
      </div>

      {bare ? (
        children
      ) : (
        // 본문을 한 톤 뜬 카드로 감싸 "이 묶음이 이 섹션의 내용" 임을 눈으로 구분한다.
        <div className="rounded-xl border border-bg-border bg-bg-surface px-6 py-5">{children}</div>
      )}
    </section>
  )
}

export default SettingsSection
