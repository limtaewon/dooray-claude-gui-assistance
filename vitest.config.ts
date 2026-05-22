import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'out', 'release', 'release-builds', 'dist'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/main/**/*.ts',
        'src/renderer/src/hooks/**/*.ts',
        'src/renderer/src/components/common/ds/**/*.{ts,tsx}',
        'src/shared/**/*.ts'
      ],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/index.ts',
        'src/main/index.ts',
        'src/preload/**',
        'src/shared/types/**'
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 80
      }
    }
  }
})
