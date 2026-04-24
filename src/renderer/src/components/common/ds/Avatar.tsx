export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  name?: string
  size?: AvatarSize
  /** 명시적 색상 override. 없으면 이름 해시로 자동 선택 */
  tone?: string
  className?: string
}

const PALETTE = ['#EA580C', '#2563EB', '#22C55E', '#A78BFA', '#FACC15', '#EF4444']

/** 이름 첫 2글자 + 색상 해시 기반 아바타.
 *  서버 프로필 이미지가 없을 때 대체용. */
function Avatar({ name = '', size = 'md', tone, className = '' }: AvatarProps): JSX.Element {
  const initials = name.trim().slice(0, 2).toUpperCase() || '·'
  const idx = Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length
  const bg = tone || PALETTE[idx]
  const sizeCls = size === 'md' ? '' : ` ${size}`
  return (
    <span
      className={`ds-avatar${sizeCls} ${className}`}
      style={{ background: bg + '22', color: bg, borderColor: bg + '44' }}
    >
      {initials}
    </span>
  )
}

export default Avatar
