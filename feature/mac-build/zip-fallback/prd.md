---
task: mac-build-zip-fallback
domain: build-release
created: 2026-05-22
status: accepted
target_version: 1.6.0 (작업 A 와 합산) 또는 1.5.6 (단독 릴리즈 시)
---

# PRD — Mac DMG 폐기 → ZIP 으로 전환 (서명키 부재 우회)

## 배경 / 문제

- 현재 `release.yml` 의 macOS 잡이 **"서명키 부재로 무조건 실패"** (사용자 보고).
- 원인 추정 (`package.json` 의 `mac` 빌드 설정 + electron-builder 동작 기반):
  - `mac.target: ["dmg"]` + `mac.identity: "-"` → ad-hoc 서명 시도
  - GitHub Actions runner 의 keychain 에 유효 인증서 없음 + macOS 14+ 의 Gatekeeper 가 빈 identity 거부 → codesign 실패 → workflow 종료
- 결과: Apple Developer Program 미가입 상태에서 *Mac 사용자가 빌드된 앱을 다운로드할 수 없음*.

## 목표 (Goals)

1. Mac 빌드 step 이 **서명 없이도** 성공 (workflow 통과)
2. GitHub Release 에 Mac 사용자가 받을 수 있는 산출물 (zip) 첨부
3. 사용자가 첫 실행 시 Gatekeeper 우회 방법을 명확히 안내 (README)

## 비목표 (Non-goals)

- Apple Developer Program 가입 ($99/yr) — 별도 사이클로 분리. ADR 만 시드.
- 정식 Code Signing + Notarization — 위와 동일.
- Windows 빌드 (이미 정상 동작 중) — 손대지 않음.

## 수락 기준 (Acceptance Criteria)

- [ ] AC1: `npm run dist` (Mac 로컬 또는 GitHub Actions) 가 *성공* — exit code 0
- [ ] AC2: `release/*.zip` 산출물 존재 (예: `Clauday-1.6.0-mac.zip` 또는 electron-builder 디폴트 패턴)
- [ ] AC3: 태그 push (`vX.Y.Z`) 시 GitHub Release 에 zip 자동 첨부
- [ ] AC4: `README.md` 에 "Mac 첫 실행 가이드" 섹션 — 한국어 4-6줄
- [ ] AC5: zip 내부 .app 이 Apple Silicon (arm64) 및 Intel (x64) macOS 13/14/15 에서 우 클릭 → 열기 → 정상 부팅 검증 (수동 smoke)
- [ ] AC6: `CHANGELOG.md` 에 빌드 변경 한 줄
- [ ] AC7: `.agent/wiki/architecture.md` §3 빌드 파이프라인 — Mac target 표기 갱신

## 영향 도메인

- **빌드/릴리즈** — `package.json` 의 build 섹션 + `.github/workflows/release.yml`
- src/** 변경 없음 — 코드 미수정

## 리스크 / 제약

- **Apple Silicon Gatekeeper**: macOS 14/15 의 Gatekeeper 가 ad-hoc 서명도 차단할 수 있음. `xattr -dr com.apple.quarantine` 명령으로 해결 가능 — README 명시.
- **DMG 의 드래그 UX 소실**: 사용자가 zip 받고 압축 풀어야 함. 한 단계 추가.
- **사용자 첫 실행 마찰**: "확인되지 않은 개발자" 경고 + 우 클릭 절차 — UX 저하. 정식 서명 도입 시 해결.
- **electron-builder 의 zip target — universal binary 지원**: zip 으로 Apple Silicon + Intel 둘 다 묶을 수 있는지 검증 필요. 아닌 경우 두 zip (arm64 + x64) 분리.

## 참조

- 현재 `package.json` build.mac:
  ```json
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.icns",
    "category": "public.app-category.developer-tools",
    "identity": "-"
  }
  ```
- 현재 `.github/workflows/release.yml` Mac 잡 step:
  ```yaml
  CSC_IDENTITY_AUTO_DISCOVERY: ${{ secrets.MAC_CSC_LINK != '' && 'true' || 'false' }}
  CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  ```
- electron-builder docs: https://www.electron.build/configuration/mac
- macOS Gatekeeper 우회: https://support.apple.com/guide/mac-help/mh40616/mac

## 후속 사이클 시드

- ADR: Apple Developer Program 가입 ROI 평가 — 별도 PRD/ADR. 이 ADR 의 결정이 supersede 가능.
- 정식 서명 도입 시 release.yml 의 secret 가이드 (`MAC_CSC_LINK` 등) 를 다시 활성화.
