# Clauday Design System

디자인 시스템은 Clauday의 일관된 사용자 경험을 보장하는 토큰, 컴포넌트, 패턴의 통합 라이브러리입니다. 다크 모드와 라이트 모드를 동시에 지원하며, 접근성과 가독성을 최우선으로 설계되었습니다.

## 철학

### 왜 디자인 시스템이 필요한가

Clauday는 두레이와 Claude Code를 실시간으로 연결하는 데스크톱 앱입니다. 사용자는 메신저, 터미널, 채팅, 캘린더 등 여러 뷰를 빠르게 전환합니다. **일관된 디자인이 없으면 인지 부하가 높아지고 신뢰도가 떨어집니다.**

우리의 디자인 시스템은:
- **신뢰성**: 색상, 크기, 간격 규칙을 따르면 자동으로 전문적이고 일관된 UI가 나옵니다
- **확장성**: 새 기능을 추가할 때마다 디자인을 다시 결정하지 않습니다
- **접근성**: WCAG 표준을 만족하는 색 대비와 포커스 상태를 보장합니다
- **성능**: CSS 변수 기반이므로 라이트/다크 모드 전환이 즉시 반영됩니다

### 설계 원칙

1. **색상 의도**: 색은 기능을 표현합니다
   - 파랑(`--c-blue-*`): 정보, 작업 중
   - 주황(`--c-orange-*`): AI, 액션, 두레이 브랜드
   - 초록(`--c-emerald-*`): 성공, 완료
   - 빨강(`--c-red-*`): 위험, 오류, 과다
   - 노랑(`--c-yellow-*`): 경고
   - 보라(`--c-violet-*`): 멘션, 참고

2. **토큰 계층**: 모든 스타일은 토큰 변수로 표현되며, 직접 색값을 쓰지 않습니다
   - 예: `color: #FF5733` (금지) → `color: var(--c-red-fg)` (권장)
   - 예외: 하드코딩 브랜드 색(주황, 파랑) 또는 아바타 팔레트

3. **모드 안전**: 라이트 모드에서는 밝은 배경에 어두운 텍스트, 다크 모드에서는 그 반대
   - 모든 색 쌍(`*-bg`, `*-fg`)은 두 모드에서 AA 이상 명도 대비 보장

4. **외부 색 신뢰 금지**: 두레이 태그나 캘린더의 색은 직접 사용하지 않고, `color-mix`로 tint를 만들어 통합합니다
   - 이유: 사용자 정의 색상이 모드별 배경과 대비되지 않으면 읽을 수 없습니다

## 시작하기

### 토큰 사용

모든 CSS 변수는 `src/renderer/src/index.css`에서 정의합니다.

```tsx
// 색상
<div style={{ color: 'var(--text-primary)' }}>텍스트</div>
<div style={{ background: 'var(--bg-surface)' }}>배경</div>
<div style={{ borderColor: 'var(--bg-border)' }}>테두리</div>

// 높이와 그림자 (elevation)
<div style={{ boxShadow: 'var(--elev-2)' }}>dropdown</div>

// 포커스 링
<input style={{ boxShadow: 'var(--ring-focus)' }} />

// 타이포그래피
<div className="text-title">제목</div>
<div className="text-body">본문</div>
```

### 컴포넌트 사용

컴포넌트는 `src/renderer/src/components/common/ds/`에 있습니다.

```tsx
import Button from '@/components/common/ds/Button'
import { useToast } from '@/components/common/ds/Toast'
import Modal from '@/components/common/ds/Modal'
import Chip from '@/components/common/ds/Chip'

function MyComponent() {
  const toast = useToast()
  return (
    <div>
      <Button variant="primary" onClick={() => toast.success('완료!')}>
        실행
      </Button>
      <Chip tone="blue">작업 중</Chip>
    </div>
  )
}
```

### 라이트/다크 모드 전환

모드 전환은 `useTheme` 훅으로 합니다. 앱은 자동으로 `[data-theme='light']` 또는 `[data-theme='dark']`를 `<html>` 요소에 적용합니다.

```tsx
import { useTheme } from '@/hooks/useTheme'

function Settings() {
  const { theme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      다크 모드 {theme === 'dark' ? '켜짐' : '꺼짐'}
    </button>
  )
}
```

## 문서 구조

| 문서 | 용도 |
|------|------|
| **[Tokens](tokens.md)** | 모든 CSS 변수: 색상, 배경, 텍스트, elevation, ring, workflow, chart, avatar |
| **[Theming](theming.md)** | 라이트/다크 모드 메커니즘, 가독성 정책, 신규 색 추가 체크리스트 |
| **[Color Policy](color-policy.md)** | 외부 색(두레이 태그, 캘린더) 처리 규칙, color-mix 사용법, 안티패턴 |
| **[Components](#components)** | 개별 컴포넌트: Props, 예제, 접근성 |
| **[Contributing](contributing.md)** | DS 컴포넌트 추가/수정 절차 |

## Components

### Basic

- **[Button](components/Button.md)** — 주 액션(primary, secondary, ghost, danger, ai 등)
- **[Input](components/Input.md)** — 단일/다중 텍스트 입력
- **[Kbd](components/Kbd.md)** — 키보드 단축키 표기
- **[Avatar](components/Avatar.md)** — 사용자 프로필 원형, 이니셜 기반 색상

### Display

- **[Card](components/Card.md)** — 콘텐츠 컨테이너(default, raised, flat)
- **[Chip](components/Chip.md)** — 상태, 태그, 라벨(7색 토닝)
- **[Badge](components/Badge.md)** — 알림 숫자 뱃지
- **[SegTabs](components/SegTabs.md)** — 세그먼티드 탭(단일 선택)

### Feedback

- **[Toast](components/Toast.md)** — 우하단 알림(success, error, warn, ai)
- **[Modal](components/Modal.md)** — 모달/다이얼로그(dismissable, resizable)
- **[CommandPalette](components/CommandPalette.md)** — ⌘K 스타일 커맨드 검색
- **[StateViews](components/StateViews.md)** — EmptyView, LoadingView, ErrorView

### Utility

- **[TimeAgo](components/TimeAgo.md)** — 상대/절대 시간 표기(자동 갱신)

## 최근 변경

- **v2 시맨틱 토큰 추가** (commit a964d5e): elevation, ring, workflow, chart, avatar 토큰 통합
- **라이트 모드 P0 가독성 패치** (commit ddb7af2): 밝은 배경에서 저명도 텍스트 읽기 어려운 문제 해결
- **다크 모드 따뜻한 톤** (commit ddb7af2): 순백 텍스트 → 흐린 흰색으로 눈 피로 감소
- **외부 색 신뢰 안티패턴 제거** (commit 1178230): 두레이 태그·캘린더 색을 직접 쓰지 않고 color-mix로 tint 생성

## 참고

- **설정 파일**: `src/renderer/src/index.css` (토큰 정의), `src/renderer/src/design-system.css` (utility 클래스)
- **컴포넌트 소스**: `src/renderer/src/components/common/ds/*.tsx`
- **전체 지도**: [Project Structure](#) — 디렉터리별 책임 설명
