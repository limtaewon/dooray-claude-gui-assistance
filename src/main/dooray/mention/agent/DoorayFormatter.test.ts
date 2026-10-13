import { describe, it, expect } from 'vitest'
import {
  MESSAGE_CHUNK_LIMIT,
  endsWithQuestion,
  extractSummaryLines,
  extractTitle,
  formatElapsed,
  formatForDooray,
  isLongAnswer,
  plainText,
  splitForMessenger
} from './DoorayFormatter'

describe('formatForDooray — 블록 서식', () => {
  it('헤더는 ▍ 로 바꾼다 (레벨 무관, 닫는 # 제거)', () => {
    expect(formatForDooray('# 제목')).toBe('▍제목')
    expect(formatForDooray('### 소제목 ###')).toBe('▍소제목')
  })

  it('리스트는 • 로, 들여쓰기 2칸마다 한 단계', () => {
    expect(formatForDooray('- a\n* b\n+ c\n  - d\n    - e')).toBe('• a\n• b\n• c\n  • d\n    • e')
  })

  it('체크박스는 ☐ / ☑', () => {
    expect(formatForDooray('- [ ] 할 일\n- [x] 끝\n- [X] 대문자')).toBe('• ☐ 할 일\n• ☑ 끝\n• ☑ 대문자')
  })

  it('인용은 │, 수평선은 ―――', () => {
    expect(formatForDooray('> 인용문')).toBe('│ 인용문')
    expect(formatForDooray('---\n***\n___')).toBe('―――\n―――\n―――')
  })

  it('번호 목록은 그대로 둔다', () => {
    expect(formatForDooray('1. 첫째\n2. 둘째')).toBe('1. 첫째\n2. 둘째')
  })

  it('제목 안쪽의 # 은 보존한다 (F# 소개, Issue #12)', () => {
    expect(formatForDooray('## F# 소개')).toBe('▍F# 소개')
    expect(formatForDooray('# Issue #12')).toBe('▍Issue #12')
  })

  it('제목이 언어명으로 끝나도 보존한다 — 닫는 # 은 공백 뒤에만 온다', () => {
    expect(formatForDooray('# C#')).toBe('▍C#')
    expect(formatForDooray('## 제목 ##')).toBe('▍제목')
    expect(extractTitle('# C#')).toBe('C#')
  })
})

describe('formatForDooray — 인라인 서식', () => {
  it('굵게/취소선/기울임 기호를 벗긴다', () => {
    expect(formatForDooray('**굵게** 와 __굵게2__ 와 ~~취소~~ 와 *기울임* 끝')).toBe('굵게 와 굵게2 와 취소 와 기울임 끝')
  })

  it('snake_case 식별자는 보존한다', () => {
    expect(formatForDooray('user_id 와 my_var_name 사용')).toBe('user_id 와 my_var_name 사용')
  })

  it('인라인 코드 안의 기호는 그대로 둔다', () => {
    expect(formatForDooray('`**x**` 와 `a_*b*` 를 **굵게**')).toBe('`**x**` 와 `a_*b*` 를 굵게')
  })

  it('곱셈 같은 낱개 별표는 건드리지 않는다', () => {
    expect(formatForDooray('2 * 3 * 4')).toBe('2 * 3 * 4')
  })

  it('링크는 보존하고 이미지는 링크로 바꾼다', () => {
    expect(formatForDooray('[문서](https://a.b/c)')).toBe('[문서](https://a.b/c)')
    expect(formatForDooray('![스샷](https://a.b/i.png)')).toBe('[스샷](https://a.b/i.png)')
    expect(formatForDooray('![](https://a.b/i.png)')).toBe('[이미지](https://a.b/i.png)')
  })

  it('<br> 은 공백으로', () => {
    expect(formatForDooray('a<br>b<br/>c')).toBe('a b c')
  })
})

