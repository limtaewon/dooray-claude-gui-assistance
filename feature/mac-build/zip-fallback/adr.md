---
id: ADR-mac-build-zip-fallback-01
title: Mac 빌드 target — DMG 제거, ZIP 으로 전환 (서명키 부재 회피)
status: accepted
date: 2026-05-22
supersedes: []
domain: build-release
---

# Mac 빌드 target — DMG 제거, ZIP 으로 전환

## 컨텍스트

`release.yml` 의 Mac 잡이 "서명키 부재로 무조건 실패". GitHub Actions runner 의 keychain 에 유효 Apple Developer 인증서가 없는 상태에서 `mac.target: ["dmg"]` + `mac.identity: "-"` 조합이 codesign 자동 탐색을 발동시키지만 실패. macOS 14+ 의 Gatekeeper 정책 강화 영향.

선택지 4개:

1. **`mac.target: ["zip"]` 단독** — 서명 단계 자체 우회
2. **`mac.target: ["dmg", "zip"]`** — 둘 다, 한쪽 실패 시 다른쪽으로
3. **`mac.identity: null` + dmg 유지** — 명시적 무서명
4. **Apple Developer Program 가입 + 정식 서명** — 본격 해결

## 결정

**옵션 1**: `mac.target` 을 `["zip"]` 으로. dmg 폐기.

`identity` 는 명시적으로 `null` 또는 키 제거. `mac.hardenedRuntime: false` 명시.

## 대안과 기각 이유

1. **옵션 2 (`["dmg", "zip"]`)** — *기각*: electron-builder 가 한 target 빌드 실패 시 전체 워크플로우 실패. 두 target 병렬이 아닌 *순차* 빌드라 dmg 실패가 zip 도 못 만들게 함.
2. **옵션 3 (identity null + dmg 유지)** — *기각*: 무서명 dmg 도 Gatekeeper 가 차단. 사용자가 dmg 마운트 → .app 끌어다 놓아도 *첫 실행* 시 "확인되지 않은 개발자" 동일하게 뜸. dmg 의 UX 이점은 *서명 있을 때* 발휘됨. 무서명 dmg 는 zip 대비 장점 0 + 빌드 단계 더 무거움.
3. **옵션 4 (정식 서명)** — *연기, 별도 사이클*: $99/yr + 가입 심사 1-3일 + 매년 갱신. 본 PRD 의 *즉시* 해결 목적과 시간 스케일 다름. 시드 ADR 작성 후 결정.

## 결과 (Consequences)

### 긍정
- Mac 빌드 workflow 항상 성공
- 사용자가 zip 받고 풀기만 하면 됨
- 서명 도입 시 본 ADR supersede 로 깔끔하게 되돌리기 가능

### 부정 / 트레이드오프
- DMG 의 드래그 → Applications UX 소실. 사용자가 압축 풀고 .app 을 직접 이동.
- 첫 실행 시 "확인되지 않은 개발자" 경고 — 우 클릭 → 열기 절차 1회. README 안내.
- Apple Silicon (arm64) 에서 `com.apple.quarantine` 속성 때문에 우 클릭으로도 안 열릴 수 있음 — `xattr -dr` 안내 추가.

### 모니터링
- GitHub Release 의 Mac zip 다운로드 수
- 사용자 슬랙/메신저 "Mac 실행 안 됨" 문의 빈도
- 정식 서명 도입 ROI 판단 — 위 두 지표 + 미래 사용자 수 베이스로

## 후속 사이클

`feature/mac-build/code-signing/` 디렉토리에 ADR 시드:
- Apple Developer Program 가입 → 인증서 발급 → release.yml secret 등록 (`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)
- Notarization 추가 (electron-builder 자동 처리)
- `mac.target` 을 `["dmg"]` 또는 `["dmg", "zip"]` 으로 복귀
- 본 ADR supersede

## 참조

- prd.md (같은 디렉토리)
- 현재 `package.json` `build.mac` 설정
- 현재 `.github/workflows/release.yml` 의 Mac 잡
