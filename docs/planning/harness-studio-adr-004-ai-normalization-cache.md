---
id: ADR-harness-studio-004
title: AI 정규화/Dry-run 캐시 — 파일 JSON + 내용해시
status: proposed
date: 2026-06-19
supersedes: []
domain: ai-service, electron-ipc
---

# AI 정규화/Dry-run 캐시 — 파일 JSON + 내용해시

## 컨텍스트

번들 정규화(Opus)와 레벨 추정(Haiku)은 AI 호출이라 지연·비용이 있다. PRD §5·§8은 "번들 해시 캐시(재오픈 0초)", "태스크 해시 캐시"를 명시한다. Clauday는 이미 `electron-store`(JSON) 와 `<userData>` 파일을 둘 다 쓴다. 어디에 어떤 키로 캐시할지 결정이 필요하다.

캐시 대상: ① HarnessModel(번들당, 수~수십 KB) ② DryRunResult(태스크당, 작음). 무효화 조건: 번들 파일 변경 / 태스크 텍스트 변경 / HarnessModel 스키마 변경.

## 결정

캐시를 **`<userData>/harness-cache/` 하위 파일 JSON** 으로 둔다(electron-store 아님).

```
<userData>/harness-cache/
  bundles/<bundleHash>.json   # HarnessModel
  tasks/<taskHash>.json       # DryRunResult
  index.json                  # 최근 연 하네스 목록 (path/name/cachedAt/schemaVersion)
```

- `bundleHash = sha256(정렬된 [상대경로 + mtimeMs + size] + frontmatter 내용)`. 파일 추가/수정/삭제 시 자동 무효화.
- `taskHash = sha256(bundleHash + 정규화된 taskText)`.
- 읽을 때 `schemaVersion` 비교 → 불일치면 무효화(자동 재정규화). 손상 JSON 도 무효화 처리.
- `HARNESS_CACHE_CLEAR` IPC + 파일 직접 삭제로 강제 재정규화 가능(진단성).

## 대안과 기각 이유

1. **electron-store 단일 JSON 에 저장** — 기각: 번들 수가 늘면 store 단일 파일이 비대화하고, 매 쓰기마다 전체 직렬화. 개별 무효화·용량 관리·진단(파일 삭제) 모두 파일 분리가 유리.
2. **메모리 캐시만(세션 한정)** — 기각: PRD "재오픈 0초"는 앱 재시작 후에도 의미. 영속 필요.
3. **mtime 무시, 경로만 키** — 기각: 저자가 번들을 *수정하며 점검*하는 핵심 페르소나(PRD §4)에서 수정 후에도 옛 모델이 뜨면 치명적. 내용/mtime 해시로 변경 즉시 무효화해야 함.
4. **AI 응답을 정적 결과와 합치지 않고 통째 캐시** — 기각: ADR-001의 "정적 스켈레톤 + AI 보강 머지"가 우선. 캐시는 *머지된 최종 HarnessModel* 을 저장하므로 정적/AI 일관.

## 결과 (Consequences)

- 긍정: 재오픈 0초(PRD 충족). 번들별 독립 무효화. 파일 삭제로 손쉬운 강제 재정규화.
- 긍정: 번들 수정 즉시 캐시 무효(mtime/내용 해시) → 저자 점검 신뢰.
- 부정/트레이드오프: 파일 다수 생성·`<userData>` 관리 필요. `index.json` 동시쓰기 주의(직렬화/락 단순화: main 단일스레드라 순차). 캐시 디렉터리 용량 상한/LRU 정리 정책은 잔여 결정(초기엔 무제한 + 수동 clear).
- 모니터링: 캐시 hit/miss 비율 + bundleHash 무효화 빈도 로깅. miss 가 비정상적으로 잦으면 해시 불안정(mtime 변동) 의심.
