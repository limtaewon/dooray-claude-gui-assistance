import { describe, it, expect } from 'vitest'
import { maskSecrets, truncateLongLines } from './SecretMasker'

describe('maskSecrets — 가려야 하는 것', () => {
  it('URL 안 계정 비밀번호', () => {
    const r = maskSecrets('jdbc 대신 mysql://admin:p4ssw0rd@db.internal:3306/erp 로 접속')
    expect(r.text).toBe('jdbc 대신 mysql://admin:****@db.internal:3306/erp 로 접속')
    expect(r.count).toBe(1)
  })

  it.each([
    ['password=hunter22', 'password=****'],
    ['PASSWORD: hunter22', 'PASSWORD: ****'],
    ['pw: abc123', 'pw: ****'],
    ['비밀번호: abc123!', '비밀번호: ****'],
    ['비번 = abc123', '비번 = ****'],
    ['secret="s3cr3t-value"', 'secret="****"'],
    ['api_key=AbCdEf123456', 'api_key=****'],
    ['client-secret: zzz999', 'client-secret: ****']
  ])('키-값: %s', (input, expected) => {
    const r = maskSecrets(input)
    expect(r.text).toBe(expected)
    expect(r.count).toBe(1)
  })

  it('인증 헤더 Bearer / dooray-api / Basic', () => {
    const r = maskSecrets('Authorization: Bearer abcdefghijklmnop1234\nAuthorization: dooray-api tenant1234ab:Zk3_-abcdefghijklmnopqrst')
    expect(r.text).not.toContain('abcdefghijklmnop1234')
    expect(r.text).not.toContain('Zk3_-abcdefghijklmnopqrst')
    expect(r.text).toContain('Bearer ****')
    expect(r.text).toContain('dooray-api ****')
    expect(r.count).toBe(2)
  })

  it('Basic 헤더', () => {
    expect(maskSecrets('Basic dXNlcjpwYXNzd29yZA==').text).toBe('Basic ****')
  })

  it.each([
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-abcdefghijklmnopqrstuvwxyz012345',
    'sk-ant-api03-abcdefghijklmnopqrstuvwx',
    'drop_pat_abcdefghijklmnopqrstuvwx',
    'AKIAIOSFODNN7EXAMPLE',
    'github_pat_11ABCDEFG0abcdefghijklmn',
    'xoxb-1234567890-abcdefghijkl'
  ])('토큰 접두어: %s', (tok) => {
    const r = maskSecrets(`키는 ${tok} 입니다`)
    expect(r.text).toBe('키는 **** 입니다')
    expect(r.count).toBe(1)
  })

  it('두레이 토큰 형식 {tenant12}:{key}', () => {
    const r = maskSecrets('토큰 abcdefghij12:Abcdefghijklmnopqrstuv_1 사용')
    expect(r.text).toBe('토큰 **** 사용')
    expect(r.count).toBe(1)
  })

  it('count 는 가린 곳의 합계', () => {
    const r = maskSecrets('password=aaaaaa\npw: bbbbbb\nmysql://u:cccccc@h/db\nghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(r.count).toBe(4)
    expect(r.text).not.toMatch(/aaaaaa|bbbbbb|cccccc|ghp_/)
  })
})

describe('maskSecrets — 환경변수형 키 · 따옴표 값', () => {
  it.each([
    ['DB_PASSWORD=abc12345', 'DB_PASSWORD=****'],
    ['ACCESS_TOKEN=abc12345', 'ACCESS_TOKEN=****'],
    ['api_token=abc12345', 'api_token=****'],
    ['spring.datasource.password: abc12345', 'spring.datasource.password: ****']
  ])('%s', (input, expected) => {
    expect(maskSecrets(input).text).toBe(expected)
  })

  it('따옴표로 묶인 공백 포함 값은 통째로 가린다', () => {
    expect(maskSecrets('password="my secret pass"').text).toBe('password="****"')
    expect(maskSecrets("pw: 'a b c d'").text).toBe("pw: '****'")
  })
})

describe('maskSecrets — 오탐 없음', () => {
  it.each([
    'token 발급 부탁드립니다',
    'password 정책을 확인해 주세요',
    '비밀번호 변경은 어디서 하나요?',
    '이 secret 은 어디에 저장되나요',
    '일반 문장입니다. 오늘 배포 확인 부탁해요.',
    'https://dooray.com/project/123/456',
    '시각 10:30 에 만나요',
    'user@example.com 으로 보내주세요',
    'password: ab',
    'SELECT * FROM users WHERE id = 1;'
  ])('그대로 둔다: %s', (text) => {
    const r = maskSecrets(text)
    expect(r.text).toBe(text)
    expect(r.count).toBe(0)
  })

  it('빈 문자열', () => {
    expect(maskSecrets('')).toEqual({ text: '', count: 0 })
  })
})

describe('truncateLongLines', () => {
  it('짧은 줄은 그대로', () => {
    expect(truncateLongLines('a\nb')).toBe('a\nb')
  })

  it('한도 초과 줄은 앞부분만 남기고 생략 글자 수를 적는다', () => {
    const out = truncateLongLines('x'.repeat(30) + '\nshort', 10)
    expect(out).toBe(`${'x'.repeat(10)} …(20자 생략)\nshort`)
  })

  it('정확히 한도면 자르지 않는다', () => {
    expect(truncateLongLines('x'.repeat(10), 10)).toBe('x'.repeat(10))
  })
})