describe('formatForDooray — 표', () => {
  it('표는 행마다 한 줄 블록으로 푼다', () => {
    const md = '| 이름 | 값 | 비고 |\n|---|---|---|\n| a | 1 | x |\n| b | 2 | y |'
    expect(formatForDooray(md)).toBe('• a — 값: 1 · 비고: x\n• b — 값: 2 · 비고: y')
  })

  it('빈 셀은 생략한다', () => {
    const md = '| 이름 | 값 |\n|---|---|\n| a |  |'
    expect(formatForDooray(md)).toBe('• a')
  })

  it('본문 행이 없으면 헤더만 • 로 나열', () => {
    expect(formatForDooray('| a | b |\n|---|---|')).toBe('• a · b')
  })

  it('표 앞뒤 문단은 유지', () => {
    const out = formatForDooray('앞\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n뒤')
    expect(out).toBe('앞\n\n• 1 — b: 2\n\n뒤')
  })
})

describe('formatForDooray — 코드 펜스', () => {
  it('언어 펜스는 내용 그대로 보존', () => {
    const md = '```sql\nSELECT **a** FROM t; -- # not heading\n```'
    expect(formatForDooray(md)).toBe(md)
  })

  it('언어 없는 펜스도 보존', () => {
    expect(formatForDooray('```\n- a\n```')).toBe('```\n- a\n```')
  })

  it('```md 펜스는 벗겨서 안쪽을 평문으로 바꾼다', () => {
    expect(formatForDooray('```md\n# 제목\n- **a**\n```')).toBe('▍제목\n• a')
  })

  it('```markdown 펜스도 동일', () => {
    expect(formatForDooray('```markdown\n## 부제\n```')).toBe('▍부제')
  })

  it('닫히지 않은 펜스는 닫아 준다', () => {
    expect(formatForDooray('```js\nconst a = 1')).toBe('```js\nconst a = 1\n```')
  })

  it('닫히지 않은 md 펜스는 ``` 를 덧붙이지 않는다', () => {
    expect(formatForDooray('```md\n# 제목')).toBe('▍제목')
  })

  it('더 긴 펜스 안의 짧은 ``` 는 닫는 펜스가 아니다', () => {
    const md = '````md\n```js\nx\n```\n````'
    const out = formatForDooray(md)
    expect(out.startsWith('```js')).toBe(true)
  })

  it('펜스 안 표 기호는 건드리지 않는다', () => {
    const md = '```\n| a | b |\n```'
    expect(formatForDooray(md)).toBe(md)
  })
})

describe('formatForDooray — 공백 처리', () => {
  it('빈 줄 3개 이상은 1개로 축약', () => {
    expect(formatForDooray('a\n\n\n\n\nb')).toBe('a\n\nb')
  })

  it('CRLF 를 LF 로', () => {
    expect(formatForDooray('a\r\nb\r\n')).toBe('a\nb')
  })

  it('빈 입력은 빈 문자열', () => {
    expect(formatForDooray('')).toBe('')
  })
})

describe('isLongAnswer', () => {
  it('짧은 글은 false', () => {
    expect(isLongAnswer('안녕', '안녕')).toBe(false)
  })

  it('포맷된 길이가 한도(600)를 넘으면 true', () => {
    const t = 'a'.repeat(601)
    expect(isLongAnswer(t, t)).toBe(true)
    expect(isLongAnswer('a'.repeat(600), 'a'.repeat(600))).toBe(false)
  })

  it('limit 인자를 따른다', () => {
    expect(isLongAnswer('abcdef', 'abcdef', 5)).toBe(true)
  })

  it('표가 있으면 true', () => {
    expect(isLongAnswer('| a | b |\n|---|---|', 'x')).toBe(true)
  })

  it('코드 15줄 초과면 true, 15줄이면 false', () => {
    const code = (n: number): string => '```ts\n' + Array.from({ length: n }, (_, i) => `l${i}`).join('\n') + '\n```'
    expect(isLongAnswer(code(15), 'x')).toBe(false)
    expect(isLongAnswer(code(16), 'x')).toBe(true)
  })
})

