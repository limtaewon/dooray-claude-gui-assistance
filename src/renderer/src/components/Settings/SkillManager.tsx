import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Save, ToggleLeft, ToggleRight, Sparkles, Zap,
  ChevronDown, FileText, Edit3, X, Wand2
} from 'lucide-react'
import type { CloverSkill, SkillTarget } from '../../../../shared/types/skill'
import { SKILL_TARGETS } from '../../../../shared/types/skill'

const TEMPLATES: { name: string; description: string; target: SkillTarget; content: string }[] = [
  {
    name: '배포 누락 확인',
    description: '마일스톤이 지정된 태스크가 있지만 배포 프로젝트에 내 태스크가 없으면 알림',
    target: 'briefing',
    content: `## 규칙
- 재무서비스-배포 프로젝트에서 현재 주차 마일스톤에 확인완료 상태인 태스크 확인
- NEON 프로젝트의 같은 주차 마일스톤에서 내 담당 태스크 존재 여부 확인
- 없으면 "배포 태스크 누락 가능성" 경고 생성

## 출력 형식
- 경고: [프로젝트명] 26년 XX주차 배포에 태스크가 없습니다. 확인 필요.`
  },
  {
    name: '일일 업무 요약',
    description: '오늘 변경된 태스크 상태를 기반으로 업무 진행상황 요약',
    target: 'briefing',
    content: `## 규칙
- 오늘 상태가 변경된 태스크 목록 확인
- 새로 등록된 태스크, 진행 시작된 태스크, 완료된 태스크 분류
- 마감일이 오늘이거나 지난 태스크 경고

## 출력 형식
- [완료] OO건, [진행 시작] OO건, [신규 등록] OO건
- ⚠️ 마감 임박/초과: 태스크 목록`
  },
  {
    name: '주간 보고서 포맷',
    description: '팀 보고 형식에 맞춘 주간 보고서 생성',
    target: 'report',
    content: `## 보고서 포맷
### 금주 실적
- 프로젝트별 완료 태스크 요약

### 차주 계획
- 진행중/등록 태스크 중 다음주 마감 예정 항목

### 이슈 및 리스크
- 지연 태스크 (마감일 초과)
- 의존성 이슈

### 특이사항
- 새로운 요청, 긴급 건`
  },
  {
    name: '캘린더 일정 브리핑',
    description: '오늘 일정을 분석하여 준비사항 안내',
    target: 'calendar',
    content: `## 규칙
- 오늘 일정 목록을 시간순으로 정리
- 회의 사이 여유 시간 분석
- 연속 회의 경고
- 참석자 정보가 있으면 관련 태스크 연결

## 출력 형식
- 09:00-10:00 [회의명] - 준비: OO 관련 자료 확인
- ⚠️ 13:00-16:00 연속 회의 3건`
  }
]

