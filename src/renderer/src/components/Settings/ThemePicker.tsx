import { Check, Palette as PaletteIcon } from 'lucide-react'
import { useTheme as useThemeFromHook, type Palette } from '../../hooks/useTheme'

/**
 * 라이트 모드 팔레트 후보들. 각 후보는 3층 구조(사이드바/메인/상세) + 액센트 미리보기.
 * 선택 시 :root에 CSS 변수를 주입 + localStorage 저장.
 */

interface LightPalette {
  id: string
  name: string
  description: string
  vars: {
    '--bg-sidebar': string
    '--bg-base': string
    '--bg-surface': string
    '--bg-surface-raised': string
    '--bg-primary': string
    '--bg-surface-hover': string
    '--bg-subtle': string
    '--bg-hover': string
    '--bg-active': string
    '--bg-border': string
    '--bg-border-light': string
    '--bg-border-strong': string
    '--text-primary': string
    '--text-secondary': string
    '--text-tertiary': string
  }
}

const PALETTES: LightPalette[] = [
  {
    id: 'cool-minimal',
    name: 'Cool Minimal',
    description: '푸른빛이 아주 살짝 섞인 중성 회색 — 차분하고 정갈',
    vars: {
      '--bg-sidebar': '#E9ECF2',
      '--bg-base': '#EFF1F5',
      '--bg-surface': '#F6F7FA',
      '--bg-surface-raised': '#FCFCFD',
      '--bg-primary': '#EFF1F5',
      '--bg-surface-hover': '#E3E6EC',
      '--bg-subtle': '#E6E9EF',
      '--bg-hover': '#E3E6EC',
      '--bg-active': '#D8DCE3',
      '--bg-border': '#DFE2E8',
      '--bg-border-light': '#C7CBD3',
      '--bg-border-strong': '#C7CBD3',
      '--text-primary': '#1C2130',
      '--text-secondary': '#4F5769',
      '--text-tertiary': '#8A91A1'
    }
  },
  {
    id: 'crisp-white',
    name: 'Crisp White',
    description: '거의 순백 — 레이어 간 차이를 그림자·보더로만 표현',
    vars: {
      '--bg-sidebar': '#F5F6F8',
      '--bg-base': '#FAFAFB',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-raised': '#FFFFFF',
      '--bg-primary': '#FAFAFB',
      '--bg-surface-hover': '#F0F1F3',
      '--bg-subtle': '#F3F4F6',
      '--bg-hover': '#F0F1F3',
      '--bg-active': '#E5E7EB',
      '--bg-border': '#E5E7EB',
      '--bg-border-light': '#D1D5DB',
      '--bg-border-strong': '#D1D5DB',
      '--text-primary': '#111827',
      '--text-secondary': '#4B5563',
      '--text-tertiary': '#9CA3AF'
    }
  },
  {
    id: 'soft-blue',
    name: 'Soft Blue',
    description: 'Linear 스타일 옅은 블루그레이 — 시원하고 테크',
    vars: {
      '--bg-sidebar': '#E2E6EE',
      '--bg-base': '#E9EDF3',
      '--bg-surface': '#F2F4F8',
      '--bg-surface-raised': '#FBFCFD',
      '--bg-primary': '#E9EDF3',
      '--bg-surface-hover': '#DCE0E9',
      '--bg-subtle': '#DFE3EB',
      '--bg-hover': '#DCE0E9',
      '--bg-active': '#CED4DE',
      '--bg-border': '#D1D6DE',
      '--bg-border-light': '#B6BCC6',
      '--bg-border-strong': '#B6BCC6',
      '--text-primary': '#101828',
      '--text-secondary': '#414D5F',
      '--text-tertiary': '#798396'
    }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: '진한 쿨그레이 — 레이어 위계가 뚜렷, 밀도감',
    vars: {
      '--bg-sidebar': '#DEE2EA',
      '--bg-base': '#E6E9EF',
      '--bg-surface': '#F0F2F6',
      '--bg-surface-raised': '#FAFBFC',
      '--bg-primary': '#E6E9EF',
      '--bg-surface-hover': '#D9DCE4',
      '--bg-subtle': '#DCDFE7',
      '--bg-hover': '#D9DCE4',
      '--bg-active': '#CBCFD9',
      '--bg-border': '#CDD2DB',
      '--bg-border-light': '#B0B6C2',
      '--bg-border-strong': '#B0B6C2',
      '--text-primary': '#0F172A',
      '--text-secondary': '#334155',
      '--text-tertiary': '#64748B'
    }
  },
  {
    id: 'paper',
    name: 'Paper',
    description: '뉴트럴 페이퍼 톤 — 황사 느낌 없이 담백한 오프화이트',
    vars: {
      '--bg-sidebar': '#EEEEEE',
      '--bg-base': '#F4F4F4',
      '--bg-surface': '#FAFAFA',
      '--bg-surface-raised': '#FFFFFF',
      '--bg-primary': '#F4F4F4',
      '--bg-surface-hover': '#E8E8E8',
      '--bg-subtle': '#EBEBEB',
      '--bg-hover': '#E8E8E8',
      '--bg-active': '#DCDCDC',
      '--bg-border': '#E0E0E0',
      '--bg-border-light': '#C4C4C4',
      '--bg-border-strong': '#C4C4C4',
      '--text-primary': '#1A1A1A',
      '--text-secondary': '#4A4A4A',
      '--text-tertiary': '#8A8A8A'
    }
  }
]

