import type { HTMLAttributes, ReactNode } from 'react'

export type CardVariant = 'default' | 'raised' | 'flat'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  children: ReactNode
}

function Card({ variant = 'default', className = '', children, ...rest }: CardProps): JSX.Element {
  const v = variant === 'default' ? '' : ` ${variant}`
  return (
    <div className={`ds-card${v} ${className}`} {...rest}>
      {children}
    </div>
  )
}

export default Card
