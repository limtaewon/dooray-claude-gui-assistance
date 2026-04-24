import { forwardRef } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

export type InputSize = 'sm' | 'md'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', className = '', ...rest },
  ref
) {
  const sz = size === 'md' ? '' : ` ${size}`
  return <input ref={ref} className={`ds-input${sz} ${className}`} {...rest} />
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', ...rest },
  ref
) {
  return <textarea ref={ref} className={`ds-input ${className}`} {...rest} />
})

export function FieldLabel({ children, className = '' }: { children: React.ReactNode; className?: string }): JSX.Element {
  return <label className={`ds-field-label ${className}`}>{children}</label>
}

export default Input
