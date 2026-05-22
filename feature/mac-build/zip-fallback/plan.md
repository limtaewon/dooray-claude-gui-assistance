---
task: mac-build-zip-fallback
date: 2026-05-22
---

# Plan — Mac 빌드 ZIP 전환

> 브랜치: `chore/mac-build-zip-only`
> 작업 A (feedback-to-agent) 와 같은 `release.yml` 을 만지므로 **B 먼저 머지 권장**.

## Phase 1 — 빌드 설정 (`main-process-engineer`)

### 1-1. package.json 의 build.mac

- [ ] 변경 전 백업: `build.mac` 블록 통째 복사해서 impl-log 의 결정 섹션에 기록
- [ ] 변경:
  ```jsonc
  "mac": {
    "target": ["zip"],
    "icon": "build/icon.icns",
    "category": "public.app-category.developer-tools",
    "hardenedRuntime": false
    // identity 키 삭제 (또는 null)
  }
  ```

### 1-2. release.yml 의 Mac 잡

- [ ] "Upload to GitHub Release" step 의 `files:` 패턴:
  ```yaml
  files: |
    release/*.zip
  ```
  (기존 `release/*.dmg` 제거)
- [ ] (선택) 환경변수 단순화 — CSC_* secret 모두 미설정 환경에선 의미 없으니 step 의 env 블록 정리 가능. 그러나 후속 사이클에 정식 서명 도입 시 다시 추가해야 하므로 *주석으로 남기기* 권장:
  ```yaml
  env:
    # Apple Developer 가입 후 활성화: CSC_* secrets 채우면 자동 서명 + Notarization
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
    # CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
    # CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
    # APPLE_ID: ${{ secrets.APPLE_ID }}
    # APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    # APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  ```

### 1-3. README.md — "Mac 첫 실행 가이드"

- [ ] README.md 의 "다운로드" 또는 "설치" 섹션 근처에 추가:
  ```md
  ### Mac 사용자 첫 실행

  Apple Developer 인증서 미보유 상태로 빌드되어 *확인되지 않은 개발자* 로 표시됩니다.

  1. `Clauday-mac.zip` 다운로드 후 압축 해제
  2. `Clauday.app` 을 `Applications` 폴더로 드래그 (또는 원하는 곳)
  3. **첫 실행**: `Clauday.app` 을 우 클릭 → "열기" → 경고 다이얼로그에서 "열기" 한 번 더
  4. 만약 우 클릭 → 열기도 차단되면 터미널에서:
     ```bash
     xattr -dr com.apple.quarantine /Applications/Clauday.app
     ```
     그 다음 일반적으로 실행.

  > 보안: Clauday 는 ad-hoc 서명 (개발자 식별 없음) 으로 배포됩니다. 정식 서명은 후속 사이클에서 도입 예정.
  ```

### 1-4. CHANGELOG.md

- [ ] 작업 A 와 함께 1.6.0 으로 묶는 경우:
  ```md
  ### 변경
  - Mac 빌드 산출물: DMG → ZIP. 서명키 부재 환경에서도 빌드 통과. (Mac 첫 실행 가이드는 README 참조)
  ```
- 단독 릴리즈 (1.5.6) 의 경우 별도 항목.

### 1-5. 매뉴얼 / Wiki 갱신

- [ ] `.agent/wiki/architecture.md` §3 빌드 파이프라인의 표:
  - `npm run dist` 행의 "효과" 갱신 — "macOS zip (ad-hoc 서명)"
- [ ] `.agent/wiki/decisions-log.md` 1줄:
  ```
  - 2026-05-22 — [Mac 빌드 ZIP 전환](feature/mac-build/zip-fallback/adr.md) — DMG 폐기. 정식 서명 도입 시 supersede. build-release.
  ```

### 1-6. impl-log

- [ ] `feature/mac-build/zip-fallback/impl-log.md` — 변경 파일 + 결정/제약/참조

## Phase 2 — 검증 (`test-engineer` + 수동)

### 2-1. 로컬 검증 (Mac 있을 때만)

- [ ] `npm run dist` 실행 → `release/*.zip` 생성 확인
- [ ] zip 풀고 `.app` 실행:
  - 우 클릭 → 열기 → 경고 → 열기 → 부팅 OK
  - 또는 `xattr -dr com.apple.quarantine` 후 일반 실행 OK
- [ ] 두레이 로그인 / 캘린더 / 터미널 / Claude 채팅 — 모든 핵심 기능 부팅 직후 동작 확인

### 2-2. GitHub Actions dry-run

- [ ] `workflow_dispatch` 로 release.yml 수동 실행 (태그 없이) → artifact 만 받아서 검증
- [ ] Mac 잡 통과 + artifact 에 zip 존재

### 2-3. qa-report.md

- [ ] verdict: PASS / RETURN / BLOCK
- [ ] 수동 시나리오 step-by-step 기재
- [ ] 회귀 점검: Windows 빌드 영향 없음 확인 (변경 파일이 mac 영역만)

## Phase 3 — Integrator

- [ ] `npx tsc --noEmit` (영향 없음 — 코드 미변경)
- [ ] `npm test` (영향 없음)
- [ ] `npm run build` (electron-vite 빌드 — 패키징 X. 영향 없음)
- [ ] 단독 PR 인 경우: `package.json` version `1.5.5` → **`1.5.6`** (patch — 빌드 변경만)
- [ ] 작업 A 와 묶이는 경우: 별도 version bump 안 함 (1.6.0 합산)
- [ ] PR 생성:
  - title: `chore(build): Mac DMG → ZIP 전환 (서명키 부재 우회)`
  - base: main, head: chore/mac-build-zip-only
- [ ] 채널 회신

## 의존성 / 순서

- **작업 A 와 같은 release.yml 을 만짐**. 충돌 회피:
  - B 먼저 머지 → A 가 main 에서 rebase
  - 또는 A 가 B 의 변경분 (env 추가) 만 cherry-pick 후 B 머지 기다리지 않고 진행
- 권장: **B 먼저** (작은 변경, 검증 빠름)

## 결정 사항

- target: `["zip"]` 단독
- identity: 제거 (또는 null)
- hardenedRuntime: false
- Notarization: 도입 안 함 (이번 사이클)

## 제약

- src/** 변경 금지 (이번 PR 한정 — 빌드 설정만)
- Windows 빌드 영향 0 (mac 블록만 수정)
- Apple Developer 가입은 별도 사이클 — 본 PR 에서 절대 진행 안 함

## 참조

- `feature/mac-build/zip-fallback/prd.md`
- `feature/mac-build/zip-fallback/adr.md`
- `.agent/wiki/architecture.md` §3
- 현재 `package.json`, `.github/workflows/release.yml`
