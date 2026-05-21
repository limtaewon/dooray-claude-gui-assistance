# Theming — 라이트/다크 모드

Clauday는 라이트 모드(기본)와 다크 모드(야간)를 지원합니다. CSS 변수 기반이므로 사용자가 언제든 즉시 전환할 수 있습니다.

## 모드 전환 메커니즘

### data-theme 속성

모드는 `<html>` 요소의 `data-theme` 속성으로 제어됩니다.

```html
<!-- 라이트 모드 (기본) -->
<html data-theme="light">

<!-- 다크 모드 -->
<html data-theme="dark">
```

CSS는 속성 선택자로 모드별 값을 정의합니다:

```css
/* 라이트 모드 (또는 기본값) */
:root,
[data-theme='light'] {
  --bg-surface: #FFFFFF;
  --text-primary: #161A22;
}

/* 다크 모드 */
[data-theme='dark'] {
  --bg-surface: #1C2027;
  --text-primary: #ECEEF2;
}
```

### useTheme 훅

React 컴포넌트에서 모드를 제어할 때:

```tsx
import { useTheme } from '@/hooks/useTheme'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      현재 모드: {theme}
    </button>
  )
}
```

### localStorage 저장

사용자 선택은 localStorage에 `theme` 키로 저장됩니다. 앱 재시작 시 이전 설정이 복원됩니다.

```tsx
// 저장됨
localStorage.setItem('theme', 'dark')

// 로드됨
const saved = localStorage.getItem('theme') // 'dark'
```

## 라이트 모드 — 종이 같은 배경

라이트 모드는 인쇄물처럼 밝고 깔끔한 느낌입니다.

### 색상 특성

| 요소 | 값 |
|------|-----|
| 배경(bg-base) | #F4F5F8 (밝은 회색) |
| 표면(bg-surface) | #FFFFFF (순백) |
| 텍스트 주요(text-primary) | #161A22 (검정) |
| 텍스트 보조(text-secondary) | #525A6B (어두운 회색) |
| 강조(c-blue-solid) | #2563EB (선명한 파랑) |

### P0 가독성 패치 (v1.5)

**문제**: 밝은 배경에서 일부 회색 텍스트의 명도 대비가 부족했습니다.
- `--text-secondary` 원래: #718096 → 수정: #525A6B
- `--text-tertiary` 원래: #A0AEC0 → 수정: #8A91A0

**영향**: 메타정보, 보조 라벨이 더 읽기 쉬워졌습니다.

```css
[data-theme='light'] {
  --text-secondary: #525A6B;  /* 명도: 35% → 더 어둡게 */
  --text-tertiary: #8A91A0;   /* 명도: 52% → 더 어둡게 */
}
```

### 라이트 팔레트 변형

라이트 모드는 5가지 변형 팔레트를 제공합니다. `data-palette` 속성으로 선택:

```html
<html data-theme="light" data-palette="soft-blue">
```

| 팔레트 | 배경 톤 | 용도 |
|--------|--------|------|
| `cool-minimal` (기본) | 차갑고 최소 | 표준 UI |
| `crisp-white` | 따뜻한 흰색 | 최대 명도 |
| `soft-blue` | 청색 tint | 프로페셔널 |
| `graphite` | 중성 회색 | 모던 |
| `paper` | 순수 흑백 | 클래식 |

각 변형은 `src/renderer/src/index.css`의 `[data-theme='light'][data-palette='...']`에서 정의됩니다.

```tsx
// 사용자가 팔레트 선택 시
const selectPalette = (paletteId: string) => {
  document.documentElement.setAttribute('data-palette', paletteId)
}
```

## 다크 모드 — 따뜻한 톤

다크 모드는 야간 사용을 위해 최적화되었으며, 따뜻한 톤으로 눈 피로를 줄입니다.

### 색상 특성

| 요소 | 값 | 특징 |
|------|-----|------|
| 배경(bg-base) | #15181E (따뜻한 검정) | 순검정 #000000이 아님 |
| 표면(bg-surface) | #1C2027 (약간 밝은) | elevation 구분 |
| 텍스트 주요(text-primary) | #ECEEF2 (흐린 흰색) | 순백 #FFFFFF가 아님 |
| 텍스트 보조(text-secondary) | #A9AEBA (밝은 회색) | 명도 대비 보장 |
| 강조(c-blue-solid) | #3B82F6 (밝은 파랑) | 라이트보다 명도 높음 |

### Warmer Neutral (따뜻한 회색)

다크 모드의 회색 배경은 의도적으로 따뜻합니다.

```css
[data-theme='dark'] {
  --bg-sidebar:     #0F1115;  /* 0-10% 밝기, 약간 따뜻함 */
  --bg-base:        #15181E;  /* 8-10% 밝기 */
  --bg-surface:     #1C2027;  /* 10-13% 밝기 */
  --bg-surface-raised: #232831; /* 13-15% 밝기 */
}
```

**이유**: 순검정은 LCD 화면에서 과도한 명도 변화를 일으켜 눈 피로를 증가시킵니다. 약간 따뜻한 어두운 회색이 더 편합니다.

### 텍스트 톤 (Softer White)

다크 모드 텍스트는 순백이 아닙니다:

```css
[data-theme='dark'] {
  --text-primary: #ECEEF2;  /* 순백 #FFFFFF가 아님 */
}
```

