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
      }
    }
  },
  plugins: []
}
