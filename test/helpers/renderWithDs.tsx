/**
 * RTL render 래퍼 — 디자인 시스템 Provider (ToastHost 등) 포함.
 *
 * 사용법:
 *   import { renderWithDs } from '../../../test/helpers/renderWithDs'
 *   renderWithDs(<MyComponent />)
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { ToastHost } from '@/components/common/ds'
import type { ReactElement, ReactNode } from 'react'

function AllProviders({ children }: { children: ReactNode }): JSX.Element {
  return <ToastHost>{children as JSX.Element}</ToastHost>
}

export function renderWithDs(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options })
}
