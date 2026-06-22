/**
 * 게이트 규칙(ruleDetails)을 성격별로 그룹핑하는 순수 함수 유틸리티.
 *
 * 분류 기준:
 * - 'existence' (산출물 존재): message 에 '없음'|'존재' 포함 (섹션/도메인 아닐 때)
 * - 'section' (필수 섹션): message 에 '## ' 또는 '섹션' 포함
 * - 'content' (내용 검증): 그 외 나머지 (측정지표·AC·추적성·통과 등)
 * - 'domain' (도메인·코드 규약): code 가 AOP/LYR/PUSH/SEC 류 또는
 *   message 에 '@Transactional'|'레이어'|'Mapper'|'규약'|'금지'|'푸시'|'push' 포함
 * - 'other': 위 어느 범주에도 속하지 않는 경우 (사실상 content 와 합류하지만 명시적으로 분리)
 *
 * 그룹 표시 순서: existence → section → content → domain → other
 */

export type RuleCategory = 'existence' | 'section' | 'content' | 'domain' | 'other'

/** 그룹별 한국어 레이블 */
export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  existence: '산출물 존재',
  section: '필수 섹션',
  content: '내용 검증',
  domain: '도메인·코드 규약',
  other: '기타'
}

/** 그룹 표시 순서 */
const CATEGORY_ORDER: RuleCategory[] = ['existence', 'section', 'content', 'domain', 'other']

/** 규칙 상세 한 건 */
export interface RuleDetail {
  code: string
  message: string
}

/** 성격별 그룹 */
export interface RuleGroup {
  /** 카테고리 식별자 */
  category: RuleCategory
  /** 한국어 표시 레이블 */
  label: string
  /** 이 그룹에 속하는 규칙 목록 */
  rules: RuleDetail[]
}

/**
 * 규칙 코드와 메시지를 분석해 카테고리를 결정한다.
 *
 * 우선순위 (높은 것이 먼저 적용):
 * 1. domain: code 패턴(/AOP|LYR|PUSH|SEC/i) 또는 message 에 도메인 규약 키워드 포함
 * 2. section: message 에 '## ' 또는 '섹션' 포함
 * 3. existence: message 에 '없음' 또는 '존재' 포함
 * 4. content: 그 외
 */
export function categorizeRule(code: string, message: string): RuleCategory {
  // 1. 도메인·코드 규약 — code 패턴 또는 message 키워드
  const isDomainCode = /AOP|LYR|PUSH|SEC/i.test(code)
  const isDomainMessage =
    message.includes('@Transactional') ||
    message.includes('레이어') ||
    message.includes('Mapper') ||
    message.includes('규약') ||
    message.includes('금지') ||
    message.includes('푸시') ||
    message.toLowerCase().includes('push')

  if (isDomainCode || isDomainMessage) return 'domain'

  // 2. 필수 섹션 — '## ' 또는 '섹션' 포함
  if (message.includes('## ') || message.includes('섹션')) return 'section'

  // 3. 산출물 존재 — '없음' 또는 '존재' 포함
  if (message.includes('없음') || message.includes('존재')) return 'existence'

  // 4. 내용 검증 — 그 외
  return 'content'
}

/**
 * ruleDetails 배열을 성격별로 그룹핑해 반환한다.
 *
 * - 빈 그룹은 제외한다.
 * - 출력 순서: existence → section → content → domain → other
 * - ruleDetails 가 없거나 빈 배열이면 빈 배열을 반환한다.
 */
export function groupRuleDetails(
  ruleDetails: ReadonlyArray<{ code: string; message: string }> | undefined
): RuleGroup[] {
  if (!ruleDetails || ruleDetails.length === 0) return []

  const buckets = new Map<RuleCategory, RuleDetail[]>()

  for (const d of ruleDetails) {
    const cat = categorizeRule(d.code, d.message)
    const arr = buckets.get(cat) ?? []
    arr.push({ code: d.code, message: d.message })
    buckets.set(cat, arr)
  }

  return CATEGORY_ORDER
    .filter((cat) => buckets.has(cat))
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABEL[cat],
      rules: buckets.get(cat)!
    }))
}
