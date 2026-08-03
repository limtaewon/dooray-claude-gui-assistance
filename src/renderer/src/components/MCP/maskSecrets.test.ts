import { describe, it, expect } from 'vitest'
import { maskArgSecrets } from './maskSecrets'

const textOf = (args: string[]): string[] => maskArgSecrets(args).map((a) => a.text)
const maskedOf = (args: string[]): boolean[] => maskArgSecrets(args).map((a) => a.masked)

describe('maskArgSecrets', () => {
  it('인자가 없으면 빈 배열을 준다', () => {
    expect(maskArgSecrets(undefined)).toEqual([])
    expect(maskArgSecrets([])).toEqual([])
  })

  it('--header 뒤의 토큰 헤더는 이름만 남기고 값을 가린다', () => {
    // v2.0.3 에서 실제로 카드에 노출되던 형태
    const args = ['-y', 'mcp-remote', 'http://10.161.64.23:20002/mcp', '--header', 'X-Dooray-Token: a1b2c3d4e5f6g7h8']
    const result = maskArgSecrets(args)
    expect(result[4].text).toBe('X-Dooray-Token: ••••••••')
    expect(result[4].masked).toBe(true)
    expect(result[4].text).not.toContain('a1b2c3d4')
  })

  it('시크릿이 아닌 헤더는 그대로 둔다', () => {
    const args = ['--header', 'Accept: application/json']
    expect(textOf(args)).toEqual(['--header', 'Accept: application/json'])
    expect(maskedOf(args)).toEqual([false, false])
  })

  it('Authorization 헤더는 플래그 없이 홀로 있어도 가린다', () => {
    const result = maskArgSecrets(['Authorization: Bearer sk-ant-0123456789'])
    expect(result[0].masked).toBe(true)
    expect(result[0].text).toBe('Authorization: ••••••••')
  })

  it('--token=값 형태를 가린다', () => {
    const result = maskArgSecrets(['--api-key=abcdef123456'])
    expect(result[0].text).toBe('--api-key=••••••••')
    expect(result[0].masked).toBe(true)
  })

  it('--token 다음 인자를 가린다', () => {
    const result = maskArgSecrets(['--token', 'abcdef123456'])
    expect(result[0].text).toBe('--token')
    expect(result[1].text).toBe('••••••••')
    expect(result[1].masked).toBe(true)
  })

  it('시크릿이 아닌 플래그 값은 건드리지 않는다', () => {
    const args = ['--port', '8080', '--verbose']
    expect(textOf(args)).toEqual(args)
    expect(maskedOf(args)).toEqual([false, false, false])
  })

  it('URL·커맨드 같은 평범한 인자는 그대로 보인다', () => {
    const args = ['-y', 'mcp-remote', 'http://10.161.64.23:20002/mcp']
    expect(textOf(args)).toEqual(args)
  })

  it('짧은 값도 최소 4자리로 가려 길이를 흘리지 않는다', () => {
    expect(maskArgSecrets(['--token', 'ab'])[1].text).toBe('••••')
  })

  it('긴 값도 8자리를 넘기지 않아 길이를 흘리지 않는다', () => {
    expect(maskArgSecrets(['--token', 'a'.repeat(200)])[1].text).toBe('••••••••')
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const args = ['--token', 'secret-value']
    maskArgSecrets(args)
    expect(args).toEqual(['--token', 'secret-value'])
  })
})