describe('splitForMessenger', () => {
  it('빈 입력은 빈 배열', () => {
    expect(splitForMessenger('  \n ')).toEqual([])
  })

  it('한도 이하면 1개', () => {
    expect(splitForMessenger('짧은 글')).toEqual(['짧은 글'])
    const exact = 'a'.repeat(MESSAGE_CHUNK_LIMIT)
    expect(splitForMessenger(exact)).toEqual([exact])
  })

  it('문단 경계에서 나눈다', () => {
    const para = (c: string): string => (c + ' 문장입니다. ').repeat(40).trim()
    const text = [para('a'), para('b'), para('c'), para('d')].join('\n\n')
    const chunks = splitForMessenger(text, 600)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(600)
    // 문단이 중간에서 잘리지 않았는지: 각 조각은 한 종류 문단 글자로만 구성
    for (const c of chunks) {
      const kinds = new Set(c.match(/[abcd] 문장입니다\./g)?.map((s) => s[0]))
      expect(kinds.size).toBeLessThanOrEqual(2)
    }
    expect(chunks.join('\n\n').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''))
  })

  it('코드 펜스가 걸치면 닫고 다음 조각에서 같은 언어로 다시 연다', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `SELECT col_${i} FROM t_${i};`)
    const text = '앞 설명\n```sql\n' + lines.join('\n') + '\n```\n뒷 설명'
    const chunks = splitForMessenger(text, 500)
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(500)
      // 각 조각의 ``` 개수는 짝수 — 열린 채 끝나는 조각이 없다
      expect((c.match(/^```/gm) ?? []).length % 2).toBe(0)
    }
    expect(chunks[1].startsWith('```sql')).toBe(true)
    const all = chunks.join('\n')
    for (const l of lines) expect(all).toContain(l)
  })

  it('내용 없이 펜스만 남은 조각은 만들지 않는다', () => {
    // 펜스가 닫히는 줄에서 정확히 한도가 차는 경우를 포함해 여러 길이를 훑는다
    for (let n = 20; n < 60; n++) {
      const body = Array.from({ length: n }, (_, i) => `line ${i} `.padEnd(30, 'x')).join('\n')
      const chunks = splitForMessenger('```ts\n' + body + '\n```', 400)
      for (const c of chunks) {
        expect(c.replace(/```\w*/g, '').trim()).not.toBe('')
      }
    }
  })

  it('아주 긴 한 줄은 hard wrap 해서 모든 조각이 한도 이하', () => {
    const chunks = splitForMessenger('x'.repeat(7000), 1000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000)
    expect(chunks.join('').length).toBe(7000)
  })

  it('긴 한 줄이 코드 펜스 안에 있어도 모든 조각이 한도 이하', () => {
    const chunks = splitForMessenger('```sql\n' + 'INSERT '.repeat(600) + '\n```', 700)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(700)
  })

  it('다양한 입력에서 모든 조각 길이 ≤ limit', () => {
    const text = Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? '```py\nprint(1)\n```' : `문단 ${i} ` + '가'.repeat(i * 5))).join('\n\n')
    for (const limit of [300, 800, 2000]) {
      for (const c of splitForMessenger(text, limit)) expect(c.length).toBeLessThanOrEqual(limit)
    }
  })
})

describe('extractTitle / extractSummaryLines / plainText', () => {
  it('첫 헤더를 제목으로', () => {
    expect(extractTitle('서문\n\n## 장애 **요약**\n본문')).toBe('장애 요약')
  })

  it('헤더가 없으면 첫 문장(리스트 기호 제거)', () => {
    expect(extractTitle('- 첫 항목입니다\n- 둘째')).toBe('첫 항목입니다')
  })

  it('제목은 max 로 자르고 … 를 붙인다', () => {
    const t = extractTitle('# ' + 'a'.repeat(100), 10)
    expect(t).toHaveLength(10)
    expect(t.endsWith('…')).toBe(true)
  })

  it('내용이 없으면 "작업 결과"', () => {
    expect(extractTitle('')).toBe('작업 결과')
    expect(extractTitle('```\ncode\n```')).toBe('작업 결과')
  })

  it('요약은 헤더·코드·표·인용·수평선을 건너뛴 앞 count 줄', () => {
    const md = '# 제목\n\n```sql\nSELECT 1\n```\n| a | b |\n> 인용\n---\n첫째 **줄**\n1. 둘째\n- 셋째\n넷째'
    expect(extractSummaryLines(md)).toEqual(['첫째 줄', '둘째', '셋째'])
    expect(extractSummaryLines(md, 1)).toEqual(['첫째 줄'])
  })

  it('요약 줄은 maxLineLen 으로 자른다', () => {
    const [l] = extractSummaryLines('가'.repeat(200), 1, 20)
    expect(l).toHaveLength(20)
    expect(l.endsWith('…')).toBe(true)
  })

  it('plainText 는 링크를 글자만, 인라인 코드를 백틱 없이', () => {
    expect(plainText('**굵게** [문서](https://a.b) 와 `code`')).toBe('굵게 문서 와 code')
  })
})

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [42_000, '0:42'],
    [192_000, '3:12'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05'],
    [-5, '0:00']
  ])('%d ms → %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected)
  })
})

// ───────────────────────── "제목: 설명" 항목 분리 / 항목 사이 빈 줄 / 질문 판정 ─────────────────────────

const LONG = '배치 서버가 새벽 두 시에 재기동되면서 락이 풀리지 않았습니다'

describe('formatForDooray — "제목: 설명" 항목을 두 줄로 (splitLabeledItem)', () => {
  it('글머리 항목이 길면 제목과 설명을 두 줄로, 설명은 글머리 폭만큼 들여쓴다', () => {
    expect(formatForDooray(`- 원인: ${LONG}`)).toBe(`• 원인\n  ${LONG}`)
  })

  it('전체 길이가 30 이하이면 한 줄 그대로', () => {
    expect(formatForDooray('- 원인: 짧은 설명입니다')).toBe('• 원인: 짧은 설명입니다')
    expect(formatForDooray('- 원인: 배치 서버 재기동으로 락 미해제')).toBe('• 원인: 배치 서버 재기동으로 락 미해제')
  })

  it('번호 목록(1. / 1) )도 같은 규칙, 설명은 마커 폭(3칸)만큼 들여쓴다', () => {
    expect(formatForDooray(`1. 원인: ${LONG}`)).toBe(`1. 원인\n   ${LONG}`)
    expect(formatForDooray(`2) 원인: ${LONG}`)).toBe(`2) 원인\n   ${LONG}`)
  })

  it('번호 목록 일반 항목은 변하지 않는다', () => {
    expect(formatForDooray('1. 첫째\n2. 둘째')).toBe('1. 첫째\n2. 둘째')
  })

  it('하위 항목은 들여쓴 마커 폭만큼', () => {
    expect(formatForDooray(`  - 하위: ${LONG}`)).toBe(`• 하위\n    ${LONG}`)
  })

  it('체크박스 항목은 체크 마커까지 포함한 폭만큼 들여쓴다', () => {
    expect(formatForDooray(`- [ ] 할일: ${LONG}`)).toBe(`• ☐ 할일\n    ${LONG}`)
    expect(formatForDooray(`- [x] 완료: ${LONG}`)).toBe(`• ☑ 완료\n    ${LONG}`)
  })

  it('굵게 표시 제목도 기호를 벗기고 분리', () => {
    expect(formatForDooray(`- **원인**: ${LONG}`)).toBe(`• 원인\n  ${LONG}`)
  })

  it('제목이 인라인 코드이거나 24자를 넘으면 분리하지 않는다', () => {
    expect(formatForDooray(`- \`code\`: ${LONG}`)).toBe(`• \`code\`: ${LONG}`)
    const longTitle = '이 항목의 제목은 매우매우매우 길어서 이십사자를 넘는다'
    expect(formatForDooray(`- ${longTitle}: ${LONG}`)).toBe(`• ${longTitle}: ${LONG}`)
  })

  it('제목이 1자이면 분리하지 않는다 (최소 2자)', () => {
    expect(formatForDooray(`- A: ${LONG}`)).toBe(`• A: ${LONG}`)
  })

  it('콜론 뒤에 공백이 없거나 설명이 10자 미만이면 분리하지 않는다', () => {
    expect(formatForDooray(`- 원인:${LONG}`)).toBe(`• 원인:${LONG}`)
    // 설명 "짧음" 은 10자 미만 — 전체가 30자를 넘겨도 한 줄
    expect(formatForDooray('- 아주아주긴제목입니다 정말로 길어요: 짧음')).not.toContain('\n')
  })

  it('전각 콜론(：) 뒤에 공백이 없으면 분리하지 않고, 공백이 있으면 분리', () => {
    expect(formatForDooray(`- 원인：${LONG}`)).toBe(`• 원인：${LONG}`)
    expect(formatForDooray(`- 원인： ${LONG}`)).toBe(`• 원인\n  ${LONG}`)
  })

  it('설명 안에 또 콜론이 있어도 첫 콜론에서 나눈다 (10:30 등)', () => {
    expect(formatForDooray(`- 시각: 10:30 에 ${LONG}`)).toBe(`• 시각\n  10:30 에 ${LONG}`)
  })

  it('코드 펜스 안의 항목은 건드리지 않는다', () => {
    const md = `\`\`\`\n- 원인: ${LONG}\n\`\`\``
    expect(formatForDooray(md)).toBe(md)
  })

  it('항목이 아닌 일반 문장의 "제목: 설명" 은 그대로', () => {
    expect(formatForDooray(`원인: ${LONG}`)).toBe(`원인: ${LONG}`)
  })

  it('```md 로 감싼 본문 안의 항목도 같은 규칙', () => {
    expect(formatForDooray(`\`\`\`md\n- 원인: ${LONG}\n\`\`\``)).toBe(`• 원인\n  ${LONG}`)
  })
})

