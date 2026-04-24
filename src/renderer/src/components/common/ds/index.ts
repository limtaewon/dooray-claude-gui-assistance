/** Clauday Design System v1 — common primitives
 *
 * CSS 유틸리티는 src/renderer/src/design-system.css 에 정의돼 있고
 * index.css에서 import 되어 앱 전역에 로드됨.
 *
 * 사용 예:
 *   import { Button, Card, Chip, useToast } from '@/components/common/ds'
 *
 * 또는 파일별 기본 export 로:
 *   import Button from '@/components/common/ds/Button'
 */
export { default as Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { default as Chip } from './Chip'
export type { ChipProps, ChipTone } from './Chip'

export { default as Badge } from './Badge'
export type { BadgeTone } from './Badge'

export { default as Avatar } from './Avatar'
export type { AvatarProps, AvatarSize } from './Avatar'

export { default as Card } from './Card'
export type { CardProps, CardVariant } from './Card'

export { default as Input, Textarea, FieldLabel } from './Input'
export type { InputProps, TextareaProps, InputSize } from './Input'

export { default as Kbd } from './Kbd'
export { default as SegTabs } from './SegTabs'
export type { SegTabsProps, SegTabItem } from './SegTabs'

export { default as Modal } from './Modal'
export type { ModalProps } from './Modal'

export { default as ToastHost, useToast } from './Toast'
export type { ToastInput, ToastApi, ToastTone } from './Toast'

export { default as CommandPalette } from './CommandPalette'
export type { CommandPaletteProps, CommandGroup, CommandItem } from './CommandPalette'

export { EmptyView, LoadingView, ErrorView } from './StateViews'
export type { EmptyViewProps, ErrorViewProps } from './StateViews'

export { default as TimeAgo } from './TimeAgo'
export type { TimeAgoProps } from './TimeAgo'
