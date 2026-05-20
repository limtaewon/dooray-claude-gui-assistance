/**
 * 앱에 내장된 CLAUDE.md 템플릿 카탈로그.
 *
 * 사용자가 프로젝트 cwd 에 CLAUDE.md 를 빠르게 만들거나 갱신할 때 출발점이 되는
 * 큐레이션된 템플릿 모음. 외부 저장소(위키/gist) 도 가능하지만 v1.5.x 에서는
 * 앱 내장으로 시작 — 추가 인프라 불필요, 오프라인 동작.
 *
 * 새 템플릿 추가는 이 파일에 객체만 push 하면 됨.
 */

export interface ClaudeMdTemplate {
  /** 슬러그 — IPC 식별자 */
  id: string
  /** 카탈로그 카드 제목 */
  name: string
  /** 카드 하단 한 줄 설명 */
  description: string
  /** 실제 CLAUDE.md 본문. 마크다운. */
  body: string
}

const GENERAL = `# 프로젝트

> 한두 줄로 프로젝트가 무엇인지 적어주세요.

## 기술 스택

- 언어:
- 런타임/프레임워크:
- 빌드:

## 디렉터리 구조

\`\`\`
src/
  ...
\`\`\`

## 빌드 & 개발

\`\`\`bash
npm install
npm run dev
npm run build
\`\`\`

## 코드 컨벤션

- (예) 타입 우선, 함수형 컴포넌트, hooks
- (예) 한글 주석 OK, 사용자 문구는 자연스러운 한국어

## 주의 사항

- 비밀키/토큰은 .env 또는 OS 키체인에만 보관
- 외부 API 호출 시 rate limit 주의
`

const REACT_TS = `# React + TypeScript 프로젝트

## 기술 스택

- React 18, TypeScript strict
- Vite (또는 Next.js)
- TailwindCSS / CSS Modules
- 테스팅: Vitest + Testing Library

## 경로 별칭

- \`@\` → \`src\`

## 빌드 & 개발

\`\`\`bash
npm install
npm run dev
npm run build
npm run test
\`\`\`

## 코드 컨벤션

- 함수형 컴포넌트 + hooks. 클래스 컴포넌트는 ErrorBoundary 외 X
- props 는 \`interface\` 로 정의, optional 은 명시
- 공통 컴포넌트는 \`components/common\` 에
- 디자인 토큰/색상은 CSS variable

## IPC / API 패턴

- (Electron) 채널 상수는 \`shared/types/ipc.ts\` 에 모아둠
- (Web) API 호출은 \`api/\` 폴더의 typed wrapper 사용

## 테스트

- 컴포넌트는 user-event 로 상호작용 시뮬레이션
- 외부 API 는 MSW 로 mocking
`

const NODE_BACKEND = `# Node.js 백엔드

## 기술 스택

- Node 20+ / TypeScript
- (예) Fastify, NestJS, Express
- DB: PostgreSQL / MongoDB
- ORM: Prisma / Mongoose

## 디렉터리 구조

\`\`\`
src/
  routes/     라우터
  services/   비즈니스 로직
  repos/      DB 접근
  schemas/    검증 스키마
\`\`\`

## 빌드 & 개발

\`\`\`bash
npm install
npm run dev      # nodemon 또는 tsx watch
npm run build
npm run test
\`\`\`

## 코드 컨벤션

- 의존성 주입: 생성자 주입 우선
- 컨트롤러는 얇게, 서비스 레이어에 로직
- 에러는 도메인 에러 클래스로 throw → 최상단 핸들러에서 변환

## DB / 마이그레이션

- 마이그레이션은 새 파일로만 추가, 기존 파일 수정 금지
- 시드 데이터는 \`prisma/seed.ts\` 또는 \`scripts/seed.ts\`

## 보안

- 인증: JWT short-lived + refresh
- 사용자 입력은 schema 검증 후만 신뢰
`

const ELECTRON_DESKTOP = `# Electron 데스크톱 앱

## 기술 스택

- Electron + electron-vite
- main / preload / renderer 분리
- TypeScript strict

## IPC 패턴

1. 채널 상수를 \`shared/types/ipc.ts\` 에 추가
2. \`preload/\` 에서 \`contextBridge.exposeInMainWorld('api', { ... })\` 로 노출
3. \`main/\` 에서 \`ipcMain.handle()\` 로 처리
4. renderer 는 \`window.api.<domain>.<method>()\` 로 호출

## 네이티브 모듈

- node-pty, keytar 등은 OS별 prebuild 필요
- \`postinstall\` 에서 \`electron-rebuild\` 실행
- \`asarUnpack\` 으로 패키징에서 풀려나오게 설정

## 빌드 & 배포

\`\`\`bash
npm run dev          # electron-vite dev
npm run build        # 정적 빌드
npm run dist         # 패키지 (macOS)
npm run dist:win     # 패키지 (Windows)
\`\`\`

## 보안

- nodeIntegration: false, contextIsolation: true
- preload 에서만 ipcRenderer 노출. renderer 에서 직접 import X
`

export const CLAUDE_MD_TEMPLATES: ClaudeMdTemplate[] = [
  { id: 'general', name: '일반 프로젝트', description: '기술 스택·구조·컨벤션 자리표시자만 있는 가장 가벼운 시작점', body: GENERAL },
  { id: 'react-ts', name: 'React + TypeScript', description: 'Vite/Next 기반 SPA. hooks·디자인 토큰·IPC/API 패턴 포함', body: REACT_TS },
  { id: 'node-backend', name: 'Node.js 백엔드', description: 'Fastify/NestJS 풍의 백엔드. DI·DB·보안 가이드', body: NODE_BACKEND },
  { id: 'electron', name: 'Electron 데스크톱', description: 'main/preload/renderer 분리 + IPC 패턴 + 패키징', body: ELECTRON_DESKTOP }
]

export function findClaudeMdTemplate(id: string): ClaudeMdTemplate | undefined {
  return CLAUDE_MD_TEMPLATES.find((t) => t.id === id)
}