**이유**: 100% 명도 텍스트는 배경과의 명도 차이가 너무 크면 글자가 "떨려" 보이는 착각을 일으킵니다(halation). 92-93% 명도가 최적입니다.

## 명도 대비 (Accessibility)

모든 색 쌍은 WCAG AA 표준(4.5:1 이상)을 만족합니다.

### 예시: Blue 색

**라이트 모드**
```
배경: #E1EBFC (밝음)
텍스트: #1D4ED8 (어두움)
대비: 약 8:1 (AA++ 합격)
```

**다크 모드**
```
배경: rgba(59,130,246,0.16) (낮은 alpha)
텍스트: #93C5FD (밝음)
대비: 약 5.5:1 (AA 합격)
```

### 색상 검증

새로운 색을 추가할 때는 반드시 대비를 확인하세요:

1. WebAIM Contrast Checker (https://webaim.org/resources/contrastchecker/)를 사용
2. 라이트 모드에서 배경색 입력, 텍스트색 입력
3. 다크 모드에서도 동일하게 검증
4. 모두 4.5:1 이상인지 확인

## 코드 블록과 강조 (Code Highlighting)

코드 블록, 마크다운도 모드를 따릅니다:

```tsx
// 라이트 모드
--code-bg: #EDEFF4;    // 밝은 배경
--code-text: #A14A10;  // 어두운 갈색

// 다크 모드
--code-bg: #1C2027;    // 다크 배경
--code-text: #FDBA74;  // 밝은 주황
```

Diff 스타일도 모드별 최적화:

```tsx
/* 추가 라인 */
.ds-diff-add {
  background: var(--c-emerald-bg);  // 모드별 자동 조정
  color: var(--c-emerald-fg);
}

/* 삭제 라인 */
.ds-diff-del {
  background: var(--c-red-bg);
  color: var(--c-red-fg);
}
```

## 신규 색 추가 체크리스트

새로운 색을 추가할 때:

1. **라이트 모드 값 정의**
   ```css
   [data-theme='light'] {
     --my-color-bg: #E8F4FD;
     --my-color-fg: #0052CC;
   }
   ```

2. **다크 모드 값 정의**
   ```css
   [data-theme='dark'] {
     --my-color-bg: rgba(59,130,246,0.16);
     --my-color-fg: #60A5FA;
   }
   ```

3. **명도 대비 검증** (4.5:1 이상)
   - 라이트: bg vs fg
   - 다크: bg vs fg

4. **시각 테스트**
   - 라이트 모드에서 렌더링 확인
   - 다크 모드로 전환 후 확인
   - 색이 자연스럽게 전환되는지 확인

5. **index.css에 문서화**
   ```css
   --my-color-bg: ...; /* 설명: 용도 */
   --my-color-fg: ...;
   ```

6. **tokens.md 업데이트**
   새로운 토큰을 tokens.md에 표로 추가

## 모드별 색상 대응

| 라이트 | 다크 | 관계 |
|--------|------|------|
| 밝음 | 어두움 | 명도 반전 |
| 순색 | 밝은 톤 | 포화도 유지 |
| 샤도우 약함 | 샤도우 강함 | 깊이감 보정 |

```tsx
// 라이트: 밝은 배경 + 어두운 텍스트
background: var(--bg-surface);    // #FFFFFF
color: var(--text-primary);       // #161A22

// 다크: 어두운 배경 + 밝은 텍스트 (자동 조정)
background: var(--bg-surface);    // #1C2027
color: var(--text-primary);       // #ECEEF2
```

## 성능

CSS 변수 기반 테마는 매우 빠릅니다:

- **라이트 → 다크 전환**: 30ms 이내 (브라우저 리플로우)
- **재렌더링 없음**: CSS만 업데이트되므로 React 재렌더링 불필요
- **번들 크기**: 두 모드 CSS가 모두 로드되지만, 모드별로 활성화된 변수만 사용됨

## 시스템 환경설정 감지 (향후)

현재는 사용자가 수동으로 선택합니다. 향후 OS 환경설정 감지 추가 가능:

```tsx
// 미래의 코드 (아직 미구현)
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
prefersDark.addEventListener('change', (e) => {
  setTheme(e.matches ? 'dark' : 'light')
})
```

## 문제 해결

### 전환 시 색이 어색합니다

라이트/다크 색 쌍이 정확하지 않을 수 있습니다. index.css에서 두 모드 값을 확인하세요:

```css
/* 잘못됨 */
[data-theme='light'] { --my-color: #E1EBFC; }
[data-theme='dark']  { --my-color: #333333; }  // 연관 없음

/* 올바름 */
[data-theme='light'] { --my-color: #E1EBFC; }
[data-theme='dark']  { --my-color: rgba(59,130,246,0.16); }  // 같은 색 계열
```

### 다크 모드에서 색이 읽히지 않습니다

명도 대비를 확인하세요. 4.5:1 미만이면 fg색을 더 밝게 조정하세요.

### 특정 컴포넌트만 모드 변경이 안 됩니다

하드코딩된 색이 있는지 확인하세요:

```tsx
// 잘못됨 — 모드 변경 무시
style={{ color: '#1D4ED8' }}

// 올바름 — 모드 반응
style={{ color: 'var(--c-blue-fg)' }}
```
