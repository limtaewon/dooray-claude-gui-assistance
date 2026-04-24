import type { ReactNode } from 'react'

/** 키보드 단축키 표시. 예: <Kbd>⌘</Kbd> <Kbd>K</Kbd> */
function Kbd({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <span className={`ds-kbd ${className}`}>{children}</span>
}

export default Kbd
