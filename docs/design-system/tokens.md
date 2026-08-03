# Design System Tokens

> 기준 버전: **v2.0.4**. 값은 `src/renderer/src/index.css` 가 원본이고 이 문서가 사본이다.
> 토큰을 고치면 이 문서도 같은 커밋에서 고친다 — 문서가 뒤처지면 문서를 따라 만든 화면이
> 옛 색으로 되돌아간다.

모든 스타일은 CSS 변수(tokens)로 정의하며 색값을 직접 하드코딩하지 않습니다.

## 1급 규칙

이 넷은 다른 모든 항목보다 우선한다.

1. **크롬은 무채색이다.** 배경·테두리·일반 텍스트·폼 포커스·탭·아이콘 버튼은 `--bg-*` / `--text-*` 만
   쓴다. 이 정책은 **두 테마에 똑같이** 적용된다 — 한쪽 테마에만 있으면 정책이 아니라 예외다.
2. **색은 "정보가 있다"는 신호일 때만 쓴다.** 카운트 배지, 상태 칩, 링크, 파괴적 동작, 도메인
   진입점. 장식색이 늘면 진짜 신호가 묻힌다. 새 컴포넌트를 만들 때 자문할 것 —
   *"이 색이 사라지면 사용자가 잃는 정보가 있는가?"* 없으면 무채색이 정답이다.
