/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        clover: {
          blue: '#3B82F6',
          'blue-light': '#60A5FA',
          orange: '#FB923C',
          'orange-light': '#FDBA74'
        },
        bg: {
          primary: '#111827',
          surface: '#1F2937',
          'surface-hover': '#263244',
          border: '#374151',
          'border-light': '#4B5563'
        },
        text: {
          primary: '#F9FAFB',
          secondary: '#9CA3AF',
          tertiary: '#6B7280'
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
