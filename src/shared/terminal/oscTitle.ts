/**
 * PTY 출력에서 터미널 타이틀(OSC 0/1/2)을 뽑아낸다.
 *
 * 왜 main 에서 파싱하나: 렌더러의 xterm 도 타이틀 이벤트를 주지만 **보이는 pane 에만** 붙어 있다.
 * 알림은 배경 탭에서 더 중요하므로, 모든 세션을 보는 PTY 출력에서 직접 읽는다.
 *
 * 형식: `ESC ] {0|1|2} ; {제목} (BEL | ESC \\)`
 */

const OSC_START = '\u001b]'
const BEL = '\u0007'
const ST = '\u001b\\'

/** 미완성 시퀀스를 들고 가는 최대 길이 — 이보다 길면 타이틀이 아니라고 보고 버린다. */
const MAX_CARRY = 4096

export interface OscTitleScan {
  titles: string[]
  /** 다음 청크와 이어 붙일 미완성 조각 */
  carry: string
}

/**
 * 청크에서 타이틀을 모두 뽑고, 잘린 시퀀스는 `carry` 로 넘긴다.
 *
 * PTY 는 임의 위치에서 잘려 오므로 `ESC ] 0 ;` 와 종료 문자가 다른 청크에 놓이는 일이 흔하다.
 * 이걸 안 이어 붙이면 긴 타이틀일수록 더 자주 놓친다.
 */
export function scanOscTitles(chunk: string, carry = ''): OscTitleScan {
  let buffer = carry + chunk
  const titles: string[] = []

  for (;;) {
    const start = buffer.indexOf(OSC_START)
    if (start === -1) {
      // ESC 하나만 걸쳐 잘렸을 수 있으니 끝의 ESC 는 남긴다.
      buffer = buffer.endsWith('\u001b') ? '\u001b' : ''
      break
    }

    const body = buffer.slice(start + OSC_START.length)
    const semicolon = body.indexOf(';')
    // `0;` `1;` `2;` 만 타이틀이다. 그 앞이 숫자가 아니면 다른 OSC(7=cwd, 8=link 등).
    const code = semicolon === -1 ? '' : body.slice(0, semicolon)
    if (semicolon === -1) {
      // 아직 코드조차 안 왔다 — 더 기다린다.
      buffer = buffer.slice(start)
      break
    }
    if (code !== '0' && code !== '1' && code !== '2') {
      buffer = buffer.slice(start + OSC_START.length)
      continue
    }

    const rest = body.slice(semicolon + 1)
    const belAt = rest.indexOf(BEL)
    const stAt = rest.indexOf(ST)
    const endAt =
      belAt === -1 ? stAt : stAt === -1 ? belAt : Math.min(belAt, stAt)
    if (endAt === -1) {
      // 종료 문자가 아직 안 왔다.
      buffer = buffer.slice(start)
      break
    }

    titles.push(rest.slice(0, endAt))
    const consumed = belAt === endAt ? BEL.length : ST.length
    buffer = rest.slice(endAt + consumed)
  }

  return { titles, carry: buffer.length > MAX_CARRY ? '' : buffer }
}
