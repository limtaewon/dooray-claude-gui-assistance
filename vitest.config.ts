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
      // 단위 테스트 커버리지 스코프: main 비즈니스 로직 + renderer hooks/ds 컴포넌트.
      // renderer 의 view-level 컴포넌트(`components/<도메인>/*View.tsx` 등) 와 main/index.ts(IPC 라우터)는
      // 통합/E2E 단계에서 검증해야 하므로 단위 게이트에서 제외.
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
      // PR 게이트 — 70% 라인 커버리지 강제.
      // 임계치 미달 시 vitest 가 비-0 코드로 종료되어 CI 가 빨간불.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 80
      }
    }
  }
})
