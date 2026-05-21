# Input

입력 필드 컴포넌트는 사용자로부터 단일 라인(text, email, password 등) 또는 다중 라인(textarea) 텍스트를 받습니다.

## 언제 쓰나

- **단일 라인 입력**: 검색, 이름, 이메일, URL
- **다중 라인**: 설명, 메모, 긴 텍스트
- **특수 입력**: 날짜, 숫자, 비밀번호 (`type` 속성 사용)

## 언제 쓰면 안 되나

- **큰 텍스트 에디터**: `@monaco-editor/react` 사용 (코드 에디터)
- **선택 리스트**: `<select>`나 커맨드 팔레트 사용
- **토글 옵션**: `SegTabs` 또는 checkbox 사용

## Props

### Input

| 이름 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `size` | `'sm' \\| 'md'` | `'md'` | 높이 및 padding |
| `placeholder` | `string` | — | placeholder 텍스트 |
| `type` | `string` | `'text'` | input 타입 |
| `value` | `string` | — | 제어 입력값 |
| `onChange` | `(e) => void` | — | 변경 핸들러 |
| `disabled` | `boolean` | — | 비활성화 |
| `autoFocus` | `boolean` | — | 마운트 시 자동 포커스 |
| `className` | `string` | — | 추가 CSS 클래스 |
| `ref` | `RefObject<HTMLInputElement>` | — | 포워드 ref |

### Textarea

| 이름 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `placeholder` | `string` | — | placeholder |
| `value` | `string` | — | 입력값 |
| `onChange` | `(e) => void` | — | 변경 핸들러 |
| `rows` | `number` | `3` | 초기 줄 수 |
| `disabled` | `boolean` | — | 비활성화 |
| `className` | `string` | — | 추가 CSS 클래스 |
| `ref` | `RefObject<HTMLTextAreaElement>` | — | 포워드 ref |

### FieldLabel

| 이름 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `children` | `ReactNode` | — | 라벨 텍스트 |
| `className` | `string` | — | 추가 CSS 클래스 |

## 기본 사용

### 단일 라인 입력

```tsx
import Input from '@/components/common/ds/Input'
import { useState } from 'react'

function SearchForm() {
  const [q, setQ] = useState('')
  
  return (
    <Input
      type="text"
      placeholder="작업 검색..."
      value={q}
      onChange={(e) => setQ(e.target.value)}
    />
  )
}
```

### 크기 제어

```tsx
// 기본 (28px, padding 10px)
<Input size="md" placeholder="기본" />

// 작음 (24px, padding 8px)
<Input size="sm" placeholder="작은 입력" />
```

### 라벨과 함께

```tsx
import { FieldLabel } from '@/components/common/ds/Input'

function SignupForm() {
  return (
    <div style={{ marginBottom: 16 }}>
      <FieldLabel>이메일</FieldLabel>
      <Input
        type="email"
        placeholder="your@email.com"
        required
      />
    </div>
  )
}
```

### 다중 라인 (Textarea)

```tsx
import { Textarea } from '@/components/common/ds/Input'

function TaskDescription() {
  const [desc, setDesc] = useState('')
  
  return (
    <div>
      <FieldLabel>설명</FieldLabel>
      <Textarea
        placeholder="자세한 설명을 입력하세요"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={4}
      />
    </div>
  )
}
```

## Input 타입

```tsx
// 검색
<Input type="text" placeholder="검색..." />

// 이메일
<Input type="email" placeholder="user@example.com" />

// 비밀번호 (텍스트 마스킹)
<Input type="password" placeholder="비밀번호" />

// 숫자
<Input type="number" placeholder="0" min="0" max="100" />

// URL
<Input type="url" placeholder="https://..." />

// 날짜 (native picker)
<Input type="date" />

// 시간
<Input type="time" />

// 색상 (native picker)
<Input type="color" />

// 파일 (hidden, drag-drop이 아닌 경우)
<Input type="file" accept=".csv,.json" />
```

## 포커스 상태

Input은 포커스 시 자동으로 파랑 테두리와 포커스 링을 표시합니다:

```css
/* CSS (자동) */
.ds-input:focus {
  outline: none;
  border-color: var(--c-blue-solid);
  box-shadow: var(--ring-focus);  /* 3px blue ring */
}
```

## 비활성화 상태

```tsx
<Input disabled placeholder="비활성" />

// 또는 형식 검증 실패 시
<Input value="invalid" aria-invalid="true" />
```

## 유효성 검사

HTML5 native validation 또는 외부 라이브러리 사용:

```tsx
function EmailInput() {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  
  const handleChange = (e) => {
    const v = e.target.value
    setValue(v)
    
    if (v && !v.includes('@')) {
      setError('유효한 이메일을 입력하세요')
    } else {
      setError('')
    }
  }
  
  return (
    <div>
      <FieldLabel>이메일</FieldLabel>
      <Input
        type="email"
        value={value}
        onChange={handleChange}
        aria-invalid={!!error}
        aria-describedby={error ? 'email-error' : undefined}
      />
      {error && (
        <small id="email-error\" style={{ color: 'var(--c-red-fg)', marginTop: 4 }}>
          {error}
        </small>
      )}
    </div>
  )
}
```