describe('formatForDooray — 여러 줄 항목 사이 빈 줄 (spaceOutMultilineItems)', () => {
  it('두 줄짜리 항목 뒤에 다음 항목이 오면 빈 줄을 넣는다', () => {
    const md = `- 원인: ${LONG}\n- 조치: 락 해제`
    expect(formatForDooray(md)).toBe(`• 원인\n  ${LONG}\n\n• 조치: 락 해제`)
  })

  it('두 줄짜리 항목이 이어지면 각 항목 사이', () => {
    const md = `- 원인: ${LONG}\n- 영향: 전표 마감 지연 약 30분 발생했고 이후 정상화되었습니다 확인\n- 조치: 락 해제`
    expect(formatForDooray(md)).toBe(
      `• 원인\n  ${LONG}\n\n• 영향\n  전표 마감 지연 약 30분 발생했고 이후 정상화되었습니다 확인\n\n• 조치: 락 해제`
    )
  })

  it('한 줄짜리 항목끼리는 붙여 둔다', () => {
    expect(formatForDooray('- 짧은 항목\n- 또 짧은 항목\n- 세번째')).toBe('• 짧은 항목\n• 또 짧은 항목\n• 세번째')
  })

  it('이미 빈 줄이 있으면 더 넣지 않는다', () => {
    const md = `- 원인: ${LONG}\n\n- 조치: 락 해제`
    expect(formatForDooray(md)).toBe(`• 원인\n  ${LONG}\n\n• 조치: 락 해제`)
  })

  it('항목 앞 문단과는 빈 줄을 만들지 않는다', () => {
    expect(formatForDooray(`요약입니다\n- 원인: ${LONG}`)).toBe(`요약입니다\n• 원인\n  ${LONG}`)
  })

  it('들여쓴 하위 항목은 부모 항목의 일부로 본다 (중간에 빈 줄을 끼우지 않는다)', () => {
    const out = formatForDooray(`- a: ${LONG}\n  - 하위 짧음\n- b`)
    expect(out).not.toMatch(/하위 짧음\n\n  /)
  })

  it('번호 목록에도 적용', () => {
    expect(formatForDooray(`1. 원인: ${LONG}\n2. 조치: 락 해제`)).toBe(`1. 원인\n   ${LONG}\n\n2. 조치: 락 해제`)
  })

  it('빈 줄 3개 이상 축약은 여전히 동작 (항목 사이 포함)', () => {
    expect(formatForDooray(`- 원인: ${LONG}\n\n\n\n- 조치: x`)).toBe(`• 원인\n  ${LONG}\n\n• 조치: x`)
  })

  it('표 변환 결과의 항목 사이에도 영향 없음 (한 줄 항목)', () => {
    expect(formatForDooray('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')).toBe('• 1 — b: 2\n• 3 — b: 4')
  })
})

