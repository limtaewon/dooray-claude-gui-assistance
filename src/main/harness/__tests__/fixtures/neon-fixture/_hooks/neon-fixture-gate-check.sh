#!/usr/bin/env bash
# neon-fixture-gate-check.sh — 테스트 픽스처 축소본 (neon 스타일 게이트)
# 사용: gate-check.sh <analyst|pm|architect|sm|dev|qa|release> [artifact_dir]
#   exit 0 통과 / exit 2 차단

PHASE="${1:-}"
FAILS=()

gate_fail() {
  FAILS+=("[$1] $2")
}

code_domain_checks() {
  grep -qE '@Transactional' "${1:-}" 2>/dev/null && gate_fail NEON-AOP01 "Controller: @Transactional 금지"
  grep -qE 'import .*Mapper;' "${1:-}" 2>/dev/null && gate_fail NEON-LYR01 "Controller→Mapper 직접참조 금지"
}

case "$PHASE" in
  analyst)
    [ -f "brief.md" ] || gate_fail NEON-G01 "brief.md 없음" ;;
  pm)
    [ -f "prd.md" ] || gate_fail NEON-G02 "prd.md 없음" ;;
  dev)
    [ -f "impl-log.md" ] || gate_fail NEON-G05 "impl-log.md 없음"
    code_domain_checks ;;
  qa)
    [ -f "qa-report.md" ] || gate_fail NEON-G06 "qa-report.md 없음"
    [ -f "security-report.md" ] && grep -qE '\[?P0\]?' "security-report.md" && gate_fail NEON-G51 "security-report P0 존재" ;;
  release)
    [ -f "release-notes.md" ] || gate_fail NEON-G60 "release-notes.md 없음" ;;
esac

if [ ${#FAILS[@]} -gt 0 ]; then
  printf '%s\n' "${FAILS[@]}" >&2
  exit 2
fi
exit 0
