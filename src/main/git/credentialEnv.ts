/**
 * git 실행 환경 — 대화형 자격증명 프롬프트 차단 + 출력 로케일 고정.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-credential-prompt-env.ts` 및 `src/main/git/runner.ts` 의 `nonInteractiveGitEnv`.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: WSL(`WSLENV`) 전파 분기 제거 — Clauday 는 WSL 라우팅을 하지 않는다.
 *
 * 왜 필요한가: GUI 앱이 spawn 한 git 은 터미널이 없어서 자격증명 프롬프트가 뜨면 **영구히 멈춘다**.
 * 캐시된 자격증명은 살리고 대화형 경로만 막는다.
 */

const GIT_CONFIG_INDEXED_KEY_RE = /^GIT_CONFIG_(?:KEY|VALUE)_(\d+)$/

/**
 * git 의 인덱스형 config 환경 프로토콜(`GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`)에서
 * 안전하게 이어붙일 수 있는 시작 인덱스를 반환한다. 상태가 깨져 있으면 null (그러면 손대지 않는다).
 */
export function readValidGitConfigEnvCount(env: NodeJS.ProcessEnv): number | null {
  const rawCount = env.GIT_CONFIG_COUNT
  const indexedKeys = Object.keys(env).filter((key) => GIT_CONFIG_INDEXED_KEY_RE.test(key))
  if (rawCount === undefined) {
    return indexedKeys.length === 0 ? 0 : null
  }
  if (!/^(?:0|[1-9]\d*)$/.test(rawCount)) return null

  const count = Number(rawCount)
  if (!Number.isSafeInteger(count) || indexedKeys.length !== count * 2) return null
  for (let index = 0; index < count; index += 1) {
    if (
      typeof env[`GIT_CONFIG_KEY_${index}`] !== 'string' ||
      typeof env[`GIT_CONFIG_VALUE_${index}`] !== 'string'
    ) {
      return null
    }
  }
  const hasDanglingIndex = indexedKeys.some((key) => {
    const match = key.match(GIT_CONFIG_INDEXED_KEY_RE)
    return !match || String(Number(match[1])) !== match[1] || Number(match[1]) >= count
  })
  return hasDanglingIndex ? null : count
}

/** 호출자가 이미 넣어둔 인덱스형 config 를 덮지 않고 뒤에 이어붙인다. */
export function appendGitConfigEnv(
  env: NodeJS.ProcessEnv,
  entries: readonly (readonly [key: string, value: string])[]
): NodeJS.ProcessEnv {
  const next = { ...env }
  const base = readValidGitConfigEnvCount(env)
  // 프로토콜이 모호한 상태면 호출자 데이터가 어느 인덱스에 있을지 모른다 — 건드리지 않는다.
  if (base === null) return next

  entries.forEach(([key, value], index) => {
    next[`GIT_CONFIG_KEY_${base + index}`] = key
    next[`GIT_CONFIG_VALUE_${base + index}`] = value
  })
  next.GIT_CONFIG_COUNT = String(base + entries.length)
  return next
}

/**
 * git 하위 프로세스용 환경을 만든다.
 * - 자격증명 프롬프트(터미널/askpass/GCM GUI)를 모두 차단하되 캐시된 자격증명은 유지
 * - SSH 는 `BatchMode=yes` 로 즉시 실패 (호출자가 `GIT_SSH_COMMAND` 를 이미 줬으면 존중)
 * - 출력 로케일을 C 로 고정 — 한국어 환경에서 stderr 패턴 매칭이 깨지는 것을 막는다
 */
export function nonInteractiveGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = appendGitConfigEnv(
    {
      ...env,
      GIT_TERMINAL_PROMPT: '0',
      // 이미 설정돼 있으면 사용자 askpass 를 존중한다 — 없을 때만 빈 값으로 막는다.
      GIT_ASKPASS: env.GIT_ASKPASS ?? '',
      SSH_ASKPASS: env.SSH_ASKPASS ?? '',
      // GCM 은 위 가드를 무시하고 자체 GUI 를 띄운다.
      GCM_INTERACTIVE: 'never',
      // 로케일 고정: git 메시지를 영어로 받아야 normalizeGitErrorMessage 의 판정이 성립한다.
      LC_ALL: 'C',
      LANGUAGE: ''
    },
    // helper 는 살려서 캐시된 자격증명이 계속 동작하게 하고, 대화형 폴백만 끈다.
    [
      ['credential.interactive', 'false'],
      ['credential.guiPrompt', 'false']
    ]
  )
  if (!next.GIT_SSH_COMMAND) next.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  return next
}
