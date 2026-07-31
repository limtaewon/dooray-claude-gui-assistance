/**
 * git 이 C-quote 로 이스케이프한 경로를 되돌린다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-cquoted-path.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 없음 (verbatim).
 */
export function decodeGitCQuotedPath(value: string): string {
  if (value.length < 2 || value[0] !== '"' || value.at(-1) !== '"') {
    return value
  }

  let decoded = ''
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index]
    if (char !== '\\') {
      decoded += char
      continue
    }

    index += 1
    const escaped = value[index]
    switch (escaped) {
      case 'a':
        decoded += '\u0007'
        break
      case 'b':
        decoded += '\b'
        break
      case 'f':
        decoded += '\f'
        break
      case 'n':
        decoded += '\n'
        break
      case 'r':
        decoded += '\r'
        break
      case 't':
        decoded += '\t'
        break
      case 'v':
        decoded += '\v'
        break
      case '\\':
      case '"':
        decoded += escaped
        break
      default:
        if (/[0-7]/.test(escaped)) {
          const bytes: number[] = []
          let octalStart = index
          while (octalStart < value.length - 1) {
            let octal = value[octalStart]
            let octalEnd = octalStart
            while (
              octalEnd + 1 < value.length - 1 &&
              octal.length < 3 &&
              /[0-7]/.test(value[octalEnd + 1])
            ) {
              octalEnd += 1
              octal += value[octalEnd]
            }
            bytes.push(Number.parseInt(octal, 8))
            index = octalEnd
            if (value[index + 1] !== '\\' || !/[0-7]/.test(value[index + 2] ?? '')) {
              break
            }
            octalStart = index + 2
          }
          // git 은 비ASCII 를 UTF-8 바이트 단위 8진 escape 로 쓴다. 바이트를 모아 한 번에
          // 디코드해야 한글 경로가 깨지지 않는다 (한 바이트씩 문자로 바꾸면 손상).
          decoded += new TextDecoder('utf-8', { ignoreBOM: true }).decode(Uint8Array.from(bytes))
        } else {
          decoded += escaped
        }
        break
    }
  }

  return decoded
}
