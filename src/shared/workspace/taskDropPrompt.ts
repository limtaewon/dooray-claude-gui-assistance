/**
 * 업무를 터미널에 놓았을 때 claude 에 보낼 첫 지시 템플릿.
 *
 * 왜 템플릿인가: 사람마다 claude 에게 시작을 알리는 방식이 다르다. 어떤 사람은 업무 번호만
 * 주고 스스로 조회하게 하고, 어떤 사람은 본문까지 붙여 문맥을 먼저 채운다. 문구를 코드에
 * 박아두면 그중 하나만 강요하게 된다.
 */

/**
 * ⚠️ 이 값을 바꾸면 **신규 설치에만** 반영된다.
 *
 * `WorkspaceStore` 는 생성자에서 무조건 `persist()` 하고, 로드할 때 저장값이 기본값을 덮는다
 * (`{...DEFAULT_WORKSPACE_SETTINGS, ...raw.settings}`). 즉 앱을 한 번이라도 켠 사람은 그때의
 * 기본 문자열이 이미 디스크에 박혀 있어 새 기본값을 영영 못 받는다 — 같은 버전에서 사람마다
 * 동작이 갈린다. 모두에게 도달해야 하는 기능은 **새 설정 키**로 넣어라(없는 키는 기본값이 이긴다).
 */
export const DEFAULT_TASK_DROP_PROMPT = '다음 두레이 업무를 진행합니다: {ref} {title}'

export interface TaskDropPromptVars {
  title: string
  number?: number
  projectCode?: string
  /** 두레이 업무 URL */
  url?: string
  /** 업무 본문 — 템플릿이 `{body}` 를 쓸 때만 채운다(조회 비용이 있다) */
  body?: string
  /** 내려받아 둔 첨부 이미지의 로컬 경로 — 템플릿이 `{images}` 를 쓸 때만 채운다 */
  imagePaths?: string[]
}

/** 템플릿이 이 치환자를 쓰면 본문을 미리 받아와야 한다. */
export function templateNeedsBody(template: string): boolean {
  return template.includes('{body}')
}

/** 템플릿이 이 치환자를 쓰면 첨부 이미지를 미리 내려받아야 한다(네트워크 비용이 있다). */
export function templateNeedsImages(template: string): boolean {
  return template.includes('{images}')
}

/**
 * 이미지 경로를 claude 가 읽을 수 있는 한 줄로 만든다.
 *
 * 경로에 공백이 없도록 저장 단계에서 이미 정리하지만, 그래도 따옴표로 감싸 붙인다 —
 * TUI 입력창은 한 줄이라 경로가 문장에 섞이면 어디까지가 경로인지 모호해진다.
 */
export function formatImagePaths(paths: string[]): string {
  if (paths.length === 0) return ''
  return `첨부 이미지(로컬 경로, 반드시 읽어볼 것): ${paths.map((p) => `"${p}"`).join(' ')}`
}

/** 사람이 고르는 치환자 목록 — 설정 화면의 안내에 그대로 쓴다. */
export const TASK_DROP_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{title}', label: '업무 제목' },
  { token: '{number}', label: '업무 번호' },
  { token: '{project}', label: '프로젝트 코드' },
  { token: '{ref}', label: '프로젝트/번호 (예: NEON/6793)' },
  { token: '{url}', label: '두레이 링크' },
  { token: '{body}', label: '업무 본문' },
  { token: '{images}', label: '첨부 이미지 (로컬 경로)' }
]

/** 여러 줄 지시를 한 줄로 접는다 — TUI 입력창은 개행을 제출로 해석한다. */
export function foldPrompt(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/**
 * 템플릿을 실제 지시로 만든다. 값이 없는 치환자는 빈 문자열이 되고, 그 때문에 생기는
 * 이중 공백은 정리한다. 결과가 비면 null — 호출부는 지시를 보내지 않는다.
 */
export function renderTaskDropPrompt(
  template: string,
  vars: TaskDropPromptVars
): string | null {
  if (!template.trim()) return null

  const ref =
    vars.projectCode && vars.number !== undefined
      ? `${vars.projectCode}/${vars.number}`
      : vars.number !== undefined
        ? `#${vars.number}`
        : (vars.projectCode ?? '')

  const replacements: Record<string, string> = {
    '{title}': vars.title ?? '',
    '{number}': vars.number !== undefined ? String(vars.number) : '',
    '{project}': vars.projectCode ?? '',
    '{ref}': ref,
    '{url}': vars.url ?? '',
    '{body}': vars.body ?? '',
    '{images}': formatImagePaths(vars.imagePaths ?? [])
  }

  const rendered = Object.entries(replacements).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    template
  )

  const folded = foldPrompt(rendered).replace(/ {2,}/g, ' ')
  return folded || null
}
