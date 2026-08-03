/**
 * MCP 카드에 인자를 표시하기 전에 시크릿 값을 가린다. 표시 전용 — 저장된 설정은 건드리지 않는다.
 *
 * 왜 필요한가: 헤더를 stdio 인자로 넘기는 서버(`npx mcp-remote … --header "X-Token: abc"`)는
 * 원격 서버의 headers 와 달리 값이 인자 배열에 그대로 들어 있어 카드에 노출된다.
 */

/** 이름에 이게 들어 있으면 그 값은 시크릿으로 본다 */
const SECRET_NAME_RE = /(token|secret|key|password|passwd|pwd|credential|authorization|auth)/i

/** `--header` 처럼 다음 인자를 값으로 받는 플래그 */
const HEADER_FLAG_RE = /^-{1,2}(header|H)$/i

/** `--token=abc` 처럼 이름과 값이 한 인자에 붙은 형태 */
const INLINE_KV_RE = /^(-{1,2}[\w-]+)=(.+)$/

/** `--token abc` 처럼 이름만 있는 플래그 */
const SECRET_FLAG_RE = /^-{1,2}[\w-]*(?:token|secret|key|password|passwd|pwd|credential|auth)[\w-]*$/i

export interface MaskedArg {
  /** 화면에 그대로 찍을 문자열 */
  text: string
  /** 값이 가려졌는지 — 자물쇠 아이콘·색 판단에 쓴다 */
  masked: boolean
}

function maskValue(value: string): string {
  return '•'.repeat(Math.min(8, Math.max(4, value.length)))
}

/** 인자 하나가 `Name: value` 형태의 헤더면 이름만 남기고 값을 가린다. 헤더가 아니면 null. */
function maskHeaderPair(arg: string): string | null {
  const match = arg.match(/^([^\s:]+)\s*:\s*(.+)$/)
  if (!match) return null
  const [, name, value] = match
  if (!SECRET_NAME_RE.test(name)) return null
  return `${name}: ${maskValue(value)}`
}

/** 인자 배열에서 시크릿으로 보이는 값을 가려 표시용 목록을 만든다. 입력이 비면 빈 배열. */
export function maskArgSecrets(args: readonly string[] | undefined): MaskedArg[] {
  if (!args || args.length === 0) return []
  return args.map((arg, index) => {
    const prev = index > 0 ? args[index - 1] : undefined

    if (prev && HEADER_FLAG_RE.test(prev)) {
      const headerMasked = maskHeaderPair(arg)
      if (headerMasked) return { text: headerMasked, masked: true }
    }

    const inline = arg.match(INLINE_KV_RE)
    if (inline && SECRET_NAME_RE.test(inline[1])) {
      return { text: `${inline[1]}=${maskValue(inline[2])}`, masked: true }
    }

    if (prev && SECRET_FLAG_RE.test(prev)) {
      return { text: maskValue(arg), masked: true }
    }

    // 플래그 없이 홀로 놓인 헤더 문자열도 잡는다 (`"Authorization: Bearer …"`)
    const bare = maskHeaderPair(arg)
    if (bare) return { text: bare, masked: true }

    return { text: arg, masked: false }
  })
}
