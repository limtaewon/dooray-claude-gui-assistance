/**
 * harnessEditPrompt.ts — Harness Studio AI 편집제안 프롬프트 빌더 (순수 함수)
 *
 * AIService.proposeEdit 가 runClaudeStream 에 전달할
 * system prompt / user prompt 를 구성한다.
 *
 * 계약 (arch §5.2):
 * - 자연어 명령 + 대상 파일들의 현재 전문을 주고,
 *   변경된 파일의 전체 내용을 JSON 으로 반환하라.
 * - 출력 형식: { "proposals": [{ "relPath", "newContent", "rationale" }] }
 * - relPath 는 제공된 화이트리스트 내에서만 반환하도록 명시.
 * - 순수 JSON, trailing comma 금지 (normalizePrompt 규칙 재사용).
 *
 * 제약:
 * - 이 파일은 순수 함수만 담는다. electron / Node fs 의존 금지.
 * - 반환 값은 string 이며 외부 상태 변경 없음.
 */

/**
 * AI 편집제안용 system prompt.
 *
 * 파일 전체 내용을 JSON 으로 반환하는 계약과
 * relPath 화이트리스트 강제를 명시한다.
 *
 * unified diff 가 아닌 전체 파일 내용을 반환하는 이유 (arch §5.2):
 * - LLM 의 diff hunk 라인번호/컨텍스트는 부정확.
 * - 전체 내용은 적용이 결정론적(파일 통째 교체).
 * - diff 는 main/renderer 가 baseContent ↔ newContent 로 직접 계산(Monaco DiffEditor).
 */
export function buildEditSystemPrompt(): string {
  return `당신은 AI 에이전트 하네스(agentic harness/workflow) 번들 파일 편집 전문가입니다.
사용자의 자연어 명령을 받아 지정된 파일들을 수정한 전체 내용을 JSON 으로 반환합니다.

## 절대 규칙
1. 응답은 **순수 JSON 만** — 설명 텍스트, 마크다운 코드블록, 주석 일절 금지.
2. 변경이 필요한 파일만 proposals 에 포함. 변경 없는 파일은 생략.
3. relPath 는 반드시 제공된 **화이트리스트 파일 목록 안에서만** 사용. 목록에 없는 파일 경로 생성 금지.
4. newContent 는 **파일 전체 내용** — unified diff, 부분 패치, 라인번호 참조 금지.
5. **마지막 요소 뒤 쉼표(trailing comma) 절대 금지**, 모든 괄호/중괄호를 반드시 닫을 것.
6. frontmatter 를 수정할 때는 YAML 구조를 안전하게 유지하고 다른 필드를 훼손하지 말 것.
7. 명령 범위 밖의 내용은 그대로 보존.

## 출력 형식
{
  "proposals": [
    {
      "relPath": "번들 루트 기준 상대경로",
      "newContent": "수정된 파일 전체 내용",
      "rationale": "이 파일을 어떻게 왜 수정했는지 한국어 한두 문장"
    }
  ]
}

proposals 가 빈 배열이면 수정할 파일이 없다는 의미 — 그래도 위 JSON 형식은 유지할 것.`.trim()
}

/**
 * AI 편집제안용 user prompt.
 *
 * 사용자 자연어 명령과 대상 파일들의 현재 전문을 함께 전달한다.
 * AI 는 명령에 따라 필요한 파일만 수정한 전체 내용을 반환한다.
 *
 * @param command - 사용자 자연어 명령 (예: "보안검토자를 opus 모델로 바꿔줘")
 * @param targetFiles - 편집 대상 파일 목록 ({ relPath, content } 배열)
 * @returns user prompt 문자열
 *
 * 제약:
 * - targetFiles 의 relPath 목록을 화이트리스트로 명시해 AI 가 범위 밖 파일을 생성하지 못하게 한다.
 * - 파일 내용은 "현재 파일 내용" 섹션으로 분리해 컨텍스트를 명확히 한다.
 */
export function buildEditUserPrompt(
  command: string,
  targetFiles: { relPath: string; content: string }[]
): string {
  const whitelistText = targetFiles.map((f) => `- ${f.relPath}`).join('\n')

  const filesSection = targetFiles.map((f) => {
    const fence = '```'
    return `### ${f.relPath}\n${fence}\n${f.content}\n${fence}`
  }).join('\n\n')

  return `## 편집 명령
${command}

## 편집 가능한 파일 화이트리스트 (이 목록 밖의 relPath 절대 금지)
${whitelistText}

## 현재 파일 내용
${filesSection}

## 요청
위 명령에 따라 필요한 파일을 수정해 전체 내용을 JSON 으로 반환하세요.
proposals 의 relPath 는 반드시 위 화이트리스트 안에서만 사용하세요.
수정하지 않는 파일은 proposals 에 포함하지 마세요.`.trim()
}
