import type { DoorayTask } from '../../../../shared/types/dooray'

const DAY_MS = 86_400_000

/** 대시보드 지표 묶음. 카드로 노출하는 값과 진행률 줄로 강등한 값이 함께 들어있다. */
export interface DashboardStats {
  backlog: number
  registered: number
  working: number
  closed: number
  total: number
  dueToday: number
  /** 등록 상태로 가장 오래 대기 중인 태스크의 경과 일수 — 「등록됨」 카드의 해석 문구에 쓴다 */
  longestWaitingDays: number
  /** 완료 비율(0~100, 소수 1자리). total 이 0 이면 0. */
  donePercent: number
}

/**
 * 마감일 비교용 날짜 키(YYYY-MM-DD).
 * 두레이 dueDateAt 문자열의 앞 10자와 맞추기 위해 UTC 기준을 쓴다 — 로컬 기준으로 바꾸면
 * 자정 근처에서 기존 표시와 어긋난다. 시간대 정합은 dueDateAt 실제 포맷 확인 후 별도로 다룬다.
 */
export function dueDateKey(at: Date): string {
  return at.toISOString().substring(0, 10)
}

/** 태스크 목록에서 대시보드 지표를 계산한다. now 는 테스트에서 고정할 수 있게 주입받는다. */
export function computeDashboardStats(tasks: DoorayTask[], now: Date = new Date()): DashboardStats {
  const byClass = { backlog: 0, registered: 0, working: 0, closed: 0 }
  const todayKey = dueDateKey(now)
  let dueToday = 0
  let longestWaitingDays = 0

  for (const task of tasks) {
    const cls = (task.workflowClass || 'registered') as keyof typeof byClass
    if (cls in byClass) byClass[cls]++
    if (task.dueDateAt?.substring(0, 10) === todayKey) dueToday++
    if (cls === 'registered') {
      const created = new Date(task.createdAt).getTime()
      if (!Number.isNaN(created)) {
        longestWaitingDays = Math.max(longestWaitingDays, Math.floor((now.getTime() - created) / DAY_MS))
      }
    }
  }

  const total = tasks.length
  const donePercent = total === 0 ? 0 : Math.round((byClass.closed / total) * 1000) / 10

  return { ...byClass, total, dueToday, longestWaitingDays, donePercent }
}

/**
 * 「오늘 집중」 목록. 오늘 마감 + 진행 중을 합치되 종료된 건은 제외한다.
 * 배지 카운트와 목록이 같은 배열을 봐야 숫자와 눈에 보이는 줄 수가 어긋나지 않는다.
 */
export function selectFocusTasks(tasks: DoorayTask[], now: Date = new Date(), limit = 10): DoorayTask[] {
  const todayKey = dueDateKey(now)
  const dueToday = tasks.filter((t) => t.dueDateAt?.substring(0, 10) === todayKey)
  const working = tasks.filter((t) => t.workflowClass === 'working')
  const seen = new Set<string>()
  const merged: DoorayTask[] = []
  for (const task of [...dueToday, ...working]) {
    if (task.workflowClass === 'closed') continue
    if (seen.has(task.id)) continue
    seen.add(task.id)
    merged.push(task)
  }
  return merged.slice(0, limit)
}
