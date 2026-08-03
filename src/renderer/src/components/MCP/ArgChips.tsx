import { Lock } from 'lucide-react'
import { maskArgSecrets } from './maskSecrets'

/**
 * stdio 서버의 실행 인자를 칩으로 보여준다. 시크릿으로 보이는 값은 가린다.
 *
 * 로컬 카드와 공유 카드가 같은 컴포넌트를 쓴다 — 한쪽만 마스킹하면 다른 쪽으로 값이 샌다.
 */
function ArgChips({ args }: { args?: readonly string[] }): JSX.Element | null {
  const masked = maskArgSecrets(args)
  if (masked.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {masked.map((arg, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[calc(11px_*_var(--app-font-scale,1))] font-mono border ${
            arg.masked
              ? 'bg-c-yellow-bg text-c-yellow-fg border-c-yellow-fg'
              : 'bg-bg-surface-hover text-text-secondary border-bg-border'
          }`}
          title={arg.masked ? '시크릿이라 값을 가렸습니다 — 편집에서 확인하세요' : arg.text}
        >
          {arg.masked && <Lock size={10} />}
          {arg.text}
        </span>
      ))}
    </div>
  )
}

export default ArgChips
