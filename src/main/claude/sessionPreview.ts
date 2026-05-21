/**
 * 세션 jsonl 의 첫 user 메시지를 카드 미리보기용 한 줄 문자열로 정리.
 *
 * - HTML/XML 태그(<system-reminder>, <command-name> 등)를 공백으로 (내용물 보존)
 * - 코드 펜스 블록 통째 제거, 인라인 백틱은 내용만 남김
 * - 줄 시작의 마크다운 마커(# / - / * / > / •) 제거
 * - 줄바꿈/연속 공백 → 단일 공백
 * - 100자 컷
 *
 * 세션 탐색기 카드의 `line-clamp-2` 에서 마크다운 노이즈가 어색하게 보이던 #13 대응.
 */
export function cleanFirstMessage(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[\s>#*•\-]+/gm, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100)
    .trim()
}
