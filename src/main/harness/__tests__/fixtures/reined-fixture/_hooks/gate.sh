#!/usr/bin/env bash
# gate.sh — 테스트 픽스처 축소본
# 규칙: R500~R560 (페이즈 게이트)

PHASE="${1:-}"
FAILS=()

gate_fail() {
  FAILS+=("[$1] $2")
}

case "$PHASE" in
  dev)
    [ -f "impl-log.md" ] || gate_fail R501 "impl-log.md 없음"
    ;;
  qa)
    [ -f "qa-report.md" ] || gate_fail R520 "qa-report.md 없음"
    grep -qE '\[?P0\]?' "security-report.md" 2>/dev/null && gate_fail R551 "P0 취약점 존재"
    ;;
  release)
    [ -f "release-notes.md" ] || gate_fail R560 "release-notes.md 없음"
    ;;
esac

if [ ${#FAILS[@]} -gt 0 ]; then
  printf '%s\n' "${FAILS[@]}" >&2
  exit 1
fi
exit 0
