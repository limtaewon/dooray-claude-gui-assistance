# Design System Tokens

모든 스타일은 CSS 변수(tokens)로 정의되며, 직접 색값을 하드코딩하지 않습니다. 토큰은 `src/renderer/src/index.css`에서 관리됩니다.

## 색상 (Color)

### 브랜드 색 (Brand — 모드 무관)

이 색들은 고정이며, 모드 전환 시 변하지 않습니다.

| 토큰 | 라이트 | 설명 |
|------|--------|------|
| `--clover-orange` | #EA580C | 두레이 브랜드, AI 강조 |
| `--clover-orange-light` | #FB923C | 호버, 보조 |
| `--clover-orange-soft` | #FBE4D5 | 라이트 배경 |
| `--clover-blue` | #2563EB | Claude 브랜드, 정보 |
| `--clover-blue-light` | #3B82F6 | 호버, 보조 |
| `--clover-blue-soft` | #DCE6FB | 라이트 배경 |

```tsx
// 사용 예
<div style={{ background: 'var(--clover-orange)' }}>AI 기능</div>
```

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
| `--c-blue-bg` | #E1EBFC | rgba(59,130,246,0.16) | 배경 tint |
| `--c-blue-fg` | #1D4ED8 | #93C5FD | 전경 텍스트 |
| `--c-blue-solid` | #2563EB | #3B82F6 | 단색(버튼, 선) |

```tsx
<Chip tone="blue">작업 중</Chip>  // bg/fg 자동 사용
<Button variant="primary">실행</Button>  // solid 사용
```

#### Orange (AI, 액션, 두레이)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-orange-bg` | #FCEADA | rgba(251,146,60,0.16) | 배경 tint |
| `--c-orange-fg` | #B45309 | #FDBA74 | 전경 텍스트 |
| `--c-orange-solid` | #EA580C | #FB923C | 단색 |

#### Red (위험, 오류)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-red-bg` | #FCE5E5 | rgba(248,113,113,0.16) | 배경 tint |
| `--c-red-fg` | #B91C1C | #FCA5A5 | 전경 텍스트 |
| `--c-red-solid` | #DC2626 | #F87171 | 단색 |

```tsx
<Chip tone="red">오류</Chip>
<Button variant="danger">삭제</Button>
```

#### Emerald (성공, 완료)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-emerald-bg` | #DCFCE7 | rgba(34,197,94,0.16) | 배경 tint |
| `--c-emerald-fg` | #15803D | #86EFAC | 전경 텍스트 |
| `--c-emerald-solid` | #16A34A | #22C55E | 단색 |

#### Violet (멘션, 참고)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--c-violet-bg` | #EDE9FE | rgba(167,139,250,0.16) | 배경 tint |
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
| `--c-neutral-bg` | #EEF0F4 | rgba(148,163,184,0.14) | 배경 tint |
| `--c-neutral-fg` | #525A6B | #CBD5E1 | 전경 텍스트 |
| `--c-neutral-solid` | #8A91A0 | #94A3B8 | 단색 |

### 배경 및 표면 (Background & Surface)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--bg-sidebar` | #ECEEF2 | #0F1115 | 사이드바 배경 |
| `--bg-base` | #F4F5F8 | #15181E | 기본 배경(primary) |
| `--bg-surface` | #FFFFFF | #1C2027 | 카드, 컨테이너 |
| `--bg-surface-raised` | #FFFFFF | #232831 | 모달, 팝오버(더 높음) |
| `--bg-surface-hover` | #EAECF0 | #262C36 | 호버 상태 |
| `--bg-subtle` | #EEF0F4 | #1A1D24 | 미묘한 배경 |
| `--bg-border` | #DDE0E6 | #2E343F | 테두리, 분할선 |
| `--bg-border-light` | #C5C9D2 | #3A4150 | 약한 테두리 |
| `--bg-border-strong` | #A4ABB8 | #4A5160 | 강한 테두리 |

```tsx
<div style={{ background: 'var(--bg-surface)' }}>
  카드 배경
</div>
<div style={{ borderColor: 'var(--bg-border)' }}>
  테두리
</div>
```

### 텍스트 색 (Text)

3단계 계층으로 정보 계층을 표현합니다.

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--text-primary` | #161A22 | #ECEEF2 | 제목, 본문 |
| `--text-secondary` | #525A6B | #A9AEBA | 서브텍스트, 보조 정보 |
| `--text-tertiary` | #8A91A0 | #6B7180 | 매우 약한 텍스트, placeholder |
| `--text-disabled` | #B0B6C2 | #4A5160 | 비활성 상태 텍스트 |

```tsx
<h2 style={{ color: 'var(--text-primary)' }}>제목</h2>
<p style={{ color: 'var(--text-secondary)' }}>보조 정보</p>
<small style={{ color: 'var(--text-tertiary)' }}>메타데이터</small>
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
| `--ring-focus-color` | rgba(37,99,235,0.30) | rgba(96,165,250,0.40) | 포커스 링 색 |
| `--ring-focus` | 0 0 0 3px var(--ring-focus-color) | 0 0 0 3px var(--ring-focus-color) | 포커스 링(input, button) |

```tsx
<input style={{ boxShadow: 'var(--ring-focus)' }} />
```

### Error Ring (오류 상태)

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--ring-error-color` | rgba(220,38,38,0.25) | rgba(248,113,113,0.35) | 오류 링 색 |
| `--ring-error` | 0 0 0 3px var(--ring-error-color) | 0 0 0 3px var(--ring-error-color) | 오류 상태 |

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
| `--chart-axis` | #CBD5E1 | #3A4150 | 축 |
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
| `--code-bg` | #EDEFF4 | #1C2027 | 코드 블록 배경 |
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

| 토큰 | 크기 | 용도 |
|------|------|------|
| `--t-9` | 9px | 매우 작은 라벨 |
| `--t-10` | 10px | 라벨, 캡션 |
| `--t-11` | 11px | 보조 텍스트 |
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
