import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** success 는 제거했다 — 완료 상태색을 실행 버튼에 쓰면 워크플로 칩 「완료」와 같은 색이 된다. 주 액션은 primary. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai' | 'orange' | 'icon'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

/** Design System v1 Button
 *  사용: <Button variant="primary" size="sm" leftIcon={<Plus size={11} />}>새 태스크</Button> */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size, leftIcon, rightIcon, className = '', children, ...rest },
  ref
) {
  const sizeCls = size && size !== 'md' ? ` ${size}` : ''
  return (
    <button ref={ref} className={`ds-btn ${variant}${sizeCls} ${className}`} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
})

export default Button
