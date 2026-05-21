# Color Policy — 외부 색 처리

두레이는 사용자가 지정한 태그 색, 캘린더 색, 프로필 색 등 **외부 색**을 제공합니다. 이 색들을 Clauday UI에 그대로 사용하면 라이트/다크 모드에서 읽을 수 없게 됩니다. 이 문서는 외부 색을 올바르게 통합하는 방법을 설명합니다.

## 문제: 외부 색을 직접 쓰면 안 되는 이유

### 사례 1: 라이트 모드에서 문제

두레이 태그 색이 `#FFD700` (밝은 노랑)이라고 가정:

```tsx
// ✗ 잘못됨: 밝은 배경에 밝은 색
<div style={{ background: '#FFD700', color: '#FFFFFF' }}>
  태그
</div>
// 라이트 모드: 노랑 배경 + 흰색 텍스트 = 명도 대비 1.1:1 (읽을 수 없음)
```

### 사례 2: 다크 모드에서 문제

```tsx
// ✗ 잘못됨: 어두운 배경에 어두운 색
<div style={{ background: '#1A1A1A', color: '#333333' }}>
  다크 배경
</div>
// 다크 모드: 검정 배경 + 어두운 회색 = 명도 대비 1.05:1 (읽을 수 없음)
```

### 사례 3: 모드 전환 시 혼란

사용자가 라이트 모드에서 태그를 생성할 때:
- UI에서는 밝은 배경에 어두운 텍스트 (읽힘)
- 다크 모드로 전환하면 같은 색이 모두 읽을 수 없음 (혼란)

## 솔루션: color-mix로 Tint 생성

**color-mix** 함수를 사용하여 외부 색을 디자인 시스템 토큰과 섞으면, 모드별로 자동 조정됩니다.

### 기본 패턴

```tsx
// 외부 색
const tagColor = '#FF6B6B' // 사용자 정의 빨강

// tint 생성 (배경용)
const bgColor = `color-mix(in oklab, ${tagColor} 20%, var(--bg-surface))`
// 라이트: 배경이 흰색이므로 밝은 tint
// 다크: 배경이 어두운색이므로 어두운 tint

// 전경 텍스트는 원본 색 그대로 또는 saturate
const fgColor = tagColor
```

### 실제 예제: 두레이 태그

```tsx
interface Tag {
  name: string
  color: string  // 두레이에서 제공: 16진 색
}

function TagChip({ tag }: { tag: Tag }) {
  const bgColor = `color-mix(in oklab, ${tag.color} 20%, var(--bg-surface))`
  const fgColor = tag.color
  
  return (
    <span style={{
      background: bgColor,
      color: fgColor,
      padding: '4px 8px',
      borderRadius: '4px'
    }}>
      {tag.name}
    </span>
  )
}

// 라이트 모드:
// - bgColor: #FF6B6B 20% + #FFFFFF = 밝은 분홍
// - fgColor: #FF6B6B (원본, 읽힘)

// 다크 모드:
// - bgColor: #FF6B6B 20% + #1C2027 = 약간 어두운 분홍
// - fgColor: #FF6B6B (원본, 밝아서 읽힘)
```

### color-mix 옵션

```tsx
// oklab: 인지적 색 공간 (권장 — 자연스러운 tint)
`color-mix(in oklab, ${color} 20%, var(--bg-surface))`

// srgb: RGB 색 공간 (간단하지만 덜 자연스러움)
`color-mix(in srgb, ${color} 20%, var(--bg-surface))`

// lch: 휘도-채도-색상 (고급용)
`color-mix(in lch, ${color} 15%, var(--bg-surface))`
```

**oklab을 기본으로 사용합니다.** 모든 색에서 가장 자연스러운 tint를 생성합니다.

## 패턴별 구현

### 1. 태그 (Tag)

```tsx
function DoorayTag({ tag }: { tag: { name: string; color: string } }) {
  return (
    <span
      className="ds-chip"
      style={{
        background: `color-mix(in oklab, ${tag.color} 18%, var(--bg-surface))`,
        color: tag.color,
        border: `1px solid color-mix(in oklab, ${tag.color} 40%, transparent)`
      }}
    >
      {tag.name}
    </span>
  )
}

// 라이트 모드:
// background: 연한 분홍
// border: 중간 분홍

// 다크 모드:
// background: 약간 어두운 분홍
// border: 중간 분홍 (자동 조정)
```

### 2. 캘린더 이벤트

```tsx
function CalendarEventBadge({ event }: { event: { title: string; color: string } }) {
  return (
    <div
      style={{
        background: `color-mix(in oklab, ${event.color} 25%, var(--bg-surface))`,
        borderLeft: `3px solid ${event.color}`,
        padding: '4px 8px',
        borderRadius: '4px',
        color: 'var(--text-primary)' // 텍스트는 시스템 색
      }}
    >
      {event.title}
    </div>
  )
}
```

### 3. 아바타 배경 (선택적)

```tsx
function UserAvatar({ user }: { user: { name: string; profileColor?: string } }) {
  const bg = user.profileColor
    ? `color-mix(in oklab, ${user.profileColor} 35%, var(--bg-surface))`
    : 'var(--bg-surface)'
  
  return (
    <div style={{ background: bg, color: user.profileColor || 'var(--text-primary)' }}>
      {user.name.slice(0, 2)}
    </div>
  )
}
```

