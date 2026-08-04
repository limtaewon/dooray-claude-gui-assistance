# 릴리즈 워크플로우 & GitHub Actions 파이프라인

Clauday의 릴리즈는 **태그 기반**입니다. `git tag v1.2.3`을 푸시하면 GitHub Actions가 Windows exe를 빌드해 GitHub Release에 업로드합니다.

> ⚠️ **macOS dmg는 CI가 만들지 않습니다.** `build-macos` job은 2026-05-22(`983c09b`)에 제거됐고
> 지금 `release.yml`에 있는 job은 `build-windows` 하나뿐입니다. dmg는 릴리즈마다 mac에서 손으로
> 빌드해 올려야 합니다 — 아래 「macOS dmg 수동 업로드」 참고. 이 단계를 빠뜨리면 mac 사용자는
> 업데이트 알림을 받고도 받을 파일이 없습니다.

## 전체 흐름

```
develop/feature branch
  ↓ git commit, pull request
main 브랜치 (merge 후에는 배포 안 됨)
  ↓ git tag vX.Y.Z
  ↓ git push origin vX.Y.Z
GitHub Actions 트리거
  ↓ build-windows job (exe + latest.yml 생성)
GitHub Release (자동 생성)
  ↓ exe, latest.yml, 릴리즈 노트 업로드
  ↓ [수동] mac에서 npm run dist → dmg 업로드
배포 완료
```

## macOS dmg 수동 업로드

태그를 푸시한 뒤 mac에서:

```bash
npm run dist                                          # release/Clauday-<버전>-arm64.dmg 생성
gh release upload vX.Y.Z release/Clauday-X.Y.Z-arm64.dmg
```

같이 생성되는 `latest-mac.yml`은 **올리지 않습니다.** macOS는 ad-hoc 서명(`identity: "-"`)이라
Squirrel.Mac의 자동 설치가 서명 검증에서 막히고, 그래서 `UpdateService`가 autoUpdater 대신
Releases API로 dmg 에셋을 직접 고릅니다 — 자세한 건 `UpdateService` 클래스 주석.

## 릴리즈 전 체크리스트

릴리즈 태그를 푸시하기 전에 다음을 반드시 확인하세요.

### 1. 코드 준비
- [ ] 모든 기능 완료 및 테스트 완료
- [ ] `npm run typecheck` 통과 (타입 에러 없음)
- [ ] `npm run test:run` 통과 (전체 테스트)
- [ ] main 브랜치로 merge 완료

### 2. 문서 업데이트
- [ ] `CHANGELOG.md`의 `[Unreleased]` 섹션을 새 버전으로 변경
- [ ] 주요 변경 사항 명시 (기능, 버그 수정, 마이그레이션)
- [ ] `docs/dev/` 문서 갱신 (필요시)

**예시**:
```markdown
## [1.5.0] - 2026-05-15

### 새로운 기능
- CalDAV 캘린더 통합 (두레이 네이티브 API 대체)
- 위키 저장소 확장 (복수 위키 지원)

### 버그 수정
- 터미널 IME 셀 폭 오류 (Unicode 11)
- MCP 활성/비활성 실제 동작

### 마이그레이션
- CalDAV 초기 설정 필수 (Settings > Calendar)
```

### 3. 버전 확인
- [ ] `package.json`의 `version` 필드 업데이트
  ```json
  {
    "version": "1.5.0"
  }
  ```
- 버전 형식: `X.Y.Z` (Semantic Versioning)
  - X: 메이저 (대규모 기능, 호환성 손상)
  - Y: 마이너 (새 기능, 하위 호환)
  - Z: 패치 (버그 수정)

### 4. 로컬 빌드 테스트 (선택사항이지만 권장)
```bash
# 최종 타입 체크
npm run typecheck

# 프로덕션 빌드 (macOS)
npm run dist

# 빌드 결과 확인
ls -la release/
# release/Clauday-1.5.0.dmg 있는지 확인
```

## 태그 생성 및 푸시

### Step 1: 태그 생성

```bash
# main 브랜치 확인
git branch
# * main

# 최신 커밋 확인
git log --oneline -5

# 태그 생성 (annotated tag, 권장)
git tag -a v1.5.0 -m "v1.5.0: CalDAV 캘린더 통합"

# 또는 lightweight tag
git tag v1.5.0
```