function SkillManager(): JSX.Element {
  const [skills, setSkills] = useState<CloverSkill[]>([])
  const [editing, setEditing] = useState<CloverSkill | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const loadSkills = useCallback(async () => {
    const list = await window.api.cloverSkills.list()
    setSkills(list)
  }, [])

  useEffect(() => { loadSkills() }, [loadSkills])

  const createNew = (): void => {
    setEditing({
      id: `skill-${Date.now()}`,
      name: '',
      description: '',
      target: 'briefing',
      enabled: true,
      content: '',
      autoApply: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }

  const createFromTemplate = (tpl: typeof TEMPLATES[0]): void => {
    setEditing({
      id: `skill-${Date.now()}`,
      name: tpl.name,
      description: tpl.description,
      target: tpl.target,
      enabled: true,
      content: tpl.content,
      autoApply: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    setShowTemplates(false)
  }

  const saveSkill = async (): Promise<void> => {
    if (!editing || !editing.name.trim()) return
    editing.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(editing)
    setEditing(null)
    loadSkills()
  }

  const deleteSkill = async (id: string): Promise<void> => {
    await window.api.cloverSkills.delete(id)
    loadSkills()
  }

  const toggleSkill = async (skill: CloverSkill): Promise<void> => {
    skill.enabled = !skill.enabled
    skill.updatedAt = new Date().toISOString()
    await window.api.cloverSkills.save(skill)
    loadSkills()
  }

  // 편집 모드
  if (editing) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">스킬 편집</h3>
          <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* 이름 */}
          <div>
            <label className="block text-[11px] text-text-secondary mb-1">스킬 이름</label>
            <input type="text" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="예: 배포 누락 확인" className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-clover-blue" />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-[11px] text-text-secondary mb-1">설명</label>
            <input type="text" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="이 스킬이 하는 일을 간단히 설명" className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-clover-blue" />
          </div>

          {/* 적용 대상 + 자동 적용 */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[11px] text-text-secondary mb-1">적용 대상</label>
              <select value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value as SkillTarget })}
                className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-clover-blue">
                {SKILL_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <button onClick={() => setEditing({ ...editing, autoApply: !editing.autoApply })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs ${
                  editing.autoApply ? 'bg-clover-blue/10 border-clover-blue/30 text-clover-blue' : 'bg-bg-surface border-bg-border text-text-secondary'
                }`}>
                {editing.autoApply ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                자동 적용
              </button>
            </div>
          </div>

          {/* 스킬 본문 (마크다운) */}
          <div>
            <label className="block text-[11px] text-text-secondary mb-1">
              스킬 규칙 (마크다운) — AI에게 전달되는 지시사항
            </label>
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              placeholder={`## 규칙\n- 어떤 조건에서 어떤 동작을 할지 작성\n\n## 출력 형식\n- AI가 어떤 형태로 결과를 보여줄지 지정`}
              rows={14}
              className="w-full px-3 py-2 bg-bg-surface border border-bg-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-clover-blue resize-y"
            />
          </div>

          {/* 저장 */}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary border border-bg-border hover:border-bg-border-light">
              취소
            </button>
            <button onClick={saveSkill} disabled={!editing.name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-clover-blue text-white text-sm font-medium hover:bg-clover-blue/80 disabled:opacity-50">
              <Save size={13} /> 저장
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Zap size={14} className="text-clover-orange" /> AI 스킬
          </h3>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            각 탭(브리핑/보고서/캘린더/채팅)에서 AI가 실행할 커스텀 규칙을 정의합니다
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs text-text-secondary hover:text-text-primary hover:border-bg-border-light">
              <Wand2 size={12} /> 템플릿 <ChevronDown size={10} />
            </button>
            {showTemplates && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-20 py-1">
                {TEMPLATES.map((tpl, i) => (
                  <button key={i} onClick={() => createFromTemplate(tpl)}
                    className="w-full text-left px-3 py-2 hover:bg-bg-surface-hover transition-colors">
                    <p className="text-xs text-text-primary font-medium">{tpl.name}</p>
                    <p className="text-[10px] text-text-tertiary">{tpl.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={createNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clover-blue text-white text-xs hover:bg-clover-blue/80">
            <Plus size={12} /> 새 스킬
          </button>
        </div>
      </div>

      {/* 스킬 목록 */}
      {skills.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles size={32} className="text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary mb-1">등록된 스킬이 없습니다</p>
          <p className="text-[10px] text-text-tertiary mb-4">
            스킬을 추가하면 브리핑/보고서/캘린더에서 AI가 커스텀 규칙을 적용합니다
          </p>
          <button onClick={() => setShowTemplates(true)}
            className="text-xs text-clover-blue hover:underline">
            템플릿으로 시작하기
          </button>
        </div>
      ) : (
        <div className="space-y-2 mt-4">
          {skills.map((skill) => (
            <div key={skill.id} className={`bg-bg-surface border rounded-lg p-3 transition-colors ${skill.enabled ? 'border-bg-border' : 'border-bg-border opacity-50'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">{skill.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      skill.target === 'briefing' ? 'bg-clover-orange/10 text-clover-orange' :
                      skill.target === 'report' ? 'bg-purple-500/10 text-purple-400' :
                      skill.target === 'calendar' ? 'bg-emerald-400/10 text-emerald-400' :
                      skill.target === 'chat' ? 'bg-clover-blue/10 text-clover-blue' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>
                      {SKILL_TARGETS.find((t) => t.value === skill.target)?.label}
                    </span>
                    {skill.autoApply && <span className="text-[9px] text-text-tertiary">자동</span>}
                  </div>
                  {skill.description && <p className="text-[10px] text-text-tertiary mt-0.5">{skill.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleSkill(skill)} className="p-1 rounded hover:bg-bg-surface-hover"
                    title={skill.enabled ? '비활성화' : '활성화'}>
                    {skill.enabled ? <ToggleRight size={16} className="text-clover-blue" /> : <ToggleLeft size={16} className="text-text-tertiary" />}
                  </button>
                  <button onClick={() => setEditing(skill)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary">
                    <Edit3 size={13} />
                  </button>
                  <button onClick={() => deleteSkill(skill.id)} className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SkillManager
