import { useState, useCallback } from 'react'
import { FolderOpen, Search, Upload } from 'lucide-react'
import type { DiscoveredHarness, RawBundleSummary } from '@shared/types/harness'
import Button from '@/components/common/ds/Button'
import Card from '@/components/common/ds/Card'
import Chip from '@/components/common/ds/Chip'
import { LoadingView, ErrorView } from '@/components/common/ds/StateViews'

export interface SourceStepProps {
  onScanReady: (path: string, summary: RawBundleSummary) => void
}

/**
 * Import 위저드 1단계 — 소스 선택.
 *
 * 세 가지 방법을 제공한다:
 * 1. 드롭존: 폴더를 드래그·드롭
 * 2. 폴더 선택 다이얼로그: harness.scan({ pickDialog: true })
 * 3. 자동 발견: harness.discover() → ~/.claude/skills/* 목록
 *
 * 사용자가 소스를 선택하면 즉시 harness.scan 을 호출해 RawBundleSummary 를 받은 뒤
 * onScanReady 로 부모에게 전달한다.
 */
export function SourceStep({ onScanReady }: SourceStepProps): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredHarness[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(async (args: { path?: string; pickDialog?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const summary = await window.api.harness.scan(args)
      if (summary == null) {
        // 사용자가 다이얼로그를 취소한 경우
        setLoading(false)
        return
      }
      // pickDialog 는 path 가 없으니 HarnessService 에서 절대경로를 반환하지 않는다.
      // scan 결과를 통해 path 는 다음 단계에서 별도 IPC 없이 쓸 수 있도록
      // 다이얼로그 경우엔 summary.meta 가 없으므로 path 를 내부 저장이 필요하다.
      // — 단, 현재 preload 시그니처상 scan 은 path 를 인자로 받고, pickDialog=true 시
      //   main 이 dialog 로 path 를 선택 후 scan 결과만 반환한다.
      //   렌더러는 path 를 알 수 없으므로 summary.source 가 없다면 빈 string 로 넘기고
      //   NormalizeStep 에서 다시 dialog 또는 pickDialog 경로로 진행한다.
      const resolvedPath = args.path ?? ''
      onScanReady(resolvedPath, summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [onScanReady])

  const handleFolderPick = useCallback(() => {
    void runScan({ pickDialog: true })
  }, [runScan])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    // Electron webContents 에서 드롭된 파일/폴더 경로를 얻는다
    const items = Array.from(e.dataTransfer.files)
    if (items.length === 0) return
    const first = items[0] as File & { path?: string }
    const droppedPath = first.path ?? ''
    if (!droppedPath) {
      setError('폴더 경로를 확인할 수 없습니다. 폴더 선택 버튼을 사용해주세요.')
      return
    }
    void runScan({ path: droppedPath })
  }, [runScan])

  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    setError(null)
    try {
      const list = await window.api.harness.discover()
      setDiscovered(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiscovering(false)
    }
  }, [])

  const handleDiscoveredSelect = useCallback((path: string) => {
    void runScan({ path })
  }, [runScan])

  if (loading) {
    return <LoadingView label="번들 스캔 중..." />
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {error && (
        <ErrorView
          title="스캔 오류"
          body={error}
          onRetry={() => setError(null)}
        />
      )}

      {/* 드롭존 + 폴더 선택 */}
      <div
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'min-h-[180px] rounded-lg border-2 border-dashed',
          'transition-colors duration-150 cursor-pointer',
          isDragOver
            ? 'border-[color:var(--c-blue-solid)] bg-[color:var(--c-blue-bg)]'
            : 'border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] hover:border-[color:var(--c-blue-solid)] hover:bg-[color:var(--c-blue-bg)]'
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={handleFolderPick}
        role="button"
        aria-label="번들 폴더 선택"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleFolderPick() }}
      >
        <Upload
          size={28}
          className={isDragOver ? 'text-[color:var(--c-blue-solid)]' : 'text-[color:var(--text-tertiary)]'}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-[color:var(--text-primary)]">
            번들 폴더를 여기에 드래그하거나 클릭하여 선택
          </p>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            reined-bmad, neon-bmad 등 bmad 번들 폴더
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<FolderOpen size={12} />}
          onClick={(e) => { e.stopPropagation(); handleFolderPick() }}
        >
          폴더 선택
        </Button>
      </div>

      {/* 자동 발견 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
            자동 발견
          </span>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Search size={11} />}
            onClick={handleDiscover}
            disabled={discovering}
          >
            {discovering ? '탐색 중...' : '~/.claude/skills 스캔'}
          </Button>
        </div>

        {discovered !== null && (
          discovered.length === 0 ? (
            <p className="text-xs text-[color:var(--text-secondary)] px-1">
              ~/.claude/skills 에서 번들을 찾지 못했습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {discovered.map((h) => (
                <Card
                  key={h.path}
                  variant="flat"
                  className="flex items-center gap-2 cursor-pointer hover:bg-[color:var(--bg-surface-hover)] transition-colors"
                  onClick={() => handleDiscoveredSelect(h.path)}
                  role="button"
                  aria-label={`${h.name} 선택`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDiscoveredSelect(h.path) }}
                >
                  <KindChip kind={h.kind} />
                  <span className="text-sm font-medium text-[color:var(--text-primary)]">{h.name}</span>
                  <span className="text-xs text-[color:var(--text-tertiary)] truncate flex-1 min-w-0">{h.path}</span>
                  <Button variant="ghost" size="xs">선택</Button>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/** 번들 kind 표시용 칩 */
function KindChip({ kind }: { kind: string }): JSX.Element {
  const MAP: Record<string, { label: string; tone: React.ComponentProps<typeof Chip>['tone'] }> = {
    bundle:          { label: '번들',       tone: 'blue' },
    overlay:         { label: '오버레이',   tone: 'violet' },
    'partial-skill': { label: '부분스킬',  tone: 'yellow' },
    task:            { label: '태스크',     tone: 'emerald' }
  }
  const cfg = MAP[kind] ?? { label: kind, tone: 'neutral' as const }
  return <Chip tone={cfg.tone} square>{cfg.label}</Chip>
}

export { KindChip }
