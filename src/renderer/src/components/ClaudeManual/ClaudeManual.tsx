import { useState, useMemo } from 'react'
import { Book, Terminal, Zap, Settings, MessageSquare, GitBranch, Shield, Cpu, Search, DollarSign, Wrench, Bot, FileCode, Clover, Workflow } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import ClaudeMdCatalogView from './ClaudeMdCatalogView'

interface Section { id: string; icon: typeof Book; title: string; content: string }

const SECTIONS: Section[] = [
  {
    id: 'whats-new-v153', icon: Zap, title: 'v1.5.3 변경사항',
    content: `# v1.5.3 — 오류 리포트 인프라

AI 호출(브리핑·AI 채우기·요약·보고서 등)이 실패하면 **🐞 리포트 버튼** 이 토스트 또는 에러 화면에 같이 표시됩니다. 클릭하면:

- **진단 정보 자동 수집** — Claude CLI 호출 로그(최근 5건의 prompt·stdout·stderr·exit code) + 시스템 정보(OS / 앱·Node·Electron 버전) 가 자동으로 채워집니다.
- **편집 후 보내기** — 민감정보가 있으면 직접 지우고 보낼 수 있습니다.
- **두 가지 게시처**:
  - 🌐 **커뮤니티에 게시** — Clauday 두레이 커뮤니티에 본인 계정으로 글 등록. 같은 문제 다른 사용자도 보고 워크어라운드 공유 가능
  - 📋 **클립보드 복사** — 직접 두레이 메신저에 붙여넣기

자동 진단 로그는 \`<userData>/logs/claude-cli.log\` (JSONL, ring buffer 50건) 에 저장됩니다. Windows 기준 \`%APPDATA%\\clauday\\logs\\claude-cli.log\`.
`
  },
  {
    id: 'feedback', icon: MessageSquare, title: '피드백 보내기',
    content: `# 피드백 시스템

오류 / 기능 요청 / 개선을 어디서나 보낼 수 있습니다.

## 단축키
- **Mac**: \`Cmd+Shift+B\`
- **Windows**: \`Ctrl+Shift+B\`

## 사이드바 버튼
사이드바 하단의 **💬 피드백** 버튼을 클릭하면 모달이 열립니다.

## 카테고리
| 아이콘 | 카테고리 | 설명 |
|--------|----------|------|
| 🐞 | **오류** | 버그 리포트. 진단 정보가 자동 포함됩니다 |
| ✨ | **기능요청** | 새로운 기능 제안 |
| 💡 | **개선** | 기존 기능 개선 제안 |

## 전송 후
피드백은 **Ultra Agent 채널**로 즉시 전달되며, 처리 결과는 **PR/이슈**로 회신됩니다.

## 클립보드 복사
전송 실패 시 (Hook URL 미설정 등) 자동으로 클립보드에 복사됩니다. 두레이 메신저에 붙여넣어 공유하세요.`
  },
  {
    id: 'harness-studio', icon: Workflow, title: 'Harness Studio',
    content: `# Harness Studio

bmad 번들(reined-bmad, neon-bmad 등)을 가져와 에이전트 구조, 레벨 체인, 게이트, 산출물을 시각화하는 분석 도구.

## 사이드바에서 열기

사이드바의 **Harness Studio** 항목(Workflow 아이콘)을 클릭합니다.

## Import 4단계 위저드 (M4)

1. **소스 선택** — bmad 번들 폴더를 세 가지 방법으로 지정합니다.
   - 드롭존에 폴더 드래그
   - **폴더 선택** 버튼으로 다이얼로그 열기
   - **~/.claude/skills 스캔** 버튼으로 자동 발견 목록에서 선택
2. **구조 인식** — AI 없이 즉시 표시. 파일 트리, 감지된 에이전트 스텁, 경고 메시지를 확인합니다.
   - 번들 종류(bundle / overlay / partial-skill / task)가 잘못 감지된 경우 **교정** 버튼으로 수동 변경 가능
3. **AI 정규화** — Opus가 레벨 체인·역할·산출물 관계 등을 산문에서 추출합니다.
   - 진행률이 실시간으로 표시됩니다 (캐시 hit 시 즉시)
   - 완료 후 필드 출처(정적/AI/파생/없음) 요약을 확인할 수 있습니다
4. **확정·개인화** — 오버레이 반영·용어 번역 토글(P3) 후 **Harness Studio 열기**를 클릭합니다.

## 최근 하네스 재오픈

Harness Studio 랜딩 화면에 **최근 하네스** 목록이 표시됩니다. 클릭하면 캐시에서 즉시 불러옵니다.

## 신뢰도 배지 (Provenance)

각 필드 옆에 붙은 작은 배지로 값의 출처를 확인할 수 있습니다:

| 배지 | 의미 |
|------|------|
| **정적** | 파일 / frontmatter 에서 직접 읽음 (가장 신뢰도 높음) |
| **AI** | Sonnet이 산문 분석으로 추정 |
| **파생** | 규칙 기반 파생 — AI 없음 |
| **없음** | 번들에 해당 정보 없음 |

## Flow Canvas (M5)

하네스를 열면 **Flow Canvas** 탭이 기본으로 활성화됩니다.

### L0~L3 레벨 토글
탭 바 상단의 세그먼트 탭으로 레벨을 전환합니다.
- 선택된 레벨의 agentChain 에 속한 에이전트는 **활성(불투명)** 으로 표시됩니다.
- 해당 레벨에 없는 에이전트는 **흐림(dimmed)** 처리되어 전체 구조를 한눈에 파악할 수 있습니다.
- 병렬 실행 그룹(parallelInChain)에 속한 에이전트는 같은 컬럼에 세로로 배치됩니다.

### 노드 색상 규칙 (PhaseColor)
에이전트 노드 배경색은 역할(phaseClass)에 따라 DS 시맨틱 토큰으로 결정됩니다:

| 색상 | 역할 | phaseClass |
|------|------|-----------|
| 보라 | 분석가 | analyst |
| 주황 | PM·오케스트레이터 | pm / orchestrator |
| 파랑 | 아키텍트·QA | architect / qa |
| 노랑 | SM | sm |
| 초록 | 개발자·릴리즈 | dev / release |
| 빨강 | 보안 | security |

### 노드 정보
각 에이전트 노드에는:
- **모델 배지** — haiku(중립) / sonnet(파랑) / opus(주황) 색 구분
- **위험 아이콘** (⚠) — riskNote 있는 에이전트에 표시
- **AI 배지** — model 출처가 AI 추정인 경우 표시

### Agent Inspector 패널
노드를 클릭하면 오른쪽에 **Agent Inspector** 패널이 열립니다:
- 모델 및 출처(Provenance 배지)
- 역할(role)·페이즈 분류
- 허용 도구(tools) 목록
- 읽기(reads) / 쓰기(writes) 파일 경로
- 주된 위험(riskNote)
- 에스컬레이션 조건
- 허용 신호(signals)
- **AI 설명 버튼** — "AI 설명 생성"을 누르면 Sonnet이 해당 에이전트의 역할·동작을 자연어로 설명합니다

캔버스 빈 곳을 클릭하면 Inspector 가 닫힙니다.

### 오버레이 반영 (M8)
model.overlay 가 있는 하네스는 Flow Canvas 에 오버레이 효과가 반영됩니다:
- **비활성 에이전트** (disabledAgents): 흐림 처리 + overlayDisabled 배지
- **모델 오버라이드** (modelOverrides): 노드 모델 배지가 오버라이드 값으로 표시

### 핸드오프 엣지
에이전트 간 엣지에는 산출물 라벨이 표시되며, 조건부 핸드오프는 **점선**, QA RETURN 루프는 **노란 곡선 + RETURN 라벨** 으로 표시됩니다.

### 줌·팬
- 마우스 스크롤 또는 핀치: 줌 in/out
- 드래그: 캔버스 이동
- 우하단 Controls 버튼으로 fitView·줌 조절

## 주요 뷰

| 뷰 | 설명 |
|-----|------|
| **Dry-run** | 태스크 설명을 입력하면 예상 레벨·에이전트 경로·소요 단계를 추정. 프로젝트 폴더를 선택하면 코드베이스 맥락 기반으로 정확도가 높아짐 |
| **Skills/Blocks** | 에이전트별 역할 카드·도구 목록·합리화 방어 테이블 |
| **Gates** | 게이트 규칙 코드(R5xx / NEON-Gxx)·훅 종류·상태기계 전이 |
| **Artifacts** | 산출물 트리·persist 구분(git/ignore/dooray)·템플릿 스켈레톤 |
| **Score** | 6축 레이더 차트(강제력·제어흐름·상태·차단게이트·피드백루프·관측가능성) |
| **Doctor** | AI 없이 정적 정합 점검 — PASS/WARN/FAIL + 6축 약점 요약 |
| **Compare** | 캐시에서 다른 하네스를 선택해 에이전트/레벨/게이트/점수 diff 비교 |

## Dry-run — 프로젝트 폴더 선택

Dry-run 탭에서 **"프로젝트 폴더 선택"** 버튼을 누르면 폴더 선택 다이얼로그가 열립니다.

- 선택한 폴더의 기술스택 신호(package.json, CLAUDE.md, 디렉터리 구조 등)를 AI 레벨 추정 맥락으로 함께 전달해 **추정 정확도를 높입니다**.
- 선택 전: "선택 안 하면 태스크 텍스트만으로 추정합니다(근사)" 안내가 표시됩니다.
- 선택 후: 경로 오른쪽의 **X** 버튼으로 언제든지 취소할 수 있습니다.
- 결과 화면에서 **"프로젝트 맥락 기반 추정"** 배지(초록)가 보이면 폴더 맥락이 반영된 것입니다. 배지가 없으면 텍스트만으로 추정한 근사치이며, 실제 실행 시 코드베이스 기준으로 재판정될 수 있습니다.
- 프로젝트 폴더가 없어도 Dry-run은 동작합니다. 폴더는 선택 사항입니다.

## 헤더 버튼 (M8)

| 버튼 | 기능 |
|------|------|
| **Doctor** | Doctor 탭으로 이동 (정합 점검) |
| **Compare** | Compare 탭으로 이동 (다른 하네스와 diff) |
| **Export** | 현재 하네스를 HTML 리포트로 다운로드 (독립 HTML 파일, 새 의존성 없음) |

## Doctor — 정적 정합 점검 (M8)

AI 없이 즉시 실행되는 7가지 점검:
1. 체인 미포함 에이전트 (어떤 레벨에도 없는 에이전트)
2. 체인에 참조되나 정의 없는 에이전트
3. 소비자 없는 산출물 (핸드오프 체인 불완전)
4. 생산자 없는 산출물 (소비자 있는 경우 FAIL)
5. 게이트-페이즈 불일치 (gate.phase 가 에이전트 id와 다름)
6. model 미확인 에이전트 (unknown 모델)
7. score 결측 여부

점검 결과: **PASS**(초록) / **WARN**(노랑) / **FAIL**(빨강). FAIL 하나라도 있으면 전체 결과도 FAIL.

## Compare — 하네스 diff (M8)

최근 목록(캐시)에서 비교 대상을 선택하면 다음 항목의 차이를 표로 표시합니다:
- **에이전트**: 추가/제거/변경(모델·역할·도구 등)
- **레벨 체인**: 체인 에이전트 추가/제거
- **게이트**: 추가/제거/blocking 변경/규칙코드 변경
- **점수**: 6축 정규화 점수 변화량(+/-)

## 정적 스캔 vs AI 정규화

- **정적 스캔** (즉시): 파일 트리·frontmatter·게이트 규칙 코드 추출
- **AI 정규화** (Opus): 레벨 체인·역할·산출물 관계·점수 등 산문/스크립트에서 구조화
- 결과는 번들 해시 기반으로 캐시됨 → 재오픈 시 즉시 표시
- 부분 스킬(SKILL.md만 있는 번들)이나 파싱 실패 시 경고 메시지로 안내됩니다

## 편집 모드 (v1.8)

하네스를 열면 헤더에 **편집** 버튼이 표시됩니다. 클릭하면 편집 모드로 진입합니다.
편집 모드에서 read-only 뷰는 숨겨지며, 모드를 종료하면 기존 뷰가 그대로 복원됩니다.

### 편집 입력 3가지 경로

| 경로 | 설명 |
|------|------|
| **구조화 폼** | agent model 드롭다운 / tools 멀티셀렉트. frontmatter 역매핑이 가능한 필드만 |
| **파일 편집기** | Monaco 에디터로 번들 내 파일 원문 직접 편집. 좌측 파일 트리에서 선택 |
| **AI 명령** | "보안검토자를 opus 로 바꿔줘" 같은 자연어 → AI 가 파일 변경안 제안 → 사용자 승인 후 draft 반영 |

### 편집 가능 범위 (구조화 폼)

frontmatter 에서 역매핑이 가능한 필드만 폼 편집이 가능합니다:

| 필드 | 폼 가능? | 이유 |
|------|----------|------|
| agents[].model | 가능 | frontmatter model: 직접 대응 |
| agents[].tools | 가능 | frontmatter tools:/allowed-tools: 직접 대응 |
| agents[].id | 불가 (LOCK) | id 변경은 레벨/산출물 참조를 깨뜨림 |
| 레벨·역할·산출물 등 | 불가 (AI) | AI 가 산문에서 추론한 값, 파일 1:1 대응 없음 |
| 게이트 스크립트 | raw 전용 | 스크립트 의미론 보장 불가 |
| score | 불가 (LOCK) | 구조 변경 시 자동 재계산 |

### 초안(Draft) 시스템

편집은 파일에 즉시 저장되지 않습니다. 변경 사항이 in-memory 초안에 누적되며:
- 상단 바에 **"변경 N개"** 배지로 확인 가능
- 파일 편집기 하단의 **"draft 에 추가"** 버튼으로 반영

### 파일에 적용

"파일에 적용" 버튼 → **ApplyDialog** 에서 최종 확인:
1. 변경 파일 목록 확인
2. **.sh 파일 변경 시 빨간 경고** — 스크립트는 텍스트로만 저장, 자동 실행 없음
3. **충돌(STALE)** 파일 있으면 적용 불가 — Diff 탭에서 확인 후 되돌리기
4. 적용 전 자동 백업 생성 → 적용 성공 시 재정규화 자동 실행

### AI 편집 명령 (2단계 승인)

1. 상단 AI 입력란에 자연어 명령 입력 → **AI 편집 요청** 클릭
2. AI 가 대상 파일 분석 후 변경안 제안
3. **제안 diff 모달** 에서 변경 내용 확인 → 항목별 체크/해제 후 "draft 에 추가"
4. draft 에 반영된 후 일반 "파일에 적용" 흐름을 따름 (자동 쓰기 없음)

### Diff 뷰

상단 **Diff** 탭 → Monaco DiffEditor 로 파일별 원본 vs 초안 비교.
파일별 "되돌리기" 버튼으로 특정 파일 편집만 취소 가능.

### 백업 복원

상단 **백업 복원** 탭 → 이전 백업 목록 → 특정 시점으로 복원 (2단계 확인).
백업 위치: \`<userData>/harness-backups/<bundleName>/<타임스탬프>/\`
`
  },
  {
    id: 'whats-new-v15', icon: Zap, title: 'v1.5 변경사항',
    content: `# v1.5 변경사항

## 캘린더
- **CalDAV 자체 캘린더**로 전환. 두레이 토큰 외에 CalDAV 비번 추가 필요. 발급: \`https://nhnent.dooray.com/setting/calendar/caldav\`
- **막대 드래그로 일정 변경** — 막대 가운데를 잡아 이동, 좌·우 끝의 작은 핸들로 시작·종료일 리사이즈. CalDAV/내 일정 모두 가능
- **일정 클릭 편집** — 목록 뷰에서 일정 카드 클릭, 달력 뷰에서 상세 모달의 "편집" 버튼으로 제목·일시·위치·설명 수정 및 삭제
- **새로고침 버튼 서버 동기화** — 🔄 버튼이 CalDAV 서버와 전체 동기화(fullSync) 후 목록 갱신으로 변경됨
- **빠른 할 일 추가** — 헤더 아래 한 줄 입력란 + Enter → 오늘 종일 일정 즉시 등록. 캘린더를 todo 보드처럼 사용
- **공휴일**은 실제 쉬는 날만 노출 (식목일/스승의날/어버이날 등 기념일 제외)
- 한국식 \`등록된 순\` 정렬 — 우선순위(장기/종일/시작시각) 동률 시 등록순 타이브레이커

## 터미널 (Warp 스타일)
- **Cmd/Ctrl + 클릭으로 link 열기** — 파일 경로(코드/문서/이미지/zip 등), 디렉토리, http(s) URL 모두 OS 기본 핸들러로
- **이미지 사이드 패널** — PTY 출력에서 잡힌 이미지 경로를 우측 패널에 썸네일로 누적. 클릭 시 열기
- **위로 스크롤해 읽는 중엔 자동으로 안 내려감** — Claude 가 출력 중이어도 위로 올려둔 위치를 유지. 다시 바닥으로 내려가면 새 출력을 따라간다

## 채팅 · 세션
- **ChatPane 드롭존 확장** — input 한 줄이 아니라 Pane 전체에 파일 드래그·드롭 가능
- **세션 → 터미널 bypass 옵션** — SessionExplorer 의 \`bypass 복사\` 버튼, ChatPane "터미널" 버튼 Shift/Alt+클릭으로 \`--dangerously-skip-permissions\` 추가
- **세션 카드 미리보기 정리** — 마크다운 마커·연속 공백·메타 태그를 청소해 두 줄에서 깔끔히

## 공유
- **MCP 공유 카드 클릭 → 상세 모달** — JSON config 본문 노출 + 적용 버튼
- **스킬 공유 본문은 마크다운 렌더링** (이전엔 raw text)

## 빠른 태스크 (대시보드)
- AI 진입점을 본문 상단의 단일 패널로 통합. 자연어 한 줄 + "AI 채우기" → 제목·본문이 한 번에

## 키보드 단축키 & 알림
- **⌘E**: 최근 뷰 팝업 (IntelliJ Recent Files 식). 누른 채로 ⌘E 반복 → 다음 항목, ↑↓ 이동, Enter 선택, ⌘ 떼면 확정
- **AI 추천 새 글 알림** — 두레이 "AI 활용 사례" 프로젝트의 새 글을 1시간 폴링으로 감지해 OS 알림. 22~9시 보류. 설정 > 외관 & 동작 > 알림 에서 토글
- **CLAUDE.md 카탈로그** — 좌측 nav 의 새 항목. 앱 내장 템플릿을 폴더 선택해 \`CLAUDE.md\` 로 적용
`
  },
  {
    // #3 CLAUDE.md 카탈로그 — content 는 검색용 키워드만, 본문 렌더는 ClaudeMdCatalogView 가 담당
    id: 'claude-md-catalog', icon: FileCode, title: 'CLAUDE.md 카탈로그',
    content: 'CLAUDE.md 템플릿 카탈로그 — 앱 내장 템플릿을 프로젝트 폴더에 적용. general react-ts node-backend electron'
  },
  {
    id: 'clauday', icon: Clover, title: 'Clauday 앱 가이드',
    content: `# Clauday — 두레이 + Claude Code GUI

NHN Dooray 업무 관리와 Claude Code를 결합한 데스크톱 앱.
AI 설정(스킬 + MCP)을 기능별로 독립 관리하고, 필요하면 AI가 MCP로 데이터 수집까지 직접 수행.

---

## 🧭 사이드바 구성

### 작업 영역
| 아이콘 | 탭 | 설명 |
|--------|-----|------|
| 📅 | **두레이** | 대시보드 · 태스크 · 위키 · 캘린더 · 메신저 · 브리핑 · 보고서 · 팀 인사이트 |
| 📡 | **모니터링** | Grafana/Kafka/Server 상태 관측 |
| >_ | **터미널** | 내장 터미널 (Claude Code 실행) |
| 🌿 | **브랜치 작업** | Git worktree/브랜치 관리 |
| ↗ | **Harness Studio** | bmad 번들 시각화 — 에이전트 구조·레벨 체인·게이트·산출물 분석 |
| 👥 | **커뮤니티** | 팀 공유 공간 |

### 도구
| 아이콘 | 탭 | 설명 |
|--------|-----|------|
| 🗄 | **MCP 서버** | MCP 서버 설치/연결 |
| ✨ | **스킬** | AI 커스텀 스킬 관리 |
| 💡 | **AI 추천** | 공유 프로젝트 글 ↔ 내 설정 비교 → 도입 제안 |
| 💬 | **세션** | Claude Code 과거 세션 탐색/요약 |
| 📊 | **사용량** | 토큰/비용/인사이트 |

### 기타
📖 매뉴얼 · ⚙ 설정

---

## 🗂 두레이 탭 상세

### 대시보드
전체 태스크/일정/피드 현황 요약.

### 태스크
- **좌측**: 프로젝트 목록 (⚙로 표시 대상 선택, 수동 추가는 ID/URL 지원)
- **중앙**: 태스크 목록 (상태·태그 필터, 검색)
- **우측**: 태스크 상세 (ESC로 닫기, 드래그로 패널 크기 조절)
- 상세 패널: **AI 요약** · **두레이에서 보기** · 댓글(사람 작성만)
- 프로젝트 필터는 태스크 전용 \`customProjects\`로 저장 (위키와 분리)

### 위키
- **좌측**: 위키 도메인 목록 (⚙로 선택, 접기/펴기, 수동 추가 위키는 별도 \`customWikis\`)
- **중앙**: 계층형 페이지 트리 + 검색
- **우측**: 페이지 내용 (마크다운/HTML 렌더링, Dooray 이미지 자동 해상)
- **AI 도구** (Opus 기본):
  - 교정 · 개선 · 요약 · 구조 분석
- AI 결과를 **편집 후 "위키에 반영"** 으로 두레이에 직접 저장

### 캘린더
- 이번 주 일정 (종일=주황 / 시간=파랑 / 장기 2일+=초록)
- 제목 옆 ⚙ 아이콘: **표시할 캘린더 선택** (영구 저장)
- 제목 옆 🔄 아이콘: **서버 새로고침** — 클릭 시 두레이 CalDAV 서버와 전체 동기화 후 목록 재로드 (백그라운드 자동 동기화와 별개로 즉시 반영)
- **일정 클릭 → 편집/삭제 모달**: 목록 뷰에서 일정 카드를 클릭하면 편집 모달이 열림. 달력 뷰에서는 일정 막대 클릭 → 상세 보기 → "편집" 버튼으로 편집 모달 진입. 제목·시작/종료 일시·위치·설명 수정 가능. 공휴일은 읽기 전용.
- 우측: **AI 설정** · **AI 일정 분석** (빈 시간대, 연속 회의 경고, 집중 시간 추천)
- 일정 hover → **회의록 템플릿 생성** 버튼

### 메신저
채널/멤버 메시지 + AI 메시지 작성 도우미.

### 브리핑 (AI 업무 브리핑)
- **새 브리핑 생성** 버튼 클릭 → AI 분석
- 기본 모드: 서버가 담당/CC/마감 태스크 + 캘린더(⚙ 필터) pre-fetch → JSON 브리핑 생성
- **스킬 + MCP 위임 모드**: 브리핑 target 스킬 + MCP 서버가 모두 활성이면 pre-fetch를 건너뛰고 AI가 스킬 지시대로 MCP를 직접 호출
- 결과 구조: \`greeting\` / 긴급 / 오늘 집중 / 멘션 / 착수 필요 / 오늘 일정 / AI 제안
- **히스토리 12개 자동 저장**, 드롭다운에서 과거 브리핑 열람
- 👍/👎 **피드백** 수집 (스킬 개선 힌트)

### 보고서
- 세그먼트로 **일일/주간** 선택
- 기본 모드: 서버가 태스크 + 캘린더 pre-fetch → 마크다운 보고서
- 스킬+MCP 위임 모드 지원 (위와 동일)
- **편집/미리보기 토글**, **복사**, **.md 다운로드**
- 히스토리 20개 저장, 타입 chip(일일=파랑/주간=주황) 표시

### 팀 인사이트
팀원 활동·업무 집계.

---

## ⚡ AI 설정 (SkillQuickToggle)

브리핑/보고서/캘린더/AI추천 각 화면 우측의 **⚡ AI 설정** 버튼 하나에 두 가지가 통합됨:

### 1) 스킬 관리
- **템플릿**: 미리 정의된 스킬 빠르게 적용
- **✨ AI 생성**: 요구사항을 자연어로 → AI가 스킬 마크다운 생성
- **+ 직접**: 이름/설명/규칙 수동 작성
- 내보내기/가져오기 (.md 파일)

### 2) 기능별 MCP 서버 선택
- 이 기능에서 AI가 호출할 수 있는 MCP 서버만 체크박스로 허용
- 선택은 기능별로 저장 (\`settings.aiMcpSelection[feature]\`)
- MCP가 선택되어야 **위임 모드**가 동작

### 활성 상태 표시
버튼 라벨이 \`AI 설정 N\` (활성 스킬 수)로 변하며 앰버 컬러로 강조 (라이트/다크 모두 가독성 확보).

---

## 🧠 스킬+MCP 위임 모드

브리핑/보고서에서:
1. **스킬을 정의** (예: "캘린더 ID a,b 만 조회")
2. **MCP 서버 선택** (예: \`dooray-mcp\`)

→ 서버 pre-fetch 생략, AI가 스킬 규칙대로 \`mcp__dooray-mcp__get_all_events_of_calendars\` 등을 직접 호출

진행 중 stream preview에 실시간 표시:
- \`🔧 mcp__dooray-mcp__get_all_events_of_calendars {"calendars":"a,b"}\`
- \`   ↳ ✓ 12건 일정 수신\`

---

## 💡 AI 추천 탭

두 개 세부 탭:

### 글 읽기
- AI 활용 사례 공유 프로젝트 포스트를 페이지네이션(50/page)으로 리딩
- 인라인 **댓글 작성** 가능

### AI 추천
- 내 로컬 Claude Code 설정(스킬 + MCP)과 공유 프로젝트 글을 비교
- **즉시도입 / 참고 / 이미보유** 3분류 결과
- 결과는 \`~/.clauday/ai-recommend-cache.json\`에 캐시 → 다음 방문 시 즉시 로드
- 이 탭도 **AI 설정(스킬+MCP)** 적용 가능

---

## 💬 세션 탐색기

- 전체 세션 검색 (대화 내용 / 프로젝트 / ID)
- 프로젝트 필터
- **AI 요약**: 이 세션에서 무슨 작업 했는지 3~5줄
- **resume 복사**: \`claude -r <id>\` 클립보드 복사

---

## 📊 사용량 대시보드

- 요약 카드: 총 비용 · 일 평균 · 토큰 · 호출 수 · 캐시 히트율 · 세션 수
- 차트 4종 (일별 토큰/비용, 모델별 파이, 시간대 패턴)
- 모델별 상세 테이블
- **AI 인사이트** 버튼: 사용 패턴 한국어 분석 리포트

---

## 🎨 디자인/테마

- 상단 우측 ☀/🌙 토글로 **라이트/다크** 전환
- 라이트 팔레트 5종 선택 가능 (\`cool-minimal\`, \`crisp-white\`, \`soft-blue\`, \`graphite\`, \`paper\`)
- **글자 크기** (⚙ 설정 → 글꼴): 슬라이더로 0.75~1.6배 조절. **글자만 커지고 여백/레이아웃은 그대로** 유지 (전체 화면 줌이 아님). 화면 전체를 키우고 싶으면 메뉴 \`View → Zoom In\`(\`Cmd +\`)을 사용. 터미널 글자는 별도라 이 설정의 영향을 받지 않음
- 디자인 시스템 공용 컴포넌트:
  - \`.ds-btn\` variants: primary / ai / secondary / ghost / orange / icon / **skill-active**
  - \`.ds-seg\` (세그먼트 탭), \`.ds-chip\`, \`.ds-card\`, \`.ds-modal\`
- **AI 실행 버튼**(\`ai\` variant)은 오렌지→블루 그라디언트로 전 화면 통일
- **새로고침 버튼**은 모두 파란 primary 또는 파란 아이콘으로 통일

---

## ⚙ 설정 (SettingsView)

### AI 모델 (기능별 독립)
| 기능 | 기본 모델 |
|------|----------|
| AI 브리핑 | **Opus** |
| 일간/주간 보고서 | **Opus** |
| 위키 교정 / 개선 | Opus |
| 캘린더 분석 · 메신저 · 보고서 초안 | Sonnet |
| 태스크 요약 · 회의록 템플릿 | Haiku |

각 기능마다 Haiku/Sonnet/Opus 자유롭게 override 가능.

### 프로젝트 · 위키 필터
- 태스크: \`pinnedProjects\` + \`customProjects\`
- 위키: \`pinnedWikis\` + \`customWikis\` (완전 분리, 오염 방지)
- 캘린더: \`pinnedCalendars\`
- 현재 목록에 없는 stale ID는 자동 정리

### 두레이 연결
- 개인 API 토큰을 macOS 키체인에 저장
- 401/403 인증 실패일 때만 자동 삭제 (네트워크 오류로는 삭제 안 됨)
- "연결 해제" 버튼으로 수동 초기화

### API 키
ANTHROPIC_API_KEY를 앱에서 직접 입력 가능 (키체인 접근 불가능한 패키징 환경 대비).

---

## ⌨ 단축키

| 단축키 | 동작 | 위치 |
|--------|------|------|
| \`⌘T\` | 새 터미널 탭 | 터미널 |
| \`⌘W\` | 터미널 탭 닫기 | 터미널 |
| \`⌘1~9\` | 터미널 탭 전환 | 터미널 |
| \`⌘K\` | 커맨드 팔레트 | 전역 |
| \`ESC\` | 태스크 상세 패널 닫기 | 태스크 |

---

## 🗂 앱 저장 경로

\`\`\`
~/Library/Application Support/Clauday/
├── Settings/clauday-data.json     # 사용자 설정
├── briefings/                     # 브리핑 히스토리
~/.clauday/
├── ai-recommend-cache.json        # AI 추천 캐시
~/Library/Application Support/Clauday/
├── briefing/skills/*.md
├── report/skills/*.md
├── calendar/skills/*.md
├── aiRecommend/skills/*.md
├── wiki/skills/*.md
├── task/skills/*.md
└── all/skills/*.md                # 전체 타겟
\`\`\`

### 스킬 파일 형식 (Claude Code CLI와 동일)
\`\`\`markdown
---
name: 임태원-FI휴가-캘린더-브리핑
description: 임태원 개인 캘린더와 [공유] FI 휴가/부재 공유 캘린더의 일정만으로 브리핑 생성
enabled: true
---
## 규칙
- 브리핑 생성 시 아래 2개 캘린더 ID의 일정만 조회하여 사용한다.
  - 임태원: 3533031635679666602
  - [공유] FI 휴가/부재 공유: 3707299057598248558
- mcp__dooray-mcp__get_all_events_of_calendars 호출 시 calendars 파라미터에 위 두 ID만 콤마로 연결하여 전달
\`\`\`

---

## 🔎 트러블슈팅

**Q. 브리핑이 REST API만 호출하고 MCP를 안 써요.**
A. 해당 target(briefing)에 **활성 스킬 1개 이상** + AI 설정에서 **MCP 서버 1개 이상** 선택되어 있어야 위임 모드가 켜집니다. 둘 중 하나라도 비어있으면 기본(pre-fetch) 모드입니다.

**Q. 키체인에 저장이 안 되고 토큰을 매번 다시 입력해야 해요.**
A. 패키징 환경에서 키체인 접근이 제한될 수 있습니다. ⚙ 설정 → API/토큰 직접 입력 경로를 사용하세요.

**Q. "AI 응답에서 JSON을 찾지 못했습니다" 에러가 나요.**
A. 위임 모드에서 AI가 스킬의 텍스트 출력 형식을 우선했을 가능성이 있습니다. 스킬 내용에서 "## 출력 형식" 섹션을 제거하거나, "JSON 스키마로만 응답" 문구를 추가하세요. (실패 시 raw 텍스트는 greeting에 폴백됨)`
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

## MCP 서버 관리 (Clauday 앱)

### MCP 편집
- MCP 카드 우측의 **연필** 아이콘 클릭 → 인라인 편집 폼이 현재 설정으로 채워짐
- 서버 이름은 변경 불가 (키로 사용됨). 커맨드·인수·환경 변수·URL·헤더 수정 가능
- **수정** 버튼으로 저장 (즉시 \`~/.claude.json\` 에 반영)
- **활성/비활성 토글**: 카드 우측 ⚡ 버튼 — disabled 플래그로 토글

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

## 스킬 관리 (Clauday 앱)

### 스킬 편집
- 스킬 카드 우측 상단 **⋯** → **편집** 클릭 → 모달 에디터 열림
- 또는 카드 클릭으로도 에디터 바로 진입
- 수정 후 **저장** 버튼으로 파일에 반영

### AI로 스킬 개선
- 스킬 에디터 우측 상단의 **✨ AI 개선** 버튼 클릭
- 개선 지시 입력 예시: "단계를 더 구체적으로", "한국어 예시 추가", "출력 형식 명시"
- AI(Opus 모델)가 기존 스킬 내용을 바탕으로 개선안을 생성
- 결과를 검토 후 **에디터에 적용** → **저장** 순서로 반영 (자동 저장 없음)

### 공유 탭
위키 저장소(두레이 위키 페이지)에 스킬을 공유/관리.

- **내 스킬 공유하기** 버튼 → 내 스킬 목록에서 선택 → 위키에 업로드
- 이미 공유된 스킬은 "공유됨" 배지 + **업데이트** 버튼으로 최신 내용 재업로드
- 등록 위키가 2개 이상이면 어느 위키에 올릴지 선택하는 팝업이 표시됨
- 카드 클릭 → 스킬 내용 미리보기 + 내려받기 가능

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
  const [activeSection, setActiveSection] = useState('clauday')
  const [searchQuery, setSearchQuery] = useState('')

  const section = useMemo(() => SECTIONS.find((s) => s.id === activeSection), [activeSection])
  const filtered = useMemo(() => {
    if (!searchQuery) return SECTIONS
    const q = searchQuery.toLowerCase()
    return SECTIONS.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
  }, [searchQuery])

  return (
    <div className="h-full flex">
      <div className="w-52 flex-shrink-0 bg-bg-surface border-r border-bg-border flex flex-col">
        <div className="px-3 py-3 border-b border-bg-border">
          <div className="flex items-center gap-1.5 mb-1">
            <Book size={14} className="text-clauday-blue" />
            <span className="text-xs font-semibold text-text-primary">Claude Code 매뉴얼</span>
          </div>
          <div className="mt-2 relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="검색..."
              className="w-full pl-6 pr-2 py-1 bg-bg-primary border border-bg-border rounded text-[calc(10px_*_var(--app-font-scale,1))] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-clauday-blue" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map((s) => {
            const Icon = s.icon
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  activeSection === s.id ? 'bg-clauday-blue/10 text-clauday-blue border-r-2 border-clauday-blue' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}>
                <Icon size={13} className={activeSection === s.id ? 'text-clauday-blue' : 'text-text-tertiary'} />
                <span className="text-xs font-medium">{s.title}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'claude-md-catalog' ? (
          <ClaudeMdCatalogView />
        ) : section && (
          <div className="max-w-3xl mx-auto markdown-body text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{section.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClaudeManual
