import { useState } from 'react'
import { Book, Terminal, Zap, Settings, MessageSquare, GitBranch, Shield, Cpu, Search, DollarSign, Wrench, Bot, FileCode, Clover } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface Section { id: string; icon: typeof Book; title: string; content: string }

const SECTIONS: Section[] = [
  {
    id: 'clauday', icon: Clover, title: 'Clauday 앱 가이드',
    content: `# Clauday — 두레이 + Claude Code GUI

Clauday는 NHN Dooray 업무 관리와 Claude Code를 결합한 데스크톱 앱입니다.

## 사이드바 메뉴

| 아이콘 | 탭 | 설명 |
|--------|-----|------|
| 📅 | **두레이** | 태스크, 브리핑, 보고서, 위키, 캘린더 |
| >_ | **터미널** | 내장 터미널 (Claude Code 실행 가능) |
| 🗄 | **MCP 서버** | MCP 서버 설정 관리 |
| ✨ | **스킬** | Claude Code 커스텀 스킬 관리 |
| 📊 | **사용량** | 토큰 사용량, 비용, AI 인사이트 |
| 📖 | **매뉴얼** | 이 페이지 |

---

## 두레이 탭

### 태스크
- **좌측**: 프로젝트 목록 (⚙ 버튼으로 표시할 프로젝트 선택)
- **중앙**: 태스크 목록 (상태/태그 드롭다운 필터 + 검색)
- **우측**: 태스크 상세 (클릭 시 열림, ESC로 닫기)
- 상세 패널에서 **AI 분석** 버튼 → Claude가 태스크 요약
- **두레이에서 보기** → 브라우저에서 원본 열기
- 댓글도 표시 (사람이 작성한 것만, GitHub 봇 제외)
- 패널 경계를 **드래그하여 크기 조절** 가능

### 브리핑
- **새 브리핑 생성** → AI가 분석:
  - 담당 태스크 (toMemberIds)
  - 참조/멘션 태스크 (ccMemberIds)
  - 오늘 마감 태스크 (dueAt=today)
  - 이번 주 캘린더 일정
- 결과: 긴급 / 오늘 집중 / 멘션됨 / 착수 필요 / 일정 / AI 추천
- **히스토리**: 이전 브리핑을 로컬에 저장, 드롭다운으로 불러오기
- **⚡ 스킬**: 브리핑에 적용할 AI 스킬 관리 (아래 참조)

### 보고서
- **일일/주간** 보고서 AI 자동 생성
- 마크다운 렌더링 + **편집 모드** (수정 후 복사/저장 가능)
- **.md 다운로드** 지원
- **히스토리**: 이전 보고서 최대 20개 저장

### 위키
- **좌측**: 위키 도메인 목록 (⚙로 선택, 접기 가능)
- **중앙**: 계층형 페이지 트리 (▶ 클릭으로 하위 페이지 펼치기) + 검색
- **우측**: 페이지 내용 (마크다운 + HTML 렌더링)
- **AI 도구** (Opus 모델):
  - **교정**: 맞춤법/문법 교정
  - **개선**: 가독성/구조 개선
  - **요약**: 3~5줄 요약
  - **구조 분석**: 구조 개선 제안
- AI 결과를 **편집** 후 **"위키에 반영"** 버튼으로 두레이에 직접 저장

### 캘린더
- 이번 주 전체 일정 표시 (전체 캘린더에서 가져옴)
- ⚙ 버튼으로 **표시할 캘린더 선택** (설정 영구 유지)
- 종일 이벤트 = 주황색, 시간 이벤트 = 파란색, 장기(2일+) = 초록색
- **AI 일정 분석**: 빈 시간대, 바쁜 날, 연속 회의 경고, 집중 시간 추천

---

## AI 스킬 시스템

각 탭(브리핑, 보고서, 캘린더, 위키)에서 **⚡ 스킬** 버튼으로 관리.

### 스킬이란?
AI에게 전달되는 **커스텀 규칙**. 마크다운(.md) 파일로 저장.

### 스킬 생성 방법
1. **AI로 생성**: 요구사항을 자연어로 입력 → AI가 스킬 코드 생성
2. **직접 작성**: 이름, 설명, 규칙(마크다운) 직접 입력

### 스킬 저장 위치
\`\`\`
~/Library/Application Support/clover/
├── briefing/skills/*.md     # 브리핑 스킬
├── report/skills/*.md       # 보고서 스킬
├── calendar/skills/*.md     # 캘린더 스킬
├── chat/skills/*.md         # 채팅 스킬
└── all/skills/*.md          # 전체 공통 스킬
\`\`\`

### 스킬 파일 형식 (Claude Code CLI 스킬과 동일)
\`\`\`markdown
---
name: 배치 실패 모니터링
description: NEON-배치모니터링 실패 알림 집계
enabled: true
autoApply: true
---
## 규칙
- NEON-배치모니터링에서 [NEON-BATCH] 포함 registered 태스크 찾기
- 같은 배치명 3건 이상 → "반복 실패" 경고

## 출력 형식
- ⚠️ [배치명] N회 반복 실패 — 즉시 조치 필요
\`\`\`

---

## 터미널

- **⌘T**: 새 탭 열기 (~에서 시작)
- **⌘W**: 현재 탭 닫기
- **⌘1~9**: 탭 번호로 전환
- 다른 탭으로 이동해도 **터미널 세션 유지**
- 앱 종료 시 **출력 기록 자동 저장** → 재시작 시 복원

---

## 사용량 대시보드

- **요약 카드**: 총 비용, 일 평균, 토큰, API 호출, 캐시 히트율, 세션 수
- **차트 4종**: 일별 토큰, 일별 비용 추이, 모델별 비용 파이, 시간대별 패턴
- **모델별 상세 테이블**
- **AI 인사이트**: 버튼 클릭 → 사용 패턴 한국어 분석 리포트

---

## 세션 탐색기

사이드바 💬 아이콘으로 접근. Claude Code CLI의 모든 세션을 검색하고 탐색할 수 있습니다.

### 기능
- **검색**: 대화 내용, 프로젝트명, 세션 ID로 전체 세션 검색
- **프로젝트 필터**: 드롭다운으로 특정 프로젝트 세션만 보기
- **대화 미리보기**: 세션 클릭 시 user/assistant 대화 내용 표시
- **AI 요약**: 세션 내용을 한국어 3~5줄로 요약 (무슨 작업을 했는지)
- **resume 복사**: \`claude -r <session-id>\` 명령어를 클립보드에 복사 → 터미널에서 바로 이어하기

### 활용법
1. "뭔가 했었는데 기억 안 나..." → 검색으로 키워드 입력
2. 세션 찾기 → AI 요약으로 내용 확인
3. resume 복사 → 터미널에서 이어하기

---

## 단축키 요약

| 단축키 | 동작 | 위치 |
|--------|------|------|
| \`⌘T\` | 새 터미널 탭 | 터미널 |
| \`⌘W\` | 터미널 탭 닫기 | 터미널 |
| \`⌘1~9\` | 터미널 탭 전환 | 터미널 |
| \`ESC\` | 태스크 상세 패널 닫기 | 태스크 |

---

## 설정

### 프로젝트 필터 (⚙ 버튼)
- 태스크/위키 각각 **독립된 프로젝트 선택** (공유 안 됨)
- 선택 없으면 전체 표시
- 변경 즉시 반영

### 캘린더 필터 (⚙ 버튼)
- 표시할 캘린더 선택 (영구 저장)
- 이벤트 수 카운트 표시

### 두레이 연결
- 최초 실행 시 개인 API 토큰 입력
- 토큰은 macOS 키체인에 안전하게 저장
- "연결 해제" 버튼으로 토큰 삭제 후 재설정 가능`
  },
  {
    id: 'start', icon: Terminal, title: '시작하기',
    content: `# 시작하기

## 설치
\`\`\`bash
# npm으로 설치
npm install -g @anthropic-ai/claude-code

# 또는 특정 버전
claude install stable
claude install latest
\`\`\`

## 인증
\`\`\`bash
claude auth login          # 브라우저로 로그인
claude setup-token         # API 토큰 직접 설정 (CI/CD용)
claude auth status         # 인증 상태 확인
\`\`\`

## 기본 사용
\`\`\`bash
claude                     # 인터랙티브 세션 시작
claude "이 코드 리팩토링 해줘"  # 프롬프트와 함께 시작
claude -p "질문"            # 답변만 출력하고 종료 (파이프용)
\`\`\`

## 세션 이어하기
\`\`\`bash
claude -c                  # 현재 폴더의 마지막 세션 이어하기
claude -r                  # 세션 선택 화면
claude -r "검색어"          # 세션 이름으로 검색
claude -n "배포 준비"        # 이름 붙여서 시작 → 나중에 재개 가능
\`\`\``
  },
  {
    id: 'interactive', icon: MessageSquare, title: '인터랙티브 명령어',
    content: `# 세션 내 슬래시 명령어

세션 진행 중 \`/\`로 시작하는 명령어를 사용할 수 있습니다.

## 필수 명령어
| 명령어 | 설명 | 사용 시점 |
|--------|------|----------|
| \`/help\` | 도움말 | 명령어가 기억 안 날 때 |
| \`/compact\` | 컨텍스트 압축 | 대화가 길어져서 느려질 때 (토큰 절약) |
| \`/clear\` | 대화 초기화 | 새 주제로 전환할 때 |
| \`/cost\` | 비용/토큰 확인 | 현재 세션 비용이 궁금할 때 |

## 모델 & 모드
| 명령어 | 설명 |
|--------|------|
| \`/model sonnet\` | Sonnet으로 전환 (기본, 균형) |
| \`/model opus\` | Opus로 전환 (최고 성능, 비싸지만 정확) |
| \`/model haiku\` | Haiku로 전환 (빠르고 저렴) |
| \`/fast\` | Fast 모드 토글 (같은 모델, 빠른 출력) |

## 프로젝트 설정
| 명령어 | 설명 |
|--------|------|
| \`/init\` | CLAUDE.md 생성 (프로젝트 가이드) |
| \`/memory\` | 메모리 편집 (영구 저장되는 선호도) |
| \`/permissions\` | 권한 설정 확인/변경 |
| \`/doctor\` | 상태 점검 (MCP, 인증, 업데이트) |

## Git & 리뷰
| 명령어 | 설명 |
|--------|------|
| \`/review\` | 현재 변경사항 코드 리뷰 |
| \`/pr-comments\` | PR 코멘트 가져오기 |

## 커스텀 스킬
\`~/.claude/commands/배포.md\` 파일을 만들면 \`/배포\`로 실행 가능.
프로젝트별 스킬은 \`.claude/commands/\` 디렉토리에.`
  },
  {
    id: 'claudemd', icon: FileCode, title: 'CLAUDE.md 작성법',
    content: `# CLAUDE.md — 프로젝트 가이드

프로젝트 루트에 \`CLAUDE.md\`를 두면 **모든 세션에서 자동으로 읽힘**.
Claude에게 프로젝트의 규칙, 스택, 주의사항을 알려주는 가장 효과적인 방법.

## 기본 구조
\`\`\`markdown
# 프로젝트 가이드

## 기술 스택
- Java 17 + Spring Boot 3.x + MyBatis
- TypeScript + React 18 + Tailwind CSS
- MySQL 8.0, ClickHouse

## 빌드 & 테스트
\\\`\\\`\\\`bash
./gradlew build          # 빌드
./gradlew test           # 테스트
npm run dev              # 프론트엔드 개발 서버
\\\`\\\`\\\`

## 코딩 규칙
- 커밋 메시지: Conventional Commits (feat:, fix:, refactor:)
- Java: Google Style Guide
- 모든 금액은 BigDecimal 사용 (부동소수점 금지)
- SQL 컬럼 순서는 MySQL 원본 테이블과 동일하게 유지

## 디버깅 규칙
- 근본 원인을 찾기 전에 수정하지 말 것
- 가설을 세우고 사용자 확인 후 수정
- "수정됨"이라고 단정짓지 말고 "확인해주세요"로 끝낼 것

## 주의사항
- /src/main/resources/mapper/ 의 MyBatis XML 수정 시 null 처리 확인
- ClickHouse DDL 작성 시 MySQL 원본 컬럼 순서 반드시 확인
\`\`\`

## 효과적인 CLAUDE.md 팁
1. **구체적인 명령어** 포함 (빌드, 테스트, 배포)
2. **하지 말아야 할 것** 명시 (안티패턴)
3. **자주 실수하는 패턴** 경고
4. 200줄 이내로 유지 (너무 길면 효과 감소)`
  },
  {
    id: 'models', icon: Cpu, title: '모델 선택 가이드',
    content: `# 모델 선택 가이드

## 모델별 특성

### Claude Opus 4.6 (\`opus\`)
- **최고 성능** — 복잡한 아키텍처 설계, 대규모 리팩토링, 정밀한 분석
- **1M 토큰 컨텍스트** — 거대한 코드베이스 한 번에 이해
- 비용: 입력 $15/M, 출력 $75/M
- **이럴 때 사용**: 아키텍처 설계, 복잡한 버그 디버깅, 중요한 코드 리뷰

### Claude Sonnet 4.6 (\`sonnet\`) — 기본
- **균형** — 대부분의 코딩 작업에 충분
- 비용: 입력 $3/M, 출력 $15/M (Opus의 1/5)
- **이럴 때 사용**: 일반 개발, 기능 구현, 테스트 작성

### Claude Haiku 4.5 (\`haiku\`)
- **가장 빠르고 저렴** — 간단한 질문, 코드 검색
- 비용: 입력 $0.8/M, 출력 $4/M (Sonnet의 1/4)
- **이럴 때 사용**: 코드 설명, 간단한 수정, 검색

## 실전 사용 패턴
\`\`\`bash
# 복잡한 설계는 Opus
claude --model opus "이 시스템의 아키텍처를 개선해줘"

# 일반 개발은 Sonnet (기본)
claude "로그인 기능 추가해줘"

# 빠른 질문은 Haiku
claude --model haiku -p "이 에러 뭐야?"

# 세션 중 모델 전환
/model opus     # 어려운 부분만 Opus로
/model sonnet   # 다시 Sonnet으로
\`\`\`

## 비용 절약 핵심
- **캐시 히트율**이 핵심: 같은 파일을 반복 참조하면 90% 할인
- \`/compact\` 자주 사용: 불필요한 컨텍스트 정리
- \`--effort low\`: 간단한 작업에 저노력 모드
- \`--max-budget-usd 1.0\`: 비용 상한 설정`
  },
  {
    id: 'mcp', icon: Settings, title: 'MCP 서버 연동',
    content: `# MCP (Model Context Protocol)

외부 도구, 데이터베이스, API를 Claude에 연결하는 프로토콜.
Claude가 직접 DB를 조회하거나, 외부 서비스를 호출할 수 있게 됨.

## MCP 서버 추가
\`\`\`bash
# CLI로 추가
claude mcp add 이름 명령어 인자...
claude mcp add my-db npx -y mcp-remote http://localhost:3000/mcp

# 상태 확인
claude mcp list
\`\`\`

## 설정 파일 (~/.claude.json)
\`\`\`json
{
  "mcpServers": {
    "dooray-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://10.161.64.23:20002/mcp"]
    },
    "mcp-clickhouse": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://10.161.64.23:20003/mcp"]
    },
    "mysql-db": {
      "command": "/path/to/venv/bin/python",
      "args": ["/path/to/mysql-mcp/server.py"]
    }
  }
}
\`\`\`

## 프로젝트별 MCP (.mcp.json)
프로젝트 루트에 \`.mcp.json\`을 두면 해당 프로젝트에서만 활성화.

## MCP 도구 권한 허용
\`\`\`bash
# 특정 MCP 서버 전체 허용
claude --allowedTools "mcp__dooray-mcp__*"

# 여러 서버 허용
claude --allowedTools "mcp__dooray-mcp__*,mcp__mysql-db__*"
\`\`\`

## 유용한 MCP 서버 예시
- **Dooray MCP**: 두레이 태스크, 위키, 캘린더 연동
- **MySQL/PostgreSQL MCP**: DB 직접 조회
- **ClickHouse MCP**: 분석 쿼리 실행
- **Grafana MCP**: 모니터링 메트릭 조회
- **GitHub MCP**: 이슈, PR 관리`
  },
  {
    id: 'skills', icon: Zap, title: '커스텀 스킬',
    content: `# 커스텀 스킬 (슬래시 명령어)

반복 작업을 \`.md\` 파일로 정의하여 \`/명령어\`로 실행.

## 스킬 위치
\`\`\`
~/.claude/commands/         # 전역 스킬 (모든 프로젝트)
.claude/commands/           # 프로젝트 스킬 (해당 프로젝트만)
\`\`\`

## 스킬 작성법

### 기본 예시: /deploy
\`\`\`markdown
# ~/.claude/commands/deploy.md
배포 전 체크리스트를 확인하고 배포를 진행합니다.

1. git status로 커밋 안 된 변경사항 확인
2. 테스트 실행 (./gradlew test)
3. 빌드 확인 (./gradlew build)
4. 현재 브랜치가 develop인지 확인
5. 모두 통과하면 배포 명령 실행
\`\`\`

### 변수 사용: /review-pr
\`\`\`markdown
# ~/.claude/commands/review-pr.md
PR #$ARGUMENTS 를 리뷰합니다.

1. PR 변경사항을 모두 읽기
2. 코딩 규칙 위반 확인
3. 잠재적 버그 분석
4. 성능 이슈 확인
5. 심각도별 정리 (Critical > High > Medium > Low)
\`\`\`
실행: \`/review-pr 123\`

### 실전 유용 스킬
\`\`\`markdown
# ~/.claude/commands/daily.md
오늘의 업무 정리를 도와줍니다.

1. git log --since="today" 로 오늘 커밋 확인
2. 변경된 파일 목록 정리
3. 완료/진행중/예정 업무로 분류
4. 마크다운 보고서 형태로 출력
\`\`\``
  },
  {
    id: 'hooks', icon: Wrench, title: '훅 (자동화)',
    content: `# 훅 — 이벤트 기반 자동화

특정 이벤트(파일 편집, 명령 실행 등)에 자동으로 셸 명령을 실행.

## 설정 (~/.claude/settings.json)
\`\`\`json
{
  "hooks": {
    "postToolExecution": [
      {
        "matcher": "Edit|Write",
        "command": "bash -c 'if [[ \\"$CLAUDE_FILE\\" == *.ts ]]; then npx tsc --noEmit 2>&1 | head -20; fi'"
      }
    ]
  }
}
\`\`\`

## 유용한 훅 예시

### TypeScript 자동 타입 체크
파일 편집 후 자동으로 \`tsc\` 실행 → 컴파일 에러 즉시 감지.

### ESLint 자동 실행
\`\`\`json
{
  "matcher": "Edit|Write",
  "command": "bash -c 'if [[ \\"$CLAUDE_FILE\\" == *.ts ]]; then npx eslint \\"$CLAUDE_FILE\\" --fix 2>&1 | tail -5; fi'"
}
\`\`\`

### 커밋 전 테스트
\`\`\`json
{
  "matcher": "Bash(git commit*)",
  "command": "npm test 2>&1 | tail -10"
}
\`\`\`

## 훅 이벤트 종류
| 이벤트 | 시점 |
|--------|------|
| \`postToolExecution\` | 도구 실행 후 |
| \`preToolExecution\` | 도구 실행 전 |
| \`sessionStart\` | 세션 시작 시 |
| \`sessionEnd\` | 세션 종료 시 |`
  },
  {
    id: 'agents', icon: Bot, title: '에이전트',
    content: `# 에이전트 — 역할 기반 AI

특정 역할과 프롬프트가 미리 정의된 AI 페르소나.

## 에이전트 정의
\`\`\`bash
# 인라인 정의
claude --agents '{
  "reviewer": {
    "description": "코드 리뷰 전문가",
    "prompt": "당신은 시니어 개발자입니다. 코드 품질, 보안, 성능을 엄격히 검토합니다."
  },
  "writer": {
    "description": "기술 문서 작성자",
    "prompt": "개발 문서를 명확하고 구조적으로 작성합니다."
  }
}'

# 에이전트로 실행
claude --agent reviewer "이 PR 리뷰해줘"
claude --agent writer "이 모듈 문서화해줘"
\`\`\`

## 에이전트 목록 확인
\`\`\`bash
claude agents list
\`\`\`

## 실전 에이전트 예시

### 버그 헌터
\`\`\`json
{
  "bug-hunter": {
    "description": "버그 분석 전문가",
    "prompt": "근본 원인을 찾을 때까지 가설을 세우고 검증합니다. 수정 전에 반드시 재현 테스트를 작성합니다."
  }
}
\`\`\`

### 테스트 작성자
\`\`\`json
{
  "tester": {
    "description": "테스트 코드 전문가",
    "prompt": "JUnit 5 + Mockito로 테스트를 작성합니다. 경계값, 예외 케이스, 정상 케이스를 모두 커버합니다."
  }
}
\`\`\``
  },
  {
    id: 'permissions', icon: Shield, title: '권한 시스템',
    content: `# 권한 시스템

Claude가 수행할 수 있는 작업을 세밀하게 제어.

## 권한 모드
| 모드 | 설명 | 추천 상황 |
|------|------|----------|
| \`default\` | 매번 확인 | 처음 사용, 중요한 프로젝트 |
| \`plan\` | 계획 수립 → 승인 후 실행 | 대규모 리팩토링 |
| \`acceptEdits\` | 파일 편집은 자동, 나머지 확인 | 일반 개발 (추천) |
| \`auto\` | AI가 위험도 판단 | 익숙한 프로젝트 |
| \`dontAsk\` | 대부분 자동 승인 | 신뢰할 수 있는 작업 |

## 도구별 세밀한 권한
\`\`\`json
// ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(npm test)",
      "Bash(npx tsc *)",
      "Read",
      "Edit",
      "mcp__dooray-mcp__*"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)"
    ]
  }
}
\`\`\`

## 권한 패턴 문법
\`\`\`
Bash(git *)              # git으로 시작하는 모든 명령
Bash(npm test)           # npm test만
Edit                     # 모든 파일 편집
Read(/src/**)            # /src 하위만 읽기
mcp__서버명__*           # 특정 MCP 서버 전체
mcp__서버명__도구명      # 특정 MCP 도구만
\`\`\``
  },
  {
    id: 'automation', icon: GitBranch, title: 'Git & 자동화',
    content: `# Git 통합 & 자동화

## Git 워크플로우
\`\`\`bash
# PR 기반 작업
claude --from-pr 123         # PR 컨텍스트로 시작
claude --from-pr              # PR 선택 화면

# Git Worktree (격리된 작업)
claude -w feature-x           # 별도 worktree에서 작업
claude -w --tmux              # tmux 세션과 함께

# 세션 중
/review                       # 현재 변경사항 리뷰
/pr-comments                  # PR 코멘트 확인
\`\`\`

## Headless 모드 (비대화형)
CI/CD, 크론잡, 스크립트에서 사용.
\`\`\`bash
# 기본
claude -p "이 코드 분석해줘" < code.py

# JSON 출력
claude -p "분석해줘" --output-format json

# 비용 제한
claude -p "작업해줘" --max-budget-usd 1.0

# 구조화된 출력
claude -p "목록 생성" --json-schema '{"type":"array","items":{"type":"string"}}'

# 스트리밍
claude -p "설명해줘" --output-format stream-json
\`\`\`

## 크론잡 예시
\`\`\`bash
# 매일 9시 Kafka 커넥터 상태 확인
0 9 * * * claude -p "Kafka 커넥터 상태 확인하고 실패한 것 재시작" \\
  --allowedTools "mcp__grafana*" --max-budget-usd 0.5

# 매주 월요일 주간 보고서
0 8 * * 1 claude -p "이번 주 git 커밋 분석해서 주간 보고서 작성" \\
  --output-format json > ~/reports/weekly-$(date +%Y%m%d).json
\`\`\``
  },
  {
    id: 'cost', icon: DollarSign, title: '비용 최적화',
    content: `# 비용 최적화 가이드

## 모델별 비용 (1M 토큰)
| | 입력 | 출력 | 캐시 읽기 (90%↓) | 캐시 생성 (25%↑) |
|---|---|---|---|---|
| **Opus** | $15 | $75 | $1.5 | $18.75 |
| **Sonnet** | $3 | $15 | $0.3 | $3.75 |
| **Haiku** | $0.8 | $4 | $0.08 | $1.0 |

## 비용 절약 전략

### 1. 적절한 모델 선택
\`\`\`bash
# 간단한 질문 → Haiku
claude --model haiku -p "이 에러 뭐야?"

# 일반 개발 → Sonnet (기본)
claude "기능 추가해줘"

# 정말 어려운 것만 → Opus
claude --model opus "아키텍처 리뷰"
\`\`\`

### 2. 컨텍스트 관리
- \`/compact\` 자주 사용 (불필요한 대화 정리)
- \`/clear\` 후 새 주제 시작
- 세션당 1~2개 작업에 집중 (멀티태스킹 ❌)

### 3. 캐시 활용
- 같은 파일을 반복 참조하면 **90% 할인**
- 한 세션에서 관련 작업을 모아서 처리

### 4. 비용 제한
\`\`\`bash
claude -p "작업" --max-budget-usd 1.0   # 최대 $1
/cost                                     # 세션 중 비용 확인
\`\`\`

### 5. Effort 조절
\`\`\`bash
claude --effort low -p "간단한 질문"      # 저노력 (빠르고 저렴)
claude --effort max "복잡한 분석"         # 최대 노력
\`\`\``
  },
  {
    id: 'config', icon: Settings, title: '설정 파일 구조',
    content: `# 설정 파일 구조

## 파일 위치
\`\`\`
~/.claude/
├── settings.json          # 전역 설정 (권한, 훅, 환경변수)
├── memory/                # 영구 메모리 (사용자 선호도)
├── commands/              # 전역 커스텀 스킬 (.md)
├── projects/              # 프로젝트별 세션 기록
└── usage-data/            # 사용량 데이터

~/.claude.json              # MCP 서버 설정

프로젝트/
├── CLAUDE.md              # 프로젝트 가이드 (자동 로드)
├── .claude/
│   └── commands/          # 프로젝트 스킬
└── .mcp.json              # 프로젝트 MCP 설정
\`\`\`

## settings.json 예시
\`\`\`json
{
  "model": "sonnet",
  "permissions": {
    "allow": ["Bash(git *)", "Read", "Edit"],
    "deny": ["Bash(rm -rf *)"]
  },
  "hooks": {
    "postToolExecution": [...]
  },
  "env": {
    "CUSTOM_VAR": "value"
  }
}
\`\`\`

## 환경 변수
| 변수 | 설명 |
|------|------|
| \`ANTHROPIC_API_KEY\` | API 키 (직접 인증) |
| \`CLAUDE_CODE_SIMPLE\` | 간소화 모드 |
| \`CLAUDE_MODEL\` | 기본 모델 오버라이드 |`
  },
  {
    id: 'tips', icon: Search, title: '실전 팁 모음',
    content: `# 실전 팁 모음

## 🎯 프롬프트 작성법

### 좋은 프롬프트
\`\`\`
"sd_invoice 테이블에서 amount 합계가 소수점 오류 나는 버그 수정해줘.
- 프론트엔드 문제 아님 (이미 확인함)
- Big.js 문제도 아님
- TUI Grid의 sum 함수 쪽을 확인해봐"
\`\`\`

### 나쁜 프롬프트
\`\`\`
"금액 버그 수정해줘"
→ Claude가 여러 방향으로 탐색하다 시간 낭비
\`\`\`

## 🔑 핵심 원칙

1. **제약 조건을 먼저** — "이건 아니야"를 먼저 말해주면 잘못된 접근 방지
2. **한 세션 한 작업** — 3개 이상 동시에 하면 품질 저하
3. **가설 확인 요청** — "수정하기 전에 원인 분석부터 보여줘"
4. **단계별 진행** — "먼저 관련 파일 읽고 → 분석 → 확인받고 → 수정"

## ⚡ 시간 절약 단축키
| 행동 | 방법 |
|------|------|
| 이전 세션 이어하기 | \`claude -c\` |
| 세션 이름으로 재개 | \`claude -r "이름"\` |
| 빠른 질문 | \`claude --model haiku -p "질문"\` |
| 파이프 입력 | \`cat file | claude -p "분석"\` |
| 비용 확인 | \`/cost\` |
| 토큰 절약 | \`/compact\` |

## 🐛 디버깅 시 추천 패턴
\`\`\`
"[버그 설명]을 디버깅해줘.

제약 조건:
1. [이미 확인한 것] — 여기는 문제 아님
2. [의심되는 부분]을 중심으로 확인
3. 수정 전에 원인 분석 먼저 보여줘
4. 재현 테스트 작성 후 수정

하지 말 것:
- 관련 없는 코드 리팩토링
- 가설 없이 바로 수정 시도"
\`\`\``
  }
]

