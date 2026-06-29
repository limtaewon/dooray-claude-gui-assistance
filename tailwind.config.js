/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx,html}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 'clover-blue' / 'clover-orange' 였던 초기 브랜드 명을 Clauday 로 통일.
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
          'border-light': 'var(--bg-border-light)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)'
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