const STORAGE_KEY = 'light-palette'

/** @deprecated Design System v1부터 팔레트는 useTheme + data-palette 속성으로 관리.
 *  이 함수는 레거시 main.tsx 호환을 위해 no-op으로 유지.
 *  실제 적용은 useTheme.initTheme()가 담당. */
export function initLightPalette(): void {
  /* no-op: useTheme이 data-palette 속성을 설정해 CSS 셀렉터로 팔레트 적용 */
}

function PreviewMockup({ palette, active, onPick }: {
  palette: LightPalette
  active: boolean
  onPick: () => void
}): JSX.Element {
  const v = palette.vars
  return (
    <button onClick={onPick}
      className={`relative text-left rounded-2xl overflow-hidden transition-all ${
        active ? 'ring-2 ring-clover-blue ring-offset-2 ring-offset-bg-primary' : 'hover:opacity-90'
      }`}
      style={{ border: `1px solid ${v['--bg-border']}` }}>
      {/* 상단 헤더 */}
      <div className="px-4 pt-3 pb-2" style={{ background: v['--bg-base'] }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: v['--text-primary'] }}>{palette.name}</span>
          {active && <span className="flex items-center gap-1 text-[10px] text-clover-blue"><Check size={11} /> 적용됨</span>}
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: v['--text-tertiary'] }}>{palette.description}</p>
      </div>

      {/* 3레이어 미니 프리뷰 */}
      <div className="flex h-40" style={{ background: v['--bg-base'] }}>
        {/* Sidebar */}
        <div className="w-10 flex flex-col items-center gap-1.5 pt-2"
          style={{ background: v['--bg-sidebar'], borderRight: `1px solid ${v['--bg-border']}` }}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: '#2563EB' }}>
            <div className="w-3 h-3 rounded bg-white/90" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-5 h-5 rounded"
              style={{ background: v['--bg-surface-hover'] }} />
          ))}
        </div>
        {/* Main list */}
        <div className="flex-1 px-2 py-2 space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded"
              style={{
                background: i === 1 ? v['--bg-surface'] : 'transparent',
                border: i === 1 ? `1px solid ${v['--bg-border']}` : '1px solid transparent'
              }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
              <div className="h-1.5 rounded flex-1"
                style={{ background: v['--text-primary'], opacity: 0.8 }} />
              <div className="h-1 w-8 rounded"
                style={{ background: '#DCE6FB' }} />
            </div>
          ))}
        </div>
        {/* Detail */}
        <div className="w-24 px-2 py-2"
          style={{ background: v['--bg-surface-raised'], borderLeft: `1px solid ${v['--bg-border']}` }}>
          <div className="h-2 rounded mb-1.5" style={{ background: v['--text-primary'], opacity: 0.9, width: '80%' }} />
          <div className="h-1.5 rounded mb-1" style={{ background: v['--text-secondary'], opacity: 0.5 }} />
          <div className="h-1.5 rounded mb-3" style={{ background: v['--text-secondary'], opacity: 0.5, width: '70%' }} />
          <div className="h-1 rounded mb-1" style={{ background: v['--text-tertiary'], opacity: 0.4 }} />
          <div className="h-1 rounded" style={{ background: v['--text-tertiary'], opacity: 0.4, width: '50%' }} />
        </div>
      </div>

      {/* 팔레트 스와치 */}
      <div className="flex items-center gap-1 px-4 py-2" style={{ background: v['--bg-surface'], borderTop: `1px solid ${v['--bg-border']}` }}>
        <span className="text-[9px]" style={{ color: v['--text-tertiary'] }}>배경 레이어</span>
        {[v['--bg-sidebar'], v['--bg-base'], v['--bg-surface'], v['--bg-surface-raised']].map((c, i) => (
          <span key={i} className="w-3 h-3 rounded-sm"
            style={{ background: c, border: `1px solid ${v['--bg-border']}` }} title={c} />
        ))}
      </div>
    </button>
  )
}

function ThemePicker(): JSX.Element {
  // useTheme의 palette를 단일 source of truth로 사용. data-palette 속성이 자동 반영됨.
  const { palette, setPalette } = useThemeFromHook()
  const selected = palette
  const setSelected = (id: string): void => {
    const p = PALETTES.find((x) => x.id === id)
    if (p) setPalette(p.id as Palette)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-clover-blue/10 border border-clover-blue/30">
          <PaletteIcon size={14} className="text-clover-blue" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">라이트 팔레트 고르기</h3>
          <p className="text-[10px] text-text-tertiary">마음에 드는 걸 클릭하면 즉시 적용됩니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PALETTES.map((p) => (
          <PreviewMockup key={p.id} palette={p} active={selected === p.id} onPick={() => setSelected(p.id)} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] text-text-tertiary">
        <span>💡 다크모드에서는 이 선택이 무시되고 기본 다크 팔레트가 적용됩니다</span>
        <button onClick={() => setSelected('cool-minimal')}
          className="px-2 py-1 rounded hover:text-text-secondary">
          기본값으로 초기화
        </button>
      </div>
    </div>
  )
}

export default ThemePicker