## 혼합 비율 선택 가이드

`color-mix`의 첫 번째 백분율은 외부 색의 **강도**를 제어합니다.

| 비율 | 결과 | 용도 |
|------|------|------|
| 10-15% | 매우 옅은 tint | 배경 (태그, 뱃지) |
| 20-25% | 옅은 tint | 배경 + 텍스트 같은 색 |
| 30-35% | 중간 tint | 이벤트 박스 배경 |
| 40% 이상 | 진한 tint | 테두리, 강조 |

**라이트 모드에서 가시성 확인**:
- 배경 비율이 너무 높으면 흰 텍스트가 읽히지 않음
- 배경 비율이 너무 낮으면 색상 인식 불가

실제 사용 전에 모든 색 범위(밝은색, 어두운색)에서 테스트하세요.

## 안티패턴: 직접 사용

### ✗ 하지 마세요

```tsx
// 1. 색을 그대로 사용
style={{ background: doorayTag.color }}

// 2. 고정 rgba로 덮어씌우기
style={{ background: `rgba(${doorayTag.color}, 0.1)` }}

// 3. 라이트/다크 모드 체크 후 분기
if (theme === 'light') {
  return <div style={{ background: tintLight(color) }} />
} else {
  return <div style={{ background: tintDark(color) }} />
}
```

### ✓ 해야 할 일

```tsx
// 1. color-mix 사용 (자동 조정)
style={{
  background: `color-mix(in oklab, ${color} 20%, var(--bg-surface))`
}}

// 2. 모드에 관계없이 단일 코드로
// → color-mix가 현재 --bg-surface를 자동 참조
```

## 실제 사용 사례: 두레이 봇

메신저 뷰에서 두레이 메시지 태그와 상태 칩을 표시할 때:

```tsx
function DoorayMessage({ message }: { message: DoorayMessageDTO }) {
  return (
    <div className="message">
      <div className="message-body">{message.text}</div>
      
      {/* 상태 — DS 시스템 색 (고정) */}
      <Chip tone={getStatusTone(message.status)}>
        {message.status}
      </Chip>
      
      {/* 태그 — 외부 색 (color-mix) */}
      <div className="tags">
        {message.tags.map((tag) => (
          <span
            key={tag.id}
            style={{
              background: `color-mix(in oklab, ${tag.color} 18%, var(--bg-surface))`,
              color: tag.color,
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px'
            }}
          >
            {tag.name}
          </span>
        ))}
      </div>
    </div>
  )
}
```

## 자동화: 색 처리 유틸리티

색 처리를 반복하지 않으려면 유틸리티 함수를 만드세요:

```tsx
// src/renderer/src/utils/colorMix.ts

export interface ColorMixOptions {
  bgPercent?: number  // 기본 20
  borderPercent?: number  // 기본 40
  colorSpace?: 'oklab' | 'srgb' | 'lch'  // 기본 oklab
}

export function tintExternalColor(
  externalColor: string,
  options: ColorMixOptions = {}
) {
  const {
    bgPercent = 20,
    borderPercent = 40,
    colorSpace = 'oklab'
  } = options

  return {
    bg: `color-mix(in ${colorSpace}, ${externalColor} ${bgPercent}%, var(--bg-surface))`,
    fg: externalColor,
    border: `color-mix(in ${colorSpace}, ${externalColor} ${borderPercent}%, transparent)`
  }
}

// 사용
const tagColors = tintExternalColor(doorayTag.color)
<span style={{
  background: tagColors.bg,
  color: tagColors.fg,
  border: `1px solid ${tagColors.border}`
}}>
  {doorayTag.name}
</span>
```

## 호환성

### 브라우저 지원

- Chrome/Edge 111+: ✓
- Firefox 113+: ✓
- Safari 16.4+: ✓
- Electron (Chromium 기반): ✓

Clauday는 Electron 33 (Chromium 131)이므로 완전 지원됩니다.

### Fallback (레거시)

구형 브라우저 지원이 필요하면 (현재 불필요):

```tsx
const bgColor = CSS.supports('color-mix(in oklab, #000 50%, #fff)')
  ? `color-mix(in oklab, ${color} 20%, var(--bg-surface))`
  : `rgba(${hexToRgb(color).join(',')}, 0.15)` // fallback
```

## 테스트 체크리스트

새로운 외부 색 기능을 추가할 때:

- [ ] 라이트 모드에서 모든 색 범위(밝음, 중간, 어두움) 테스트
- [ ] 다크 모드에서 모든 색 범위 테스트
- [ ] 명도 대비 >= 4.5:1 확인 (라이트/다크 모두)
- [ ] 모드 전환 시 색이 자연스럽게 변경되는지 확인
- [ ] 특수 색(거의 검정, 거의 하양) 처리 확인

## 참고 자료

- MDN: color-mix — https://developer.mozilla.org/en-US/docs/Web/CSS/color_mix()
- CSS Color Module Level 4 — https://www.w3.org/TR/css-color-4/
- oklch 색 공간 — https://www.wikiwand.com/en/CIELAB_color_space