## Ref 포워드

입력값을 프로그래밍으로 제어할 때:

```tsx
import { useRef } from 'react'
import Input from '@/components/common/ds/Input'

function ResetableInput() {
  const inputRef = useRef<HTMLInputElement>(null)
  
  return (
    <>
      <Input ref={inputRef} placeholder="입력..." />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          inputRef.current?.focus()
          inputRef.current!.value = ''
        }}
      >
        초기화
      </Button>
    </>
  )
}
```

## 고급 패턴

### 검색 입력 (자동완성)

```tsx
function SearchWithSuggestions() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<string[]>([])
  
  const handleChange = (e) => {
    const v = e.target.value
    setQ(v)
    
    if (v.length > 2) {
      // API 호출 또는 로컬 검색
      setResults(filterResults(v))
    }
  }
  
  return (
    <div style={{ position: 'relative' }}>
      <Input
        type="text"
        placeholder="검색..."
        value={q}
        onChange={handleChange}
      />
      {results.length > 0 && (
        <div className="suggestions" style={{ position: 'absolute', top: '100%', zIndex: 10 }}>
          {results.map((r) => (
            <div key={r} onClick={() => setQ(r)}>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 폼 필드 (라벨 + 에러)

```tsx
function FormField({
  label,
  error,
  required,
  ...props
}: {
  label: string
  error?: string
  required?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ marginBottom: 16 }}>
      <FieldLabel>
        {label}
        {required && <span style={{ color: 'var(--c-red-fg)' }}>*</span>}
      </FieldLabel>
      <Input aria-invalid={!!error} {...props} />
      {error && (
        <small style={{ color: 'var(--c-red-fg)', display: 'block', marginTop: 4 }}>
          {error}
        </small>
      )}
    </div>
  )
}

// 사용
<FormField label="이름" required />
<FormField label="이메일" error="이미 가입된 이메일입니다" />
```

### 문자 수 제한

```tsx
function LimitedInput({ maxLength = 100 }) {
  const [value, setValue] = useState('')
  
  return (
    <div>
      <Input
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`최대 ${maxLength}글자`}
      />
      <small style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
        {value.length} / {maxLength}
      </small>
    </div>
  )
}
```

## 접근성

### 스크린 리더

```tsx
// 좋음: 라벨이 명확
<FieldLabel htmlFor="task-name">작업명</FieldLabel>
<Input id="task-name" placeholder="작업 입력" />

// 좋음: 에러 메시지 연결
<Input aria-invalid="true" aria-describedby="error-msg" />
<small id="error-msg">이 필드는 필수입니다</small>

// 좋음: 필수 표시
<Input required aria-required="true" />
```

### 포커스 관리

- Input은 `:focus` 시 자동으로 파랑 테두리와 ring 표시
- Tab 키로 자동 포커스 이동
- autoFocus 시 로드 후 즉시 포커스

## 관련 토큰

- `--bg-primary`: 입력 배경
- `--c-blue-solid`: 포커스 테두리
- `--ring-focus`: 포커스 링
- `--text-primary`: 텍스트 색
- `--text-tertiary`: placeholder 색
- `--bg-border`: 기본 테두리

## 자주 하는 실수

### ✗ 라벨 없이 사용

```tsx
// 안 됨
<Input placeholder="이름" />

// 좋음
<FieldLabel>이름</FieldLabel>
<Input placeholder="예: 김철수" />
```

### ✗ 에러 상태 표시 없음

```tsx
// 안 됨 - 사용자가 이유를 모름
<Input value="invalid" />

// 좋음 - 에러 메시지 표시
<Input aria-invalid="true" />
<small style={{ color: 'var(--c-red-fg)' }}>올바른 형식이 아닙니다</small>
```

### ✗ 무제한 입력

```tsx
// 안 됨
<Input type="text" />

// 좋음 - maxLength 또는 검증
<Input type="text" maxLength={255} />
```

## 예제 모음

### 로그인 폼

```tsx
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  return (
    <form>
      <div style={{ marginBottom: 16 }}>
        <FieldLabel>이메일</FieldLabel>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <FieldLabel>비밀번호</FieldLabel>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button variant="primary" type="submit">
        로그인
      </Button>
    </form>
  )
}
```

### 검색 바

```tsx\nfunction SearchBar() {\n  const [q, setQ] = useState('')\n  \n  return (\n    <div style={{ position: 'relative', width: '100%' }}>\n      <Input\n        type=\"text\"\n        placeholder=\"작업 또는 메시지 검색...\"\n        value={q}\n        onChange={(e) => setQ(e.target.value)}\n        autoFocus\n      />\n    </div>\n  )\n}\n```\n