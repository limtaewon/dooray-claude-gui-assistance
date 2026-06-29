import { useEffect, useState } from 'react'
import { FileCode, Loader2, Download, AlertCircle, Check } from 'lucide-react'
import { Button, useToast } from '../common/ds'

/**
 * #3 CLAUDE.md 카탈로그 — 앱 내장 템플릿을 사용자가 고른 프로젝트 폴더에 적용.
 *
 * 흐름:
 *   1) 마운트 시 main 의 `claudeMdTemplates.list()` 로 목록 fetch
 *   2) "적용" 버튼 → preload 가 dialog 열고 폴더 선택 받음 → CLAUDE.md 작성
 *   3) 이미 있으면 conflict — 사용자 확인 후 overwrite=true 로 재요청
 */

interface TemplateMeta {
  id: string
  name: string
  description: string
}

function ClaudeMdCatalogView(): JSX.Element {
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    window.api.claudeMdTemplates.list()
      .then((list) => { if (!cancelled) setTemplates(list) })
      .catch((err) => { if (!cancelled) toast.error('템플릿 목록 실패', err instanceof Error ? err.message : '') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toast])

  const applyTemplate = async (id: string, overwrite = false): Promise<void> => {
    setApplyingId(id)
    try {
      const r = await window.api.claudeMdTemplates.apply({ id, overwrite })
      if (r.ok) {
        toast.success('CLAUDE.md 작성 완료', r.path)
        return
      }
      if (r.conflict && r.path) {
        const ok = window.confirm(`이미 ${r.path} 가 있습니다. 덮어쓸까요?`)
        if (ok) await applyTemplate(id, true)
        return
      }
      if (r.error === 'cancelled') return  // 사용자 폴더 선택 취소
      toast.error('적용 실패', r.error || '알 수 없는 오류')
    } catch (err) {
      toast.error('적용 실패', err instanceof Error ? err.message : '')
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <FileCode size={20} className="text-clauday-blue" />
        <h2 className="text-lg font-semibold text-text-primary">CLAUDE.md 카탈로그</h2>
      </div>
      <p className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-secondary mb-5 leading-relaxed">
        앱 내장 템플릿을 한 번에 프로젝트 폴더에 적용합니다. 적용 버튼을 누르면 폴더 선택 다이얼로그가 열리고,
        선택한 위치의 <code className="font-mono text-text-primary px-1 bg-bg-surface rounded">CLAUDE.md</code> 에 본문이 저장돼요.
        기존 파일이 있으면 덮어쓸지 한 번 확인합니다.
      </p>

      <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-clauday-orange/30 bg-clauday-orange/5">
        <AlertCircle size={12} className="text-clauday-orange flex-shrink-0" />
        <span className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-secondary">
          템플릿은 시작점일 뿐 — 적용 후 본인 프로젝트에 맞게 수정해서 사용하세요.
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-text-tertiary text-[calc(12px_*_var(--app-font-scale,1))]">
          <Loader2 size={14} className="animate-spin" /> 템플릿 목록 불러오는 중...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-[calc(12px_*_var(--app-font-scale,1))] text-text-tertiary py-12 text-center">템플릿이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => {
            const busy = applyingId === t.id
            return (
              <div key={t.id}
                className="ds-card p-4 flex flex-col gap-2 hover:border-clauday-blue/40 transition-colors">
                <div className="flex items-start gap-2">
                  <FileCode size={16} className="text-clauday-blue mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[calc(13px_*_var(--app-font-scale,1))] font-semibold text-text-primary">{t.name}</div>
                    <div className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5 leading-relaxed">{t.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1" />
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => applyTemplate(t.id)}
                    disabled={busy}
                    leftIcon={busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  >
                    {busy ? '적용 중...' : '적용'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-start gap-2 mt-6 px-3 py-2.5 rounded-lg bg-bg-surface/60 border border-bg-border">
        <Check size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
        <div className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
          새 템플릿 제안은 <code className="font-mono text-text-secondary px-1 bg-bg-primary rounded">src/main/claudeMdCatalog.ts</code> 에 객체 하나 추가하면 됩니다.
        </div>
      </div>
    </div>
  )
}

export default ClaudeMdCatalogView
