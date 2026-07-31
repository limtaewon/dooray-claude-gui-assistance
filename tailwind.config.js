/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx,html}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 'clover-blue' / 'clover-orange' 였던 초기 브랜드 명을 Clauday 로 통일.
        brand: {
          claude: 'var(--brand-claude)',
          dooray: 'var(--brand-dooray)',
          terminal: 'var(--brand-terminal)',
          // tint 배경은 이 짝을 쓴다 — `bg-brand-dooray/10` 처럼 불투명도를 붙이면 규칙이 드롭된다.
          'claude-bg': 'var(--brand-claude-bg)',
          'dooray-bg': 'var(--brand-dooray-bg)',
          'terminal-bg': 'var(--brand-terminal-bg)'
        },
        /** 링크 — 행동 유도가 본질이라 크롬 무채색화 대상이 아니다. */
        link: 'var(--link)',
        /** 의미색 페어. 배경(-bg)과 전경(-fg)을 항상 짝으로 쓴다. */
        c: {
          'blue-bg': 'var(--c-blue-bg)', 'blue-fg': 'var(--c-blue-fg)', 'blue-solid': 'var(--c-blue-solid)',
          'red-bg': 'var(--c-red-bg)', 'red-fg': 'var(--c-red-fg)', 'red-solid': 'var(--c-red-solid)',
          'orange-bg': 'var(--c-orange-bg)', 'orange-fg': 'var(--c-orange-fg)', 'orange-solid': 'var(--c-orange-solid)',
          'emerald-bg': 'var(--c-emerald-bg)', 'emerald-fg': 'var(--c-emerald-fg)', 'emerald-solid': 'var(--c-emerald-solid)',
          'violet-bg': 'var(--c-violet-bg)', 'violet-fg': 'var(--c-violet-fg)',
          'neutral-bg': 'var(--c-neutral-bg)', 'neutral-fg': 'var(--c-neutral-fg)'
        },
        // 소스 제어 — 파일 상태 색. 그래프 레인 색은 SVG 에서 var() 로 직접 읽는다.
        git: {
          added: 'var(--git-added)',
          deleted: 'var(--git-deleted)',
          modified: 'var(--git-modified)',
          untracked: 'var(--git-untracked)'
        },
        clauday: {
          blue: 'var(--accent-blue)',
          'blue-light': 'var(--accent-blue-light)',
          orange: 'var(--accent-orange)',
          'orange-light': 'var(--accent-orange-light)'
        },
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          subtle: 'var(--bg-subtle)',
          border: 'var(--bg-border)',
          'border-light': 'var(--bg-border-light)',
          'border-strong': 'var(--bg-border-strong)',
          base: 'var(--bg-base)',
          'surface-raised': 'var(--bg-surface-raised)',
          sidebar: 'var(--bg-sidebar)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)'
        },
        // 알림 배지 — 테마별 토큰(라이트=브랜드 오렌지 유지, 다크=무채색 밝은 면)
        badge: {
          bg: 'var(--badge-bg)',
          fg: 'var(--badge-fg)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      // 글자 크기 스케일(--app-font-scale)에 반응하도록 named text 유틸 재정의.
      // root font-size 는 16px 고정이라 rem 여백은 안 커지고, 여기 font-size/line-height 만 커진다.
      // scale=1 이면 Tailwind 기본값과 픽셀 단위로 동일.
      fontSize: {
        xs: ['calc(0.75rem * var(--app-font-scale, 1))', { lineHeight: 'calc(1rem * var(--app-font-scale, 1))' }],
        sm: ['calc(0.875rem * var(--app-font-scale, 1))', { lineHeight: 'calc(1.25rem * var(--app-font-scale, 1))' }],
        base: ['calc(1rem * var(--app-font-scale, 1))', { lineHeight: 'calc(1.5rem * var(--app-font-scale, 1))' }],
        lg: ['calc(1.125rem * var(--app-font-scale, 1))', { lineHeight: 'calc(1.75rem * var(--app-font-scale, 1))' }],
        xl: ['calc(1.25rem * var(--app-font-scale, 1))', { lineHeight: 'calc(1.75rem * var(--app-font-scale, 1))' }],
        '2xl': ['calc(1.5rem * var(--app-font-scale, 1))', { lineHeight: 'calc(2rem * var(--app-font-scale, 1))' }],
        '3xl': ['calc(1.875rem * var(--app-font-scale, 1))', { lineHeight: 'calc(2.25rem * var(--app-font-scale, 1))' }],
        '4xl': ['calc(2.25rem * var(--app-font-scale, 1))', { lineHeight: 'calc(2.5rem * var(--app-font-scale, 1))' }]
      }
    }
  },
  plugins: []
}