function ClaudeManual(): JSX.Element {
  const [activeSection, setActiveSection] = useState('start')
  const [searchQuery, setSearchQuery] = useState('')

  const section = SECTIONS.find((s) => s.id === activeSection)
  const filtered = searchQuery
    ? SECTIONS.filter((s) => s.title.includes(searchQuery) || s.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : SECTIONS

  return (
    <div className="h-full flex">
      <div className="w-52 flex-shrink-0 bg-bg-surface border-r border-bg-border flex flex-col">
        <div className="px-3 py-3 border-b border-bg-border">
          <div className="flex items-center gap-1.5 mb-1">
            <Book size={14} className="text-clover-blue" />
            <span className="text-xs font-semibold text-text-primary">Claude Code 매뉴얼</span>
          </div>
          <div className="mt-2 relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="검색..."
              className="w-full pl-6 pr-2 py-1 bg-bg-primary border border-bg-border rounded text-[10px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clover-blue" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map((s) => {
            const Icon = s.icon
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  activeSection === s.id ? 'bg-clover-blue/10 text-clover-blue border-r-2 border-clover-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}>
                <Icon size={13} className={activeSection === s.id ? 'text-clover-blue' : 'text-text-tertiary'} />
                <span className="text-xs font-medium">{s.title}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {section && (
          <div className="max-w-3xl mx-auto markdown-body text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{section.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClaudeManual
