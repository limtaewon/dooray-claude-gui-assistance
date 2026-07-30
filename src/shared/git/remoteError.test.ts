import { describe, it, expect, vi } from 'vitest'
import {
  isDivergentPullReconciliationError,
  isGitAuthFailure,
  isNoUpstreamError,
  normalizeGitErrorMessage,
  pullArgsSpecifyReconciliation,
  runPullWithDivergenceFallback,
  stripCredentialsFromMessage
} from './remoteError'

describe('stripCredentialsFromMessage', () => {
  it('user:password@ 는 모든 scheme 에서 지운다', () => {
    expect(stripCredentialsFromMessage('https://me:secret@git.example.com/a.git')).toBe(
      'https://git.example.com/a.git'
    )
  })

  it('단독 user@ 는 HTTP(S) 에서만 지운다 — SSH 의 git@host 를 지우면 URL 이 망가진다', () => {
    expect(stripCredentialsFromMessage('https://token@github.com/a.git')).toBe(
      'https://github.com/a.git'
    )
    expect(stripCredentialsFromMessage('ssh://git@github.com/a.git')).toBe(
      'ssh://git@github.com/a.git'
    )
  })
})

describe('normalizeGitErrorMessage', () => {
  it('non-fast-forward 안내는 push 에서만 낸다 — fetch/pull 에서도 나오는 문구다', () => {
    const err = new Error('! [rejected] main -> main (non-fast-forward)')
    expect(normalizeGitErrorMessage(err, 'push')).toContain('먼저 풀')
    expect(normalizeGitErrorMessage(err, 'pull')).not.toContain('먼저 풀')
  })

  it('인증 실패를 사용자 문구로 바꾼다', () => {
    expect(
      normalizeGitErrorMessage(new Error("fatal: could not read Username for 'https://x'"), 'push')
    ).toBe('인증에 실패했습니다. 원격 자격증명을 확인하세요.')
  })

  it('네트워크 오류를 구분한다', () => {
    expect(normalizeGitErrorMessage(new Error('fatal: Could not resolve host: github.com'))).toContain(
      '네트워크'
    )
  })

  it('upstream 없음을 안내한다', () => {
    expect(
      normalizeGitErrorMessage(new Error('fatal: no upstream configured for branch'), 'push')
    ).toContain('upstream')
  })

  it('divergent pull 은 pull 일 때만 정책 안내를 낸다', () => {
    const err = new Error('fatal: Need to specify how to reconcile divergent branches')
    expect(normalizeGitErrorMessage(err, 'pull')).toContain('pull.rebase')
  })

  it('로컬 변경 덮어쓰기 경고를 안내로 바꾼다', () => {
    expect(
      normalizeGitErrorMessage(
        new Error('error: Your local changes to the following files would be overwritten by merge:')
      )
    ).toContain('커밋·스태시')
  })

  it('매칭이 없으면 stderr 마지막 줄만 낸다 — 전체를 노출하면 로컬 경로가 샌다', () => {
    const err = new Error('Command failed: git push\n/Users/me/secret/repo\nfatal: 무언가 실패\n\n')
    expect(normalizeGitErrorMessage(err)).toBe('fatal: 무언가 실패')
  })

  it('Error 가 아니면 기본 문구', () => {
    expect(normalizeGitErrorMessage('문자열')).toBe('git 원격 작업에 실패했습니다.')
  })

  it('폴백 경로에서도 자격증명이 마스킹된다', () => {
    const err = new Error('fatal: repository https://me:pw@host/a.git not found')
    expect(normalizeGitErrorMessage(err)).not.toContain('pw@')
  })
})

describe('isGitAuthFailure / isNoUpstreamError', () => {
  it('자격증명 요구 패턴을 인증 실패로 본다', () => {
    expect(isGitAuthFailure(new Error('could not read Username'))).toBe(true)
    expect(isGitAuthFailure(new Error('Permission denied (publickey).'))).toBe(true)
    expect(isGitAuthFailure(new Error('terminal prompts disabled'))).toBe(true)
    expect(isGitAuthFailure(new Error('그냥 실패'))).toBe(false)
  })

  it('upstream 없음은 fatal: 접두가 있어야 인정한다 — hook 출력 오탐 방지', () => {
    expect(isNoUpstreamError(new Error('fatal: no upstream configured'))).toBe(true)
    expect(isNoUpstreamError(new Error('hook 로그: no upstream configured'))).toBe(false)
  })
})

describe('runPullWithDivergenceFallback', () => {
  it('divergent 거부 시 --no-rebase 로 1회 재시도한다', async () => {
    const runPull = vi
      .fn()
      .mockRejectedValueOnce(new Error('fatal: Need to specify how to reconcile divergent branches'))
      .mockResolvedValueOnce(undefined)

    await runPullWithDivergenceFallback([], runPull)

    expect(runPull).toHaveBeenCalledTimes(2)
    expect(runPull.mock.calls[1][0]).toEqual(['--no-rebase'])
  })

  it('호출자가 전략을 이미 지정했으면 폴백하지 않는다', async () => {
    const err = new Error('fatal: Need to specify how to reconcile divergent branches')
    const runPull = vi.fn().mockRejectedValue(err)
    await expect(runPullWithDivergenceFallback(['--rebase'], runPull)).rejects.toThrow(err)
    expect(runPull).toHaveBeenCalledTimes(1)
  })

  it('다른 에러는 그대로 던진다', async () => {
    const err = new Error('fatal: 다른 이유')
    const runPull = vi.fn().mockRejectedValue(err)
    await expect(runPullWithDivergenceFallback([], runPull)).rejects.toThrow(err)
    expect(runPull).toHaveBeenCalledTimes(1)
  })

  it('전략 인자 판정', () => {
    expect(pullArgsSpecifyReconciliation(['--ff-only'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['-r'])).toBe(true)
    expect(pullArgsSpecifyReconciliation(['origin', 'main'])).toBe(false)
  })

  it('divergent 판정은 Error 에만 적용된다', () => {
    expect(isDivergentPullReconciliationError('문자열')).toBe(false)
  })
})