describe('endsWithQuestion', () => {
  it.each([
    '어떻게 할까요?',
    '이게 맞나요？',
    '결과: 3건 ?',
    '진행할까요',
    '이대로 될까요',
    'A 와 B 중 골라',
    'A 와 B 중 하나를 선택해 주세요',
    '둘 중 하나 골라 주세요',
    '확인 부탁드립니다',
    '확인 부탁',
    '알려줘',
    '알려 줘요',
    '기준을 정해 주세요',
    '긴 설명입니다.\n\n계속 진행할까요?',
    '긴 설명입니다.\n\n   마지막 문단입니다 확인 부탁드려요  '
  ])('질문: %j', (t) => {
    expect(endsWithQuestion(t)).toBe(true)
  })

  it.each([
    '완료했습니다.',
    '질문입니다?\n\n끝났습니다.',
    '',
    '   ',
    '알려줘 정말 길게 이어지는 뒷부분 문장입니다 많이',
    '조치 내용은 위와 같습니다'
  ])('질문 아님: %j', (t) => {
    expect(endsWithQuestion(t)).toBe(false)
  })

  it('질문은 마지막 문단만 본다 — 앞 문단의 물음표는 무시', () => {
    expect(endsWithQuestion('왜 그럴까요?\n\n원인은 락입니다.')).toBe(false)
  })
})

