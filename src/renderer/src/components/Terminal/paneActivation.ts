/** pane 활성화 판정 입력. isActive 는 레거시 3호스트(TerminalView/MentionAgentView/BranchWorkspace) 호환용 폴백이다. */
export interface PaneActivationInput {
  isVisible?: boolean
  isFocused?: boolean
  /** @deprecated isVisible/isFocused 를 쓰세요. */
  isActive?: boolean
}

export interface PaneActivation {
  visible: boolean
  focused: boolean
}

/**
 * pane 의 가시성/포커스 최종 판정. isVisible/isFocused 가 각각 없으면 isActive 로 폴백하고,
 * 그마저 없으면 visible=true/focused=false 로 떨어진다 (ADR-v2-terminal-p2-01 §1).
 */
export function resolvePaneActivation({ isVisible, isFocused, isActive }: PaneActivationInput): PaneActivation {
  return {
    visible: isVisible ?? isActive ?? true,
    focused: isFocused ?? isActive ?? false
  }
}
