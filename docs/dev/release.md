# 릴리즈 워크플로우 & GitHub Actions 파이프라인

Clauday의 릴리즈는 **태그 기반**입니다. `git tag v1.2.3`을 푸시하면 GitHub Actions가 자동으로 macOS dmg와 Windows exe를 빌드해 GitHub Release에 업로드합니다.

## 전체 흐름

```
develop/feature branch
  ↓ git commit, pull request
main 브랜치 (merge 후에는 배포 안 됨)
  ↓ git tag vX.Y.Z
  ↓ git push origin vX.Y.Z
GitHub Actions 트리거
  ↓ build-macos job (dmg 생성)
  ↓ build-windows job (exe 생성)
GitHub Release (자동 생성)
  ↓ dmg, exe, 릴리즈 노트 업로드
배포 완료
```

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
├─ build-macos
│  ├─ Setup Node
│  ├─ Install dependencies
│  ├─ Build app
│  └─ Upload dmg artifact
└─ build-windows
   ├─ Setup Node
   ├─ Install dependencies
   ├─ Build app
   └─ Upload exe artifact
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
  build-macos:
    runs-on: macos-latest
    steps:
      # 1) 소스 코드 checkout
      - uses: actions/checkout@v4
      
      # 2) Node 설정
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      # 3) Python 설정 (node-pty, keytar 빌드용)
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      # 4) 의존성 설치 (postinstall에서 electron-rebuild 자동)
      - run: npm install
      
      # 5) 빌드 (TypeScript + 번들링)
      - run: npm run build
      
      # 6) electron-builder로 dmg 패키징
      - run: npm run dist
      
      # 7) GitHub Release에 업로드
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            release/*.dmg
            release/*.zip
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  build-windows:
    runs-on: windows-latest
    steps:
      # macOS와 유사하되, exe 생성
      - run: npm run dist:win
      
      - uses: softprops/action-gh-release@v1
        with:
          files: release/*.exe
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
electron-builder로 dmg 생성
```
out/
  ↓ electron-builder --mac
release/Clauday-1.5.0.dmg
release/Clauday-1.5.0.zip  (dmg 외에 zip도 생성)
```

**dmg 서명** (optional):
- Apple Developer 인증서가 있으면 자동 서명 (secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`)
- 없으면 unsigned dmg (개발용)

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
https://github.com/NHNent/dooray-claude-gui-assistance/releases

- dmg, exe, zip 다운로드 가능한지 확인
- 릴리즈 노트가 정확한지 확인

### 2. 앱 자동 업데이트 (향후 구현)
현재는 수동 다운로드이지만, electron-updater를 도입하면:
```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.checkForUpdatesAndNotify()
```

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
2. "build-macos" 또는 "build-windows" job 선택
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