### Step 2: 태그 푸시

```bash
# 로컬 태그 확인
git tag -l

# 원격에 푸시
git push origin v1.5.0

# 또는 모든 태그 한 번에
git push origin --tags
```

**확인**:
```bash
# GitHub에 태그 생성됨
git ls-remote --tags origin | grep v1.5.0
```

### Step 3: GitHub Actions 확인

GitHub 저장소 → **Actions** 탭에서 릴리즈 워크플로우 실행 상태 확인

```
Release (workflow)
└─ build-windows
   ├─ Setup Python 3.11
   ├─ Setup Node
   ├─ Install dependencies
   ├─ Build Windows exe
   └─ Upload to GitHub Release (exe + latest.yml)
```

## .github/workflows/release.yml

릴리즈 자동화를 위한 GitHub Actions 워크플로우입니다.

**위치**: `.github/workflows/release.yml`

**구조**:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'  # v1.2.3 형식의 태그만 트리거

jobs:
  # 유일한 job — macOS 는 없다(dmg 는 수동 업로드).
  build-windows:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      # 1) 소스 코드 checkout
      - uses: actions/checkout@v4

      # 2) Python 설정 (node-gyp distutils 호환)
      - uses: actions/setup-python@v5
        id: python
        with:
          python-version: '3.11'

      # 3) Node 설정
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # 4) 의존성 설치 (postinstall 에서 electron-rebuild 자동)
      - run: npm ci

      # 5) 빌드 + electron-builder 로 exe 패키징
      - run: npm run dist:win -- --publish never

      # 6) GitHub Release 에 업로드
      #    latest.yml 은 앱 안의 자동 업데이트가 최신 버전을 읽는 메타파일이라 빠지면 안 된다.
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            release/*.exe
            release/latest.yml
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 빌드 & 패키징 과정

### npm run build
TypeScript 컴파일 + Vite 번들링
```
src/main/
  ↓ (tsc)
out/main/
  ↓ (electron-vite)
out/
```

### npm run dist (macOS)
electron-builder로 dmg 생성. **CI 가 아니라 사람이 mac 에서 돌린다.**
```
out/
  ↓ electron-builder --mac
release/Clauday-2.0.5-arm64.dmg
release/latest-mac.yml       (생성은 되지만 릴리즈에 올리지 않는다)
```

`package.json` 의 `build.mac.target` 은 `dmg` 하나다 — zip 은 만들지 않는다.

**dmg 서명**: 지금은 ad-hoc(`identity: "-"`)이다. 정식 Developer ID 서명 + notarization 을 붙이면
macOS 도 Windows 처럼 autoUpdater 경로로 바꿀 수 있다 — 그때까지는 사용자가 dmg 를 열어 직접
옮긴다(`UpdateService` 클래스 주석).

### npm run dist:win (Windows)
electron-builder로 exe 생성
```
out/
  ↓ electron-builder --win
release/Clauday-1.5.0.exe
```

## 버전 범프 (Semantic Versioning)

### 버전 결정 기준

| 상황 | 버전 | 예 |
|------|------|-----|
| 새 기능 추가 (하위 호환) | 마이너 + 1 | 1.4.1 → 1.5.0 |
| 버그 수정만 | 패치 + 1 | 1.5.0 → 1.5.1 |
| 호환성 손상 (major refactor) | 메이저 + 1 | 1.x.x → 2.0.0 |

### 현재 버전 확인

```bash
# package.json에서 읽기
cat package.json | jq '.version'

# 또는 git 최신 태그
git describe --tags --abbrev=0
```

## CHANGELOG 작성 규칙

### 형식

```markdown
## [1.5.0] - 2026-05-15

### 새로운 기능
- 설명 (기술적 상세 + 사용자 관점)

### 버그 수정
- 설명 (무엇이 깨진 것인가 + 어떻게 고쳤는가)

### 마이그레이션 (v1.0부터 호환성 손상 있을 때)
- 설명 (사용자가 어떻게 대응해야 하는가)
```

### 예시

```markdown
## [1.5.0] - 2026-05-15

### 새로운 기능
- **CalDAV 캘린더 통합** — 두레이 네이티브 API 대신 CalDAV(표준 프로토콜) 사용. CalDAV 호환 서버(Google, Outlook, iCloud 등)도 지원
- **위키 저장소 확장** — 여러 위키 등록 후 드롭다운으로 전환 가능

### 버그 수정
- **터미널 한글 IME 셀 폭 오류** — Unicode 11 + 한글 폰트 fallback으로 정확한 셀 계산
- **MCP 활성/비활성 실제 동작** — 이전에는 UI에만 반영되고 Claude Code는 계속 로드했음. 이제 비활성 항목은 ~/.claude.json에서 제거
- **앱 재시작 후 터미널 화면 깨짐** — alt-screen TUI 잔재 자동 정리

### 마이그레이션
- **CalDAV 설정 필수**: Settings > Calendar 탭에서 CalDAV 엔드포인트 및 자격증명 입력
- **기존 두레이 일정 유지**: 자동 마이그레이션 없음. 필요시 수동으로 두레이 캘린더 → CalDAV 동기화
```

## 릴리즈 노트 자동 생성

GitHub Release를 생성하면 자동으로 CHANGELOG.md에서 해당 버전 섹션을 추출해 릴리즈 노트로 표시됩니다.

**동작**:
1. 태그 푸시 → GitHub Actions 트리거
2. Release 생성 (자동)
3. 릴리즈 노트: CHANGELOG.md의 해당 섹션 읽기

## 배포 후 확인

### 1. GitHub Release 페이지
https://github.com/limtaewon/dooray-claude-gui-assistance/releases

- **에셋 3종이 다 있는지 확인**: `Clauday-<버전>-arm64.dmg`(수동) · `Clauday.Setup.<버전>.exe`(CI) · `latest.yml`(CI)
- 특히 dmg 는 CI 가 만들지 않으므로 빠지기 쉽다 — 없으면 mac 사용자는 알림만 받고 못 받는다
- 릴리즈 노트가 정확한지 확인

### 2. 앱 자동 업데이트

구현되어 있다 — `src/main/update/UpdateService.ts`. 플랫폼마다 **의도적으로 다른 경로**를 탄다.

- **Windows**: `electron-updater` 의 autoUpdater 가 `latest.yml` 을 읽어 배경 다운로드 → 재시작하며 설치까지
- **macOS**: autoUpdater 를 쓰지 않는다(ad-hoc 서명이라 Squirrel.Mac 서명 검증에서 막힘). Releases API 를 직접 읽어 dmg 를 내려받고 Finder 로 열어주는 데까지

확인 시점은 **앱 시작 5초 뒤 한 번 + 이후 6시간마다**(`startPeriodicCheck`). 받는 중이거나
이미 알린 상태에서는 재확인을 건너뛴다 — 진행 표시를 덮어쓰지 않기 위해서다.

### 3. 되돌리기 (Rollback)

롤백이 필요한 경우:
```bash
# 최신 태그 삭제
git tag -d v1.5.0
git push origin :refs/tags/v1.5.0

# GitHub Release도 수동 삭제 (웹)
```

## 트러블슈팅

### GitHub Actions 빌드 실패

**로그 확인**:
1. Actions 탭 → 해당 워크플로우 클릭
2. "build-windows" job 선택 (Release 워크플로우의 유일한 job)
3. 실패 단계 로그 확인

**자주 나오는 에러**:
- `python not found` → CI에서 Python 설정 확인
- `node-pty 빌드 실패` → VS Buildtools 설정 (Windows)
- `code sign error` → Apple 인증서 secrets 확인 (macOS)

### 로컬 빌드는 되는데 CI 빌드 실패

```bash
# 로컬과 CI 환경 차이 확인
npm ci  # CI와 동일하게 package-lock 사용

npm run build
npm run dist
```

## 베스트 프랙티스

1. **태그 형식 일관성** — 항상 `vX.Y.Z` (v 접두사)
2. **한 버전당 한 태그** — 같은 버전 재릴리즈 금지
3. **CHANGELOG 먼저 작성** — 커밋 전에 변경 사항 정리
4. **CI/CD 성공 후 배포** — GitHub Actions 완료 대기
5. **릴리즈 노트 검토** — 사용자가 이해하기 쉽게

## 참고

- [Semantic Versioning](https://semver.org/lang/ko/)
- [GitHub Actions 공식 가이드](https://docs.github.com/en/actions)
- [electron-builder 문서](https://www.electron.build/)
