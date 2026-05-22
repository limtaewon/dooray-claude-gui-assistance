# Mac 빌드 ZIP 전환 — Plan

## 목적
- macOS 사용자에게 dmg 외 zip 대안 제공 (서명 없는 환경에서 Gatekeeper 우회 용이)
- 기존 dmg 빌드는 유지하되, zip 추가 생성

## 변경 범위
1. `package.json` — `build.mac.target` 에 `zip` 추가
2. `.github/workflows/release.yml` — `files` 패턴에 `*.zip` 포함 (이미 포함되어 있으나 명시적 확인)
3. `README.md` — Mac 첫 실행 가이드에 "zip 버전도 제공" 안내 추가

## 작업 순서
1. `package.json` 수정: `build.mac.target` 을 `["dmg", "zip"]` 으로 변경
2. `.github/workflows/release.yml` 확인: `files` 패턴에 `release/*.zip` 이미 포함됨 (확인만)
3. `README.md` 수정:
   - 다운로드 테이블에 zip 옵션 추가
   - "macOS 실행 차단 해제" 섹션에 "zip 버전은 압축 해제 후 실행" 안내 추가
4. `workflow_dispatch` 로 release.yml dry-run 테스트 (수동 트리거)
5. PR 생성

## 검증
- `workflow_dispatch` 로 release.yml 실행 → `release/` 에 `.dmg` 와 `.zip` 모두 생성되는지 확인
- GitHub Release 업로드 시 두 파일 모두 포함되는지 확인

## 영향도
- 코드 변경 없음 (빌드 설정만)
- 기존 dmg 빌드는 그대로 유지 (하위 호환)
- Windows 빌드 영향 없음
