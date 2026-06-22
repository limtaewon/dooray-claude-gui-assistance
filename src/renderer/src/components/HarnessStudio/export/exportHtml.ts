/**
 * HTML 리포트 export 순수함수.
 *
 * HarnessModel → 독립 HTML 문자열 직렬화.
 * 외부 의존성 없음(react-dom/server 제외).
 *
 * 생성되는 HTML:
 * - 인라인 CSS (다크/라이트 토큰 없이 단순 스타일)
 * - 에이전트 목록 테이블
 * - 레벨 체인 목록
 * - 게이트/Hook 목록
 * - 점수 6축 텍스트 요약
 * - 산출물 목록
 *
 * main 의 파일저장 IPC 가 없으면 blob URL 다운로드를 사용한다.
 * PNG export 는 html-to-image 새 의존 필요 → 이 파일에서는 구현하지 않음(후속).
 */

import type { HarnessModel } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

/** HTML 특수문자 이스케이프 */
function esc(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 배열을 쉼표 구분 문자열로 */
function joinList(arr: string[]): string {
  return arr.length > 0 ? arr.map(esc).join(', ') : '—'
}

// ─────────────────────────────────────────────
// 섹션 빌더
// ─────────────────────────────────────────────

function buildAgentsTable(model: HarnessModel): string {
  if (model.agents.length === 0) return '<p>에이전트 없음</p>'

  const rows = model.agents.map((a) => `
    <tr>
      <td>${esc(a.displayName)}</td>
      <td>${esc(a.model)}</td>
      <td>${esc(a.phaseClass ?? '—')}</td>
      <td>${esc(a.role)}</td>
      <td>${joinList(a.tools.slice(0, 5))}${a.tools.length > 5 ? ` (+${a.tools.length - 5})` : ''}</td>
    </tr>`).join('')

  return `
    <table>
      <thead>
        <tr>
          <th>에이전트</th><th>모델</th><th>페이즈</th><th>역할</th><th>도구</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildLevelsSection(model: HarnessModel): string {
  if (model.levels.length === 0) return '<p>레벨 없음</p>'

  return model.levels.map((l) => `
    <div class="level-block">
      <strong>${esc(l.id)}: ${esc(l.name)}</strong>
      <p>체인: ${joinList(l.agentChain)}</p>
      ${l.requiredArtifacts.length > 0 ? `<p>필수 산출물: ${joinList(l.requiredArtifacts)}</p>` : ''}
    </div>`).join('')
}

function buildGatesSection(model: HarnessModel): string {
  const { gates, hooks } = model.controlFlow
  if (gates.length === 0 && hooks.length === 0) return '<p>게이트/Hook 없음</p>'

  const gateRows = gates.map((g) => `
    <tr>
      <td>${esc(g.phase)}</td>
      <td>${g.blocking ? '<span class="badge-red">blocking</span>' : '<span class="badge-neutral">warn</span>'}</td>
      <td>${joinList(g.ruleCodes)}</td>
      <td>${esc(g.description ?? '—')}</td>
    </tr>`).join('')

  const hookRows = hooks.map((h) => `
    <tr>
      <td>${esc(h.file)}</td>
      <td>${esc(h.event ?? '—')}</td>
      <td>${esc(h.enforces ?? '—')}</td>
    </tr>`).join('')

  return `
    ${gates.length > 0 ? `
      <h3>게이트</h3>
      <table>
        <thead><tr><th>Phase</th><th>유형</th><th>규칙코드</th><th>설명</th></tr></thead>
        <tbody>${gateRows}</tbody>
      </table>` : ''}
    ${hooks.length > 0 ? `
      <h3>Hooks</h3>
      <table>
        <thead><tr><th>파일</th><th>이벤트</th><th>강제 내용</th></tr></thead>
        <tbody>${hookRows}</tbody>
      </table>` : ''}`
}

function buildScoreSection(model: HarnessModel): string {
  if (!model.score) return '<p>점수 없음 — AI 정규화 필요</p>'

  const { axes, total, rationale } = model.score
  const rows = axes.map((a) => {
    const pct = a.max > 0 ? Math.round((a.value / a.max) * 100) : 0
    return `<tr><td>${esc(a.key)}</td><td>${a.value}/${a.max} (${pct}%)</td><td>${esc(a.note ?? '—')}</td></tr>`
  }).join('')

  return `
    <p><strong>총점: ${total}</strong></p>
    <table>
      <thead><tr><th>축</th><th>점수</th><th>근거</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${rationale ? `<p><em>${esc(rationale)}</em></p>` : ''}`
}

function buildArtifactsSection(model: HarnessModel): string {
  if (model.artifacts.length === 0) return '<p>산출물 없음</p>'

  const rows = model.artifacts.map((a) => `
    <tr>
      <td>${esc(a.id)}</td>
      <td>${esc(a.persist)}</td>
      <td>${esc(a.producer ?? '—')}</td>
      <td>${joinList(a.consumers)}</td>
    </tr>`).join('')

  return `
    <table>
      <thead><tr><th>ID</th><th>영속화</th><th>생산자</th><th>소비자</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────

const INLINE_CSS = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    background: #ffffff;
    margin: 0;
    padding: 24px;
    line-height: 1.5;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 12px; margin: 16px 0 6px; color: #4a5568; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f7fafc; font-weight: 600; color: #4a5568; }
  tr:last-child td { border-bottom: none; }
  .badge-red { background: #fff5f5; color: #c53030; border-radius: 4px; padding: 2px 6px; font-size: 10px; }
  .badge-neutral { background: #f7fafc; color: #4a5568; border-radius: 4px; padding: 2px 6px; font-size: 10px; }
  .level-block { margin: 8px 0; padding: 8px 12px; background: #f7fafc; border-radius: 6px; }
  .level-block p { margin: 2px 0; color: #4a5568; }
  .warning { background: #fffbeb; border: 1px solid #f6e05e; border-radius: 6px; padding: 8px 12px; color: #744210; margin: 4px 0; font-size: 12px; }
  .meta { color: #718096; font-size: 11px; margin: 4px 0 16px; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a202c; color: #e2e8f0; }
    th { background: #2d3748; color: #a0aec0; }
    td { border-color: #2d3748; }
    th { border-color: #4a5568; }
    h2 { border-color: #2d3748; }
    .level-block { background: #2d3748; }
    .warning { background: #744210; border-color: #b7791f; color: #fefcbf; }
  }
`

// ─────────────────────────────────────────────
// 메인 export 함수
// ─────────────────────────────────────────────

/**
 * HarnessModel 을 독립 HTML 문자열로 직렬화한다.
 *
 * 반환된 문자열은 브라우저 blob URL 다운로드 또는
 * main 의 파일저장 IPC 에 바로 전달할 수 있다.
 */
export function buildHtmlReport(model: HarnessModel): string {
  const { meta, warnings } = model

  const warningsHtml = warnings.length > 0
    ? warnings.map((w) => `<div class="warning">${esc(w)}</div>`).join('')
    : ''

  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Harness Studio 리포트 — ${esc(meta.name)}</title>
  <style>${INLINE_CSS}</style>
</head>
<body>
  <h1>Harness Studio 리포트</h1>
  <p class="meta">
    번들: <strong>${esc(meta.name)}</strong>${meta.version ? ` v${esc(meta.version)}` : ''} &middot;
    종류: ${esc(meta.kind)} &middot;
    에이전트: ${model.agents.length}개 &middot;
    생성: ${esc(now)}
  </p>
  ${warningsHtml}

  <h2>에이전트</h2>
  ${buildAgentsTable(model)}

  <h2>레벨 체인</h2>
  ${buildLevelsSection(model)}

  <h2>게이트 &amp; Hooks</h2>
  ${buildGatesSection(model)}

  <h2>점수 (6축)</h2>
  ${buildScoreSection(model)}

  <h2>산출물</h2>
  ${buildArtifactsSection(model)}
</body>
</html>`
}

/**
 * HarnessModel HTML 리포트를 브라우저 다운로드로 저장한다.
 *
 * main 의 파일저장 IPC 가 없을 때의 폴백.
 * 파일명: harness-report-{name}-{date}.html
 */
export function downloadHtmlReport(model: HarnessModel): void {
  const html = buildHtmlReport(model)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `harness-report-${model.meta.name}-${dateStr}.html`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  // 메모리 정리 — 약간의 딜레이 후 revoke
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }, 1000)
}

/**
 * 클립보드에 HTML 리포트를 복사한다.
 *
 * 다운로드가 여의치 않은 환경에서의 대안.
 * 성공 여부를 boolean 으로 반환한다.
 */
export async function copyHtmlReportToClipboard(model: HarnessModel): Promise<boolean> {
  try {
    const html = buildHtmlReport(model)
    await navigator.clipboard.writeText(html)
    return true
  } catch {
    return false
  }
}