describe('isLongAnswer — 질문이면 길어도 false', () => {
  it('600자를 넘어도 마지막이 질문이면 false', () => {
    const t = 'x'.repeat(700) + '\n\n어떻게 할까요?'
    expect(isLongAnswer(t, t)).toBe(false)
  })

  it('표가 있어도 마지막이 질문이면 false', () => {
    const t = '| a | b |\n|---|---|\n| 1 | 2 |\n\n이대로 진행할까요?'
    expect(isLongAnswer(t, 'x')).toBe(false)
  })

  it('긴 코드가 있어도 마지막이 질문이면 false', () => {
    const code = '```ts\n' + Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n```\n\n이렇게 고칠까요?'
    expect(isLongAnswer(code, 'x')).toBe(false)
  })

  it('질문이 아니면 기존 규칙 그대로', () => {
    const t = 'x'.repeat(700) + '\n\n이상입니다.'
    expect(isLongAnswer(t, t)).toBe(true)
    expect(isLongAnswer('| a |\n|--|', 'x')).toBe(true)
    expect(isLongAnswer('짧은 답', '짧은 답')).toBe(false)
  })
})


describe('isLongAnswer — 묻는 답의 길이 상한', () => {
  it('질문으로 끝나도 1,500자를 넘으면 글타래로 보낸다 — 채널을 여러 조각으로 덮지 않게', () => {
    const md = `${'설명 문장입니다. '.repeat(200)}\n\n어느 쪽으로 할까요?`
    expect(isLongAnswer(md, formatForDooray(md))).toBe(true)
  })
})
