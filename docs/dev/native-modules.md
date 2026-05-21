# 네이티브 모듈: node-pty, keytar & 빌드 최적화

Clauday는 두 가지 네이티브 모듈(OS 수준의 C/C++ 바인딩)을 사용합니다. 이들은 npm install 시점에 소스에서 컴파일되므로, 환경 설정이 중요합니다.

## 네이티브 모듈 개요

### node-pty

**용도**: Unix/Windows 의사 터미널(PTY) 생성 및 제어

- **사용처**: `src/main/terminal/TerminalManager.ts`
- **기능**: 셸 프로세스 생성, 입력/출력, 리사이징
- **플랫폼별**:
  - macOS: libutil 링크
  - Windows: Win32 API 호출
  - Linux: pty.h 헤더 필요

**네이티브 빌드 필요 이유**:
- OS별 시스템 콜 추상화
- 성능 최적화 (JavaScript 오버헤드 없음)

### keytar

**용도**: OS 키체인 접근 (암호 저장)

- **사용처**: `src/main/caldav/CredentialStore.ts`와 토큰 저장소
- **기능**: 안전한 자격증명 저장 (암호화)
- **플랫폼별**:
  - macOS: Keychain API
  - Windows: Credential Manager
  - Linux: libsecret (또는 파일 기반 대체)

**네이티브 빌드 필요 이유**:
- OS 키체인과 직접 통신
- 운영 체제 보안 표준 준수

## 설치 시 컴파일 프로세스

### npm install 시 발생하는 일

```bash
$ npm install
...
> postinstall: electron-rebuild -f -w node-pty,keytar
```

**package.json의 postinstall 스크립트** (자동 실행):
```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w node-pty,keytar"
  }
}
```

**electron-rebuild가 하는 일**:
1. 설치된 Electron 버전 감지
2. 해당 버전의 Node headers 다운로드
3. node-pty, keytar 모듈의 `binding.gyp` 읽기
4. Python 및 C++ 컴파일러 사용해서 빌드
5. `.node` 파일 생성 (바이너리)

### 필수 요구사항

#### macOS
```bash
# Xcode 설치됨? (Clang 컴파일러 필요)
xcode-select --install

# Python 3.11+ 필요 (node-gyp 호환성)
python3 --version

# Homebrew 기본 경로 (M1/M2 칩)
/opt/homebrew/bin  # 이미 PATH에 있어야 함
```

#### Windows
```bash
# Visual Studio 빌드 도구 필요
# - "C++ desktop development with Visual Studio"
# 또는 Visual Studio Community 설치

# Python 3.11+ (node-gyp 호환)
python --version

# git bash 또는 cmd에서 npm install 실행
# (PowerShell에서 권한 문제 발생할 수 있음)
```

#### Linux
```bash
# 빌드 도구 설치
sudo apt-get install build-essential python3

# libsecret 개발 헤더 (keytar용)
sudo apt-get install libsecret-1-dev
```

## 빌드 실패 해결

### 문제 1: "Cannot find Python"

```
gyp ERR! not ok
gyp ERR! "C:\Python\python.exe" --version
```

**해결책**:
```bash
# Python 3.11+ 설치 후
npm config set python C:\Python311\python.exe

# 또는 환경변수 설정
set PYTHON=C:\Python311\python.exe
npm install
```

### 문제 2: "node-pty 바이너리 없음 (Windows)"

```
The specified module could not be found
\node_modules\node-pty\build\Release\pty.node
```

**원인**: VS 빌드 도구 없음 또는 구버전 호환성

**해결책**:
```bash
# 1) VS 빌드 도구 설치 확인
npm install --build-from-source

# 2) 강제 재빌드
npm rebuild node-pty --build-from-source

# 3) node-pty 버전 확인 (package.json)
# 1.0.0 이상 권장
```

### 문제 3: "Keytar 빌드 실패 (권한 문제)"

```
gyp ERR! build error
gyp ERR! stack Error: `cl.exe` failed with exit code 1
```

**해결책** (Windows):
```bash
# cmd.exe를 관리자 모드로 실행한 후
npm install

# 또는 PowerShell에서 권한 높이기
# Start-Process powershell -Verb RunAs
```

## 패키징 (분배)

### electron-builder의 asarUnpack

패키징된 앱에서 네이티브 모듈이 정상 작동하려면, asar 아카이브에서 **풀어서** 저장해야 합니다.

**package.json**:
```json
{
  "build": {
    "asarUnpack": [
      "node_modules/node-pty/**/*",
      "node_modules/keytar/**/*"
    ]
  }
}
```

**왜?**: asar는 ZIP 같은 아카이브인데, OS는 그 안에 있는 `.node` 바이너리를 직접 로드할 수 없습니다. 따라서 분산 시 이 파일들을 풀어낸 상태로 패키징합니다.

### 빌드 프로세스

