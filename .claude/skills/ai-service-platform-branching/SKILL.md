---
name: ai-service-platform-branching
description: AIService.runClaudeStream 또는 ClaudeChatService 의 claude CLI spawn 코드를 수정할 때 Windows/Mac 분기 함정을 피하기 위한 안전 체크리스트. ai-service 또는 claude-chat 도메인 작업 시 반드시 트리거.
---

# ai-service-platform-branching

> Clauday 의 *가장 큰 운영 리스크* 가 여기 있다. 한쪽 플랫폼만 보고 통일하면 다른 쪽이 회귀.

## 트리거 조건

- `src/main/ai/AIService.ts` 의 `runClaudeStream` / `runClaude` 수정
- `src/main/claude/ClaudeChatService.ts` 의 spawn 부분 수정
- claude CLI argv 또는 stdin 모델 변경
- 새 CLI 옵션 도입 시

## 필독

1. 본 SKILL.md 끝까지
2. 레포 루트 `CLAUDE.md` 의 "AIService.runClaudeStream — Windows / macOS 분기 가이드"
3. `.agent/wiki/domain-ai-service.md` 의 §"Windows/Mac 분기 함정"

## 두 플랫폼이 *다른* 이유

```
              Mac/Linux                  Windows
              ─────────────              ─────────────
shell           false                     true (.cmd 추론)
verbatimArgs    false                     true (codepage 차단)
sysPrompt 위치  argv (--append-system-)   stdin prefix
user prompt 위치 stdin                    stdin
캐싱 효과       있음 (sysPrompt 캐싱)     없음 (sysPrompt 가 user 와 섞임)
응답 정상성     ✓                          ✓ (캐싱 손실 감수)
```

## 작업 전 안전 점검

[ ] 너의 변경이 `process.platform === 'win32'` 분기를 *대칭으로* 다루는가?
[ ] Mac 케이스만 보고 "이게 더 깔끔하니까 Windows 도 통일" 하지 않았는가?
[ ] Windows 케이스만 보고 "이걸로 충분하니 Mac 도 같게" 하지 않았는가?
[ ] system prompt 크기 변동 (몇 KB 늘어남) 이 Windows argv 한계에 닿지 않는가?
[ ] 새 CLI 옵션은 양쪽 argv 에서 *같은 위치* 에 있는가?

## 회귀 테스트 (양쪽 케이스 명시)

vitest 에서 `process.platform` 을 두 값으로 모두 검증:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('runClaudeStream — platform 분기', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('Mac: argv 에 --append-system-prompt 그대로 전달', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    // ... AIService 인스턴스 + spawn mock + argv 검사
  })

  it('Windows: --append-system-prompt 가 stdin prefix 로 합쳐짐', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    // ... 동일하지만 다른 검증
  })
})
```

> ⚠ vitest 가 *항상* Mac 에서만 도는 한, win32 케이스를 명시적으로 시뮬레이션 안 하면 회귀 잡을 방법 없음.

## 자주 무너지는 함정 4선 (CLAUDE.md 에서)

1. **양쪽 일관성 함정** — 동기가 다른 분기를 통일 X
2. **테스트 한쪽만** — `process.platform` 분기는 양쪽 mock 필수
3. **shell:true 의존성** — Windows shell:true 는 cmd 끼는데 그게 codepage/argv escape 문제 만듦. 손대지 말고 stdin 사용량을 늘리는 방향
4. **진단 로그 빠뜨림** — `cliLogger.startCliCall` 호출 누락 시 사용자 문제 제보 시 디버깅 불가

## 새 CLI 옵션 추가 시

1. claude --help 또는 공식 문서로 옵션 spec 확인
2. argv 의 *어느 위치* 에 와야 하는지 (위치 의존 옵션 vs flag)
3. 양쪽 분기에서 *동일한 위치/방식* 으로 추가
4. 큰 값 (수 KB+) 을 받는 옵션이면 → Windows argv 한계 검토 → 필요시 Windows 만 stdin 으로

## 새 fallback 패턴 추가 시

이미 있는 fallback:
- `accumulated` (stream_event 누적)
- `assistant` 메시지 마지막 텍스트 블록
- `rawStdout` (200KB cap, 평문 폴백)
- benign stderr → 빈 결과 통과

새 fallback 추가는 architect ADR 통해 정당화. 임의 추가 금지.

## 결과 출력

작업 후 본인이 채운 분기 안전 체크리스트를 impl-log.md 에 인용:

```md
## ai-service 분기 점검 (ai-service-platform-branching 스킬)

- [x] Mac/Win 양쪽 분기 대칭 변경
- [x] system prompt 크기 영향 없음 (변동 0)
- [x] 양쪽 케이스 vitest 추가
- [x] cliLogger 호출 유지
```
