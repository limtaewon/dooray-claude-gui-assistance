# neon-fixture — 핵심 개념

## 1. 시스템 목적

neon 테스트용 축소 번들.

## 2. 4계층 제약

| 계층 | 메커니즘 | 역할 |
|------|----------|------|
| 도구 권한 | tools: 필드 | 도구 자체 차단 |
| hook (차단) | PreToolUse/PostToolUse (exit 2) | 잘못된 도구 호출 차단 |
| 게이트 스크립트 | gate-check.sh (exit 2) | 페이즈 전환 차단 |
