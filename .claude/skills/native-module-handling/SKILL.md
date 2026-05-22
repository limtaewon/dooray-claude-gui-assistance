---
name: native-module-handling
description: Clauday 의 native 모듈 (node-pty, keytar) 추가/업데이트/문제 해결 가이드. native 의존성 작업 시 트리거.
---

# native-module-handling

> Native 모듈은 OS 별 prebuild 가 필요해서 깨지면 *전체 패키징* 이 망가진다.

## 현재 사용 중

- **`node-pty`** — 터미널 PTY (Pseudo Terminal). `src/main/terminal/TerminalManager.ts` 에서 사용.
- **`keytar`** — OS keychain (두레이 토큰, CalDAV 비밀번호 보관). `src/main/dooray/`, `src/main/caldav/CredentialStore.ts` 등.

## 핵심 인프라

### 1. postinstall — `electron-rebuild`

`package.json`:
```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w node-pty,keytar"
  }
}
```

`npm install` 직후 자동 실행. `-w` 인자에 native 모듈 명을 *콤마 구분* 으로 나열.

### 2. asar 풀기

`electron-builder` 설정:
```json
{
  "asarUnpack": [
    "node_modules/node-pty/**/*",
    "node_modules/keytar/**/*"
  ]
}
```

asar 안에 들어가면 `.node` 바이너리 로드 실패. 풀어둬야 정상 실행.

### 3. CI / Release workflow

`.github/workflows/release.yml` — macOS 와 Windows 양쪽에서 빌드. 각각 자기 OS 의 prebuild 생성.

## 새 native 모듈 추가 절차

### 1. 평가 (architect 단계)
- 정말 native 가 필요한가? (Pure JS 대안 검토)
- 유지보수 활발한가? (마지막 release 1년 이내, 이슈 응답 OK)
- Electron ABI 와 호환되는가? (Node 의 ABI 와 다름 — `prebuild-install` 지원 여부 확인)
- ADR 작성 — 채택 이유 + 대안 기각 + 트레이드오프

### 2. 설치
```bash
npm install <module>
```

### 3. `package.json` postinstall 갱신
```json
"postinstall": "electron-rebuild -f -w node-pty,keytar,<newmodule>"
```

### 4. `electron-builder` asarUnpack 갱신
```json
"asarUnpack": [
  "node_modules/node-pty/**/*",
  "node_modules/keytar/**/*",
  "node_modules/<newmodule>/**/*"
]
```

### 5. CI 확인
release.yml 의 빌드 매트릭스에서 양 OS 다 통과하는지 dry run 권장.

### 6. 로컬 검증
```bash
rm -rf node_modules
npm install   # postinstall 이 rebuild 자동 실행
npm run dev   # native 모듈 import 한 코드 실제 동작 확인
npm run dist  # 패키지 빌드까지 OK 인지
```

## 문제 해결 매트릭스

| 증상 | 원인 후보 | 처방 |
|---|---|---|
| `Module did not self-register` | ABI 불일치 | `npm rebuild <module>` 또는 `electron-rebuild -f -w <module>` |
| `.node not found` (런타임) | asarUnpack 누락 | electron-builder 설정에 추가 |
| Windows 빌드만 실패 | prebuild 없음 | `prebuild-install` 지원 모듈인지 확인. 아니면 windows-build-tools 필요 |
| macOS arm64 vs x64 | universal binary 필요 | electron-builder 의 `mac.target` 에 둘 다 |
| postinstall 무한 루프 | electron-rebuild 가 npm install 호출 | `--force` 가 빠졌는지 확인 |

## 보안 고려

- native 모듈은 OS 권한과 직접 통신 — credential 다루는 라이브러리 (keytar 류) 는 *반드시* 신뢰 가능한 origin.
- supply chain 검토 — npm audit + repo 활동 + 다운로드 수 + 메인테이너 평판.

## 갱신 정책

새 native 모듈 추가/제거 시:
- 본 스킬의 "현재 사용 중" 갱신
- `.agent/wiki/architecture.md` §4 (네이티브 모듈) 갱신
- ADR 작성 (선택이 아니라 필수 — supply chain 영향)