```bash
# 1) TypeScript 컴파일 + 네이티브 모듈 준비
npm run build

# 2) electron-builder로 패키징 (macOS dmg)
npm run dist

# 3) 결과물
release/Clauday-1.4.1.dmg  # macOS
release/Clauday-1.4.1.exe  # Windows
```

## CI/CD (GitHub Actions)

GitHub Actions에서의 네이티브 모듈 처리:

### .github/workflows/release.yml

```yaml
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      # 중요: Python 3.11+ 필요
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      # postinstall이 자동 실행됨
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run dist
```

## 디버깅 팁

### 1. 빌드 로그 확인

```bash
# 상세 로그
npm install --verbose

# electron-rebuild 상세 로그
electron-rebuild --verbose
```

### 2. 네이티브 모듈 확인

```bash
# 빌드된 바이너리 확인
ls -la node_modules/node-pty/build/Release/  # macOS/Linux
dir node_modules\node-pty\build\Release      # Windows

# .node 파일이 있어야 함
# - node_modules/node-pty/build/Release/pty.node
# - node_modules/keytar/build/Release/keytar.node
```

### 3. Runtime 에러

```typescript
// Main 진입점에서 로드 테스트
try {
  const pty = require('node-pty')
  const keytar = require('keytar')
  console.log('[main] 네이티브 모듈 로드 성공')
} catch (err) {
  console.error('[main] 네이티브 모듈 로드 실패:', err)
  process.exit(1)
}
```

## 버전 관리

### package.json 의존성

```json
{
  "dependencies": {
    "node-pty": "^1.0.0",
    "keytar": "^7.9.0"
  }
}
```

**주의사항**:
- `node-pty` 버전 0.x는 구식. 1.x 이상 권장
- `keytar` 7.9.0+는 최신 Electron 호환
- 업그레이드 후 항상 `npm rebuild` 실행

### 호환성 확인

```bash
# Electron 버전 확인
npm list electron  # ^33.2.0

# node-pty Electron 호환 여부
npm info node-pty versions  # 1.0.0 이상

# keytar Electron 호환 여부
npm info keytar versions  # 7.9.0 이상
```

## 플랫폼별 특수 사항

### macOS

**특징**:
- 기본적으로 XCode Command Line Tools 설치됨
- M1/M2 칩 (ARM64) 지원 확인 필수

**확인**:
```bash
# 칩 아키텍처
uname -m  # arm64 또는 x86_64

# Xcode 버전
xcode-select --version
```

**문제**: M1 맥에서 Intel용 node-pty 로드 불가
```bash
# 강제 ARM64 빌드
npm rebuild --build-from-source
```

### Windows

**특징**:
- VS 빌드 도구 필수 (Visual Studio 대신 가능)
- 권한 문제 자주 발생

**확인**:
```cmd
# 빌드 도구 설치 여부
where cl.exe  # Microsoft Visual C++ 컴파일러

# 없으면 설치
# https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
```

### Linux

**특징**:
- 사용자 디바이스에서는 드물지만, CI에서 빌드 필요
- libsecret이 없으면 keytar 에러

**확인**:
```bash
# libsecret 설치
dpkg -l | grep libsecret

# 없으면 설치
sudo apt-get install libsecret-1-dev
```

## 최적화 & 성능

### 빌드 시간 단축

```bash
# 1) 병렬 컴파일
npm install --verbose -- --parallel=4

# 2) 캐시 재사용
npm ci  # package-lock.json 기반 설치 (느려도 재현성 높음)

# 3) prebuild 캐시 (CI/CD)
# GitHub Actions에 오래된 빌드 결과 캐시
# → 매번 컴파일하지 않음
```

### 앱 배포 크기

**네이티브 모듈이 추가하는 크기**:
- node-pty: ~2-3 MB (플랫폼별)
- keytar: ~1-2 MB (플랫폼별)
- 총 ~5 MB 추가

**asarUnpack 후 크기**:
- Clauday dmg: ~200-250 MB
- Clauday exe: ~180-220 MB

## 체크리스트

새로운 개발 환경에서 처음 설정할 때:

- [ ] Python 3.11+ 설치 및 PATH 확인
- [ ] C++ 컴파일러 설치 (XCode/VS Buildtools)
- [ ] `npm install` 실행 (postinstall 자동)
- [ ] 로그에서 "gyp info ok" 확인
- [ ] `.node` 파일 존재 확인
- [ ] `npm run dev` 실행 및 앱 정상 시작 확인
- [ ] Terminal 기능 테스트 (node-pty)
- [ ] CalDAV 자격증명 저장 테스트 (keytar)

## 참고 문서

- [node-pty 공식 깃헙](https://github.com/microsoft/node-pty)
- [keytar 공식 깃헙](https://github.com/atom/node-keytar)
- [electron-rebuild 문서](https://github.com/electron/electron-rebuild)
- [node-gyp 문서](https://github.com/nodejs/node-gyp)

## 문제 해결

더 자세한 에러는 [troubleshooting.md](./troubleshooting.md)의 "네이티브 모듈" 섹션을 참고하세요.
