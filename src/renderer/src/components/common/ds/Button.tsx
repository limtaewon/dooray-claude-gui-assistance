import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai' | 'success' | 'orange' | 'icon'
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
