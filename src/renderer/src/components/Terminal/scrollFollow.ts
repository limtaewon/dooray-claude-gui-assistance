/**
 * 터미널 auto-follow 판단 로직 (xterm 비의존, 순수 함수).
 *
 * xterm 버퍼의 `viewportY`(현재 보고 있는 최상단 줄) 와 `baseY`(스크롤백 바닥 기준선) 만으로
 * "지금 새 출력이 오면 뷰포트를 바닥으로 따라 내려가야 하는가" 를 결정한다.
 *
 * 정책: 사용자가 바닥(`viewportY >= baseY`)에 있을 때만 새 출력을 따라간다.
 * 위로 스크롤해 과거 출력을 읽는 중(`viewportY < baseY`)이면 그 위치를 유지한다.
 *
 * Why: b4d701e 가 "출력 시 뷰포트가 top 으로 튀는" 문제를 막으려고 매 출력마다 무조건
 * scrollToBottom 을 호출했는데, 그 결과 사용자가 위로 올려 읽는 중에도 바닥으로 끌려가는
 * 회귀가 생겼다. 바닥에 있던 경우에만 따라가게 해 두 요구를 모두 만족시킨다.
 */
export function shouldFollowOutput(viewportY: number, baseY: number): boolean {
  return viewportY >= baseY
}