3. **어두운 면끼리는 밝기로 위계를 못 만든다.** 영역 구분은 테두리, 부상은 그림자, 선택은 면 +
   좌측 레일이 담당한다. ([배경 및 표면](#배경-및-표면-background--surface))
4. **조판 하한은 11px, 대비 하한은 AA(4.5:1)** — 두 테마 모두. 작은 글씨와 낮은 대비는 곱해진다.

가드 테스트가 1·3·4 를 강제한다: `palette.guard.test.ts`, `contrast.guard.test.ts`,
`typeScale.guard.test.ts`, `cssVarAlpha.guard.test.ts`.

## 색상 (Color)

### 브랜드 색 (Brand)

| 토큰 | 라이트 | 다크 | 설명 |
|------|--------|------|------|
| `--clauday-orange` | #EA580C | — | 두레이 브랜드 원색 |
| `--clauday-blue` | #2563EB | — | Claude 브랜드 원색 |
| `--brand-claude` | #EA580C | #FB923C | Claude 도메인 식별색 |
| `--brand-dooray` | #2563EB | #60A5FA | 두레이 도메인 식별색 |
| `--brand-terminal` | #16A34A | #4ADE80 | 터미널 도메인 식별색 |
| `--brand-claude-bg` | #FCEADA | rgba(251,146,60,0.16) | Claude tint 배경 |
| `--brand-dooray-bg` | #E1EBFC | rgba(96,165,250,0.16) | 두레이 tint 배경 |
| `--brand-terminal-bg` | #DCFCE7 | rgba(74,222,128,0.16) | 터미널 tint 배경 |

**도메인 식별색은 뷰 안까지 이어진다.** 사이드바에서 파란 항목을 눌렀으면 그 뷰의 대표 아이콘도
파랑이다. 단 뷰 안의 **범용 크롬 액션(새로고침·닫기·설정)에는 도메인색을 주지 않는다.**

⚠️ `--clauday-blue` / `--clauday-orange` 로 매핑된 Tailwind 유틸(`text-clauday-blue` 등)은
다크에서 **회색으로 중성화된 크롬 토큰**이다(이름과 달리 파랑·주황이 아니다). 새 코드에서는 쓰지 말고
`bg-*` / `text-*` 또는 `brand-*` 를 쓴다.

```tsx
<Server className="text-brand-claude" />        {/* MCP = Claude 도메인 */}
<span className="bg-brand-dooray-bg text-brand-dooray">두레이</span>
```

### 다크 무채색 크롬 (v2.0)

다크에서 accent 계열은 전부 회색조가 된다. 상태 칩(`--c-*`)·워크플로(`--wf-*`)·링크(`--link`)·
AI 그라디언트는 그대로 유색으로 남는다.

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--accent-blue` | #2563EB | #76767C | 내비·탭·테두리 — 다크에서 무채색 |
| `--accent-blue-fg` | #1E3A8A | #C9C9CF | 그 위 텍스트 |
| `--btn-primary-bg` | (남색 그라디언트) | #E9E9EC | **주 버튼** — 검정 캔버스에서 유일하게 튀는 면 |
| `--btn-primary-fg` | #E2E8F0 | #101012 | 주 버튼 전경 |
| `--badge-bg` | #EA580C | #EAB308 | 알림 배지 — "읽지 않은 것이 있다"는 정보 |
| `--badge-fg` | #FFFFFF | #1A1400 | 배지 전경 |

주 액션에 완료색(emerald)을 쓰지 않는다 — 워크플로 칩 「완료」와 같은 색이라 실행 버튼이
완료 상태처럼 읽힌다. `Button` 의 `success` variant 는 v2.0.4 에서 제거했다.

### 시맨틱 색 (Semantic — 모드 무관)

기능을 표현하는 색입니다. 모드별로 자동 조정되지 않으므로 대신 semantic 별칭을 사용하세요.

| 토큰 | 값 | 사용 |
|------|-----|------|
| `--success` | #22C55E | 성공 상태, 완료 |
| `--warning` | #FBBF24 | 경고 |
| `--danger` | #EF4444 | 위험, 오류 |
| `--info` | #3B82F6 | 정보 |
| `--mention` | #A78BFA | @멘션, 참고 |

```tsx
// 대신 semantic 별칭 사용:
<div style={{ color: 'var(--c-red-fg)' }}>오류</div>
```

### Semantic 색 쌍 (Mode-aware)

각 색은 **배경(`*-bg`), 전경(`*-fg`), 단색(`*-solid`)** 3가지 형태로 존재합니다. 라이트/다크 모드에서 자동 조정됩니다.

#### Blue (정보, 작업 중)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-blue-bg` | #E1EBFC | rgba(59,130,246,0.22) | 배경 tint |
| `--c-blue-fg` | #1D4ED8 | #A9C9FF | 전경 텍스트 |
| `--c-blue-solid` | #2563EB | #3B82F6 | 단색(버튼, 선) |

```tsx
<Chip tone="blue">작업 중</Chip>  // bg/fg 자동 사용
<Button variant="primary">실행</Button>  // solid 사용
```

#### Orange (AI, 액션, 두레이)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-orange-bg` | #FCEADA | rgba(251,146,60,0.18) | 배경 tint |
| `--c-orange-fg` | #B45309 | #FDBA74 | 전경 텍스트 |
| `--c-orange-solid` | #EA580C | #FB923C | 단색 |

#### Red (위험, 오류)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-red-bg` | #FCE5E5 | rgba(248,113,113,0.18) | 배경 tint |
| `--c-red-fg` | #B91C1C | #FCA5A5 | 전경 텍스트 |
| `--c-red-solid` | #DC2626 | #F87171 | 단색 |

```tsx
<Chip tone="red">오류</Chip>
<Button variant="danger">삭제</Button>
```

#### Emerald (성공, 완료)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-emerald-bg` | #DCFCE7 | rgba(52,211,153,0.18) | 배경 tint |
| `--c-emerald-fg` | #15803D | #7EE2B8 | 전경 텍스트 |
| `--c-emerald-solid` | #16A34A | #34D399 | 단색 |

#### Violet (멘션, 참고)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-violet-bg` | #EDE9FE | rgba(167,139,250,0.18) | 배경 tint |
| `--c-violet-fg` | #5B21B6 | #C4B5FD | 전경 텍스트 |
| `--c-violet-solid` | #7C3AED | #A78BFA | 단색 |

#### Yellow (경고)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-yellow-bg` | #FEF3C7 | rgba(250,204,21,0.16) | 배경 tint |
| `--c-yellow-fg` | #92400E | #FDE68A | 전경 텍스트 |
| `--c-yellow-solid` | #CA8A04 | #EAB308 | 단색 |

#### Neutral (기본)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-neutral-bg` | #EEF0F4 | rgba(255,255,255,0.07) | 배경 tint |
| `--c-neutral-fg` | #525A6B | #A8A8B0 | 전경 텍스트 |
| `--c-neutral-solid` | #8A91A0 | #66666E | 단색 |

### 배경 및 표면 (Background & Surface)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--bg-sidebar` | #ECEEF2 | #1C1C1C | 사이드바 배경 |
| `--bg-base` | #F4F5F8 | #121212 | 앱 캔버스(primary) — 가장 어두움 |
| `--bg-surface` | #FFFFFF | #1E1E1E | 패널, 카드 |
| `--bg-surface-raised` | #FFFFFF | #282828 | 모달, 팝오버 |
| `--bg-surface-hover` | #EAECF0 | #262626 | 호버 — 미묘하게만 |
| `--bg-hover` | #EAECF0 | #262626 | 호버(별칭) |
| `--bg-active` | #DDE0E6 | #333333 | **선택 확정** — 내비·탭의 활성 면 |
| `--bg-subtle` | #EEF0F4 | #1A1A1A | 미묘한 배경 |
| `--bg-border` | #DDE0E6 | #3A3A3A | 테두리, 분할선 |
| `--bg-border-light` | #C5C9D2 | #4A4A4A | 부상 표면의 밝은 테두리 |
| `--bg-border-strong` | #A4ABB8 | #5A5A5A | 강한 테두리 |
| `--terminal-bg` | — | #202429 | 터미널 자체 표면 |
| `--terminal-fg` | — | #E8E8EA | 터미널 전경 |

**어두운 면끼리는 밝기로 위계를 못 만든다.** `--bg-base` 와 `--bg-surface` 의 대비는 1.12:1 에
불과하다 — 이 값을 더 벌리려 하지 말고 아래 셋으로 위계를 옮긴다.

| 표현하려는 것 | 쓰는 것 |
|---|---|
| 영역 구분(카드가 카드로 보이기) | `--bg-border` (표면 위 1.5:1) |
| 부상(모달·팝오버가 떠 보이기) | `--elev-2` 그림자 + `--bg-border-light` |
| 선택 확정 | `--bg-active` 면 + 좌측 3px 레일(`.ds-rail`) |

`v2.0.3` 에서는 `--bg-surface-hover` 와 `--bg-surface-raised` 가 같은 값(#242424)이라
"커서가 어디 있는지"와 "팝오버가 떠 있는지"가 같은 회색 한 톤이었다. 세 값은 반드시 서로 달라야
하고, `src/renderer/src/hooks/contrast.guard.test.ts` 가 이를 강제한다.

```tsx
<div className="bg-bg-surface border border-bg-border">카드</div>
<div className="bg-bg-surface-raised border border-bg-border-light shadow-[var(--elev-2)]">팝오버</div>
<div className="bg-bg-active text-text-primary ds-rail">선택된 항목</div>
```

### 텍스트 색 (Text)

3단계 계층으로 정보 계층을 표현합니다.

| 토큰 | 라이트 | 다크 | 표면 위 대비 | 용도 |
|------|--------|------|------|------|
| `--text-primary` | #161A22 | #F2F2F2 | 13.7:1 | 제목, 본문 |
| `--text-secondary` | #525A6B | #A0A0A0 | 5.9:1 | 서브텍스트, 보조 정보 |
| `--text-tertiary` | #64748B | #8A8A8A | 4.8:1 | 구분점, 비활성 아이콘 |
| `--text-disabled` | #B0B6C2 | #6A6A6A | — | 비활성 상태 텍스트 |

**tertiary 는 "읽어야 하는 값"에 쓰지 않는다.** AA(4.5:1)는 넘지만 하한에 붙어 있어서
작은 글씨와 곱해지면 실질적으로 안 읽힌다. 값·라벨·본문은 secondary 이상으로 올리고,
tertiary 는 구분점(`·`)이나 비활성 아이콘 같은 장식에만 쓴다.

`v2.0.3` 의 다크 tertiary 는 #6E6E6E(3.4:1)로 AA 미달인 채 캡션·placeholder·필드 라벨에
전부 걸려 있었다. 라이트도 #8A91A0 로 캔버스 위 4.46:1 이라 아슬아슬했다.
대비 하한은 테마마다 따로 두지 않는다 — `contrast.guard.test.ts` 가 다크 3단을 검사한다.

```tsx
<h2 className="text-text-primary">제목</h2>
<p className="text-text-secondary">보조 정보</p>
<span className="text-text-tertiary">·</span>
```

## 배치 및 구조 (Layout)

### 간격 (Spacing)

4px 베이스 모듈 시스템입니다.

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--space-0-5` | 2px | 마이크로 간격 |
| `--space-1` | 4px | 아이콘 gap, 타이트 간격 |
| `--space-1-5` | 6px | 작은 갭 |
| `--space-2` | 8px | 기본 gap, padding |
| `--space-2-5` | 10px | 모달 헤더/바디 padding |
| `--space-3` | 12px | 섹션 갭 |
| `--space-4` | 16px | 큰 간격 |
| `--space-5` | 20px | 매우 큰 간격 |
| `--space-6` | 24px | 섹션 간격 |
| `--space-8` | 32px | 페이지 간격 |
| `--space-10` | 40px | 메인 컨테이너 |
| `--space-12` | 48px | 대형 스페이싱 |

### 모서리 반경 (Border Radius)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--radius-xs` | 4px | 뱃지, 칩 |
| `--radius-sm` | 6px | 버튼, 입력(작음) |
| `--radius-md` | 8px | 카드, 버튼, 입력(기본) |
| `--radius-lg` | 12px | 모달, 컨테이너 |
| `--radius-xl` | 16px | 대형 UI |
| `--radius-full` | 9999px | 원형(아바타, 칩) |

```tsx
<div style={{ borderRadius: 'var(--radius-md)' }}>
  카드
</div>
```

## 고도 및 그림자 (Elevation)

카드, 팝오버, 모달의 깊이를 표현합니다.

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--elev-0` | none | none | 그림자 없음 |
| `--elev-1` | 0 1px 2px rgba(17,24,39,0.05) | 0 1px 2px rgba(0,0,0,0.30) | 카드, 타일 |
| `--elev-2` | 0 4px 14px rgba(17,24,39,0.07) | 0 4px 14px rgba(0,0,0,0.36) | 드롭다운, 팝오버 |
| `--elev-3` | 0 12px 40px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.06) | 0 10px 24px rgba(0,0,0,0.45) | 모달, 커맨드 팔레트 |

```tsx
<Card style={{ boxShadow: 'var(--elev-1)' }} variant="raised">
  내용
</Card>
<Modal>높은 elevation</Modal>
```

## 포커스 및 선택 (Focus & Rings)

키보드 네비게이션과 선택 상태를 표현합니다.

### Focus Ring (포커스 상태)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--ring-focus-color` | #2563EB | #E9E9EC | 포커스 링 색 (불투명) |
| `--ring-focus` | 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--ring-focus-color) | 동일 | 포커스 링(input, button) |

**반투명 링을 쓰지 않는다.** `rgba(255,255,255,0.22)` 는 어두운 면 위에서 실효 대비가 1.6:1 로,
비텍스트 요구치(3:1)에 한참 못 미친다. 표면색 2px 를 안쪽에 끼워 오프셋을 만들고 그 바깥에
불투명 링을 두르면 13.7:1 이 나오며, 밝은 주 버튼 위에서도 링이 묻히지 않는다.

**포커스 표시를 없애는 예외는 없다.** `v2.0.3` 의 `.ds-btn.ai` 는 그라디언트를 지키려고
`outline: none` 을 명시해서 각 화면의 유일한 AI 주 액션이 키보드로 안 보였다.

```tsx
<input className="ds-input" />           {/* :focus 에서 자동 적용 */}
<button className="ds-btn ai">생성</button>  {/* :focus-visible 에서 같은 링 */}
```

### Error Ring (오류 상태)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--ring-error-color` | #DC2626 | #F87171 | 오류 링 색 (불투명) |
| `--ring-error` | 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--ring-error-color) | 동일 | 오류 상태 |

### Selected Ring (선택 상태)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--ring-selected-color` | rgba(234,88,12,0.65) | rgba(251,146,60,0.75) | 선택 링 색 |
| `--ring-selected` | 0 0 0 2px var(--ring-selected-color) | 0 0 0 2px var(--ring-selected-color) | 선택 상태(리스트 아이템) |

## 워크플로우 상태 (Workflow)

두레이의 작업 상태를 시각적으로 표현합니다. 각 상태는 배경(`*-bg`), 전경(`*-fg`), 도트(`*-dot`)를 포함합니다.

| 상태 | 라이트 bg | 라이트 fg | 다크 bg | 다크 fg | 용도 |
|------|-----------|-----------|---------|---------|------|
| `--wf-backlog-*` | neutral-bg | neutral-fg | neutral-bg | neutral-fg | 백로그 |
| `--wf-registered-*` | orange-bg | orange-fg | orange-bg | orange-fg | 등록됨 |
| `--wf-working-*` | blue-bg | blue-fg | blue-bg | blue-fg | 작업 중 |
| `--wf-resolved-*` | emerald-bg | emerald-fg | emerald-bg | emerald-fg | 해결됨 |
| `--wf-closed-*` | #E5E7EB | #6B7280 | rgba(...,0.10) | #6B7180 | 종료됨 |
| `--wf-overdue-*` | red-bg | red-fg | red-bg | red-fg | 기한 초과 |

```tsx
<Chip
  tone="blue"
  style={{
    background: 'var(--wf-working-bg)',
    color: 'var(--wf-working-fg)'
  }}
>
  작업 중
</Chip>
```

## 차트 (Chart)

그래프와 시각화에 사용되는 색상입니다.

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--chart-1` | #2563EB | #60A5FA | 시리즈 1 |
| `--chart-2` | #EA580C | #FB923C | 시리즈 2 |
| `--chart-3` | #16A34A | #4ADE80 | 시리즈 3 |
| `--chart-4` | #7C3AED | #C4B5FD | 시리즈 4 |
| `--chart-5` | #DC2626 | #FCA5A5 | 시리즈 5 |
| `--chart-6` | #CA8A04 | #FDE68A | 시리즈 6 |
| `--chart-grid` | #E2E8F0 | #2D3148 | 그리드선 |
| `--chart-tick` | #64748B | #94A3B8 | 눈금 텍스트 |
| `--chart-axis` | #CBD5E1 | #4A4A4A | 축 |
| `--chart-tooltip-bg` | #FFFFFF | #1C1F2E | 툴팁 배경 |
| `--chart-tooltip-border` | #DCE3ED | #2D3148 | 툴팁 테두리 |
| `--chart-tooltip-text` | #0F172A | #F1F5F9 | 툴팁 텍스트 |
| `--chart-area-opacity` | 0.12 | 0.20 | 영역 그래프 투명도 |

## 아바타 (Avatar)

사용자별 프로필 색상. 8가지 배색(bg/fg 쌍)이 있습니다.

| 토큰 | 라이트 bg | 라이트 fg | 다크 bg | 다크 fg |
|------|-----------|-----------|---------|---------|
| `--avatar-1-*` | #E1EBFC | #1D4ED8 | rgba(96,...) | #93C5FD |
| `--avatar-2-*` | #FCE5E5 | #B91C1C | rgba(248,...) | #FCA5A5 |
| `--avatar-3-*` | #DCFCE7 | #15803D | rgba(74,...) | #86EFAC |
| `--avatar-4-*` | #FEF3C7 | #92400E | rgba(253,...) | #FDE68A |
| `--avatar-5-*` | #EDE9FE | #5B21B6 | rgba(196,...) | #C4B5FD |
| `--avatar-6-*` | #CFFAFE | #0E7490 | rgba(103,...) | #67E8F9 |
| `--avatar-7-*` | #FCEADA | #9A3412 | rgba(253,...) | #FDBA74 |
| `--avatar-8-*` | #ECFCCB | #4D7C0F | rgba(190,...) | #BEF264 |

모든 배색 쌍은 AA 이상의 명도 대비를 보장합니다.

```tsx
const Avatar = ({ name, tone }) => (
  <span style={{
    background: `var(--avatar-${tone}-bg)`,
    color: `var(--avatar-${tone}-fg)`
  }}>
    {name.slice(0,2)}
  </span>
)
```

## 기타 (Miscellaneous)

### 코드 (Code)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--code-bg` | #EDEFF4 | #1E1E1E | 코드 블록 배경 |
| `--code-text` | #A14A10 | #FDBA74 | 코드 텍스트 |

### 마크 (Highlight)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--mark-bg` | #FEF3C7 | rgba(251,...) | 하이라이트 배경 |
| `--mark-text` | #92400E | #FDBA74 | 하이라이트 텍스트 |

### 링크 (Link)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--link` | var(--c-blue-fg) | var(--c-blue-fg) | 링크 색 |

### 스크롤바 (Scrollbar)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--scrollbar-track` | #ECEEF2 | transparent | 스크롤바 트랙 |
| `--scrollbar-thumb` | #C5C9D2 | rgba(148,...,0.28) | 스크롤바 탄(기본) |
| `--scrollbar-thumb-hover` | #8A91A0 | rgba(148,...,0.5) | 스크롤바 탄(호버) |

### 오버레이 (Overlay)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--overlay-bg` | rgba(17,24,39,0.40) | rgba(0,0,0,0.6) | 모달, 팝오버 배경막 |

### AI 그래디언트 (AI Gradient)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--ai-gradient` | 135deg orange → blue | 수직 그래디언트 |
| `--ai-gradient-horizontal` | 90deg orange → blue | 수평 그래디언트 |

```tsx
<div className="ai-gradient-bg">AI 기능</div>
<div className="ai-gradient-text">강조 텍스트</div>
```

## 타이포그래피 (Typography)

### 글꼴 패밀리

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--font-ui` | Inter, Pretendard Variable, ... | UI 텍스트 |
| `--font-mono` | JetBrains Mono, ... | 코드, 숫자 |

### 타입 스케일

> **모든 `--t-*` 토큰은 `calc(<기준px> * var(--app-font-scale, 1))`** 로 정의됩니다.
> 아래 "기준 크기" 는 scale=1 일 때 값이며, 사용자의 글자 크기 설정(`--app-font-scale`)에
> 비례해 커집니다. root `html` font-size 는 16px 로 고정되어 있어 여백(rem)은 스케일
> 영향을 받지 않고 **글자만** 커집니다. (아래 "글자 크기 스케일" 참고)

> **하한은 11px 이다.** `--t-9` / `--t-10` 은 v2.0.4 에서 폐기했다 — 기본 배율에서 안 읽히는데
> "사용자가 `--app-font-scale` 로 키울 수 있다"는 건 해결이 아니다. 기본값이 곧 대부분의 실사용
> 값이다. `typeScale.guard.test.ts` 가 9~10px 재등장을 막는다.

| 토큰 | 기준 크기 | 용도 |
|------|------|------|
| `--t-11` | 11px | 캡션, 메타, 라벨 (하한) |
| `--t-12` | 12px | 본문(기본) |
| `--t-13` | 13px | 본문(큼) |
| `--t-14` | 14px | 섹션 제목 |
| `--t-15` | 15px | 섹션 제목(큼) |
| `--t-16` | 16px | 기본 본문 |
| `--t-18` | 18px | 페이지 제목 |
| `--t-20` | 20px | 큰 제목 |
| `--t-24` | 24px | 매우 큰 제목 |

### 시맨틱 타입 클래스

```tsx
<h1 className="text-title">페이지 제목</h1>
<h2 className="text-section">섹션 제목</h2>
<p className="text-body">본문</p>
<small className="text-meta">메타정보</small>
<small className="text-caption">캡션</small>
<small className="text-mini">미니 라벨</small>
<small className="text-label">필드 라벨</small>

<div className="num-xl">999</div>
<div className="num-lg">42</div>
```

### 글자 크기 스케일 (--app-font-scale)

사용자가 ⚙ 설정 → 글꼴에서 글자 크기를 조절하면 `useFontSettings` 가 `--app-font-scale`(0.75~1.6)
을 `<html>` 에 설정합니다. **이 배율은 font-size 에만 적용되고 여백/레이아웃에는 적용되지 않습니다**
(글자만 커지고 칸 크기는 그대로). 따라서 **모든 font-size 는 이 변수에 반응하도록** 정의해야 합니다.

| 방식 | 예 | 스케일 반응 |
|------|-----|------|
| `--t-*` 토큰 | `font-size: var(--t-12)` | ✓ (토큰이 calc 처리) |
| Tailwind named 유틸 | `text-xs` / `text-sm` / ... | ✓ (tailwind.config `fontSize` 테마가 calc 처리) |
| Tailwind arbitrary | `text-[calc(12px_*_var(--app-font-scale,1))]` | ✓ |
| **raw px (금지)** | `text-[12px]`, `font-size: 12px` | ✗ 스케일 무시 |

> 회귀 가드: `src/renderer/src/hooks/fontScale.guard.test.ts` 가 raw px 폰트 재유입을 차단합니다.
> 범위 외: 터미널(canvas 렌더링)·일부 차트/플로우 다이어그램의 inline `fontSize`.

## 토큰 작성 규칙

### 좋은 예

```tsx
// ✓ 토큰 사용
<div style={{ color: 'var(--text-primary)' }}>텍스트</div>
<div style={{ background: 'var(--c-blue-bg)' }}>배경</div>
<div style={{ boxShadow: 'var(--elev-2)' }}>그림자</div>

// ✓ 유틸리티 클래스
<div className="text-title">제목</div>
<div className="ds-chip blue">태그</div>
```

### 나쁜 예

```tsx
// ✗ 직접 색 하드코딩
<div style={{ color: '#FF5733' }}>색</div>
<div style={{ background: '#E1EBFC' }}>배경</div>

// ✗ 구식 색명
<div style={{ color: '--accent-blue' }}>텍스트</div>
```

### 신규 토큰 추가 체크리스트

새로운 토큰을 추가할 때:

- [ ] 라이트 모드 값
- [ ] 다크 모드 값
- [ ] 두 모드 간 명도 대비 >= AA (4.5:1)
- [ ] 의도 명확한 이름 (색, 용도)
- [ ] index.css에 주석으로 용도 설명
- [ ] 라이트/다크 모드에서 시각 테스트
