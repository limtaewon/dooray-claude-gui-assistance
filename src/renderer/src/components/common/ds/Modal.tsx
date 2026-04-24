import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  icon?: ReactNode
  width?: number | string
  children?: ReactNode
  footer?: ReactNode
  /** ESC/backdrop click 으로 닫기 비활성화 */
  dismissable?: boolean
}

/** 포털 기반 모달. ESC로 닫기, backdrop 클릭으로 닫기 기본 활성 */
function Modal({ open, onClose, title, icon, width, children, footer, dismissable = true }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])

  if (!open) return null

  return createPortal(
    <div className="ds-modal-backdrop" onClick={dismissable ? onClose : undefined}>
      <div className="ds-modal" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        {(title || icon) && (
          <div className="m-head">
            {icon}
            <span className="m-title">{title}</span>
            <span style={{ flex: 1 }} />
            <button className="ds-btn icon sm" onClick={onClose} aria-label="닫기">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="m-body">{children}</div>
        {footer && <div className="m-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export default Modal
