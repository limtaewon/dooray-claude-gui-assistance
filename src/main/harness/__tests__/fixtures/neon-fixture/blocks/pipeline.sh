#!/usr/bin/env bash
# pipeline.sh — neon-fixture 상태 머신 (축소본)
# transition: pass|violation|deviation|redo→escalate

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SF="${ROOT}/.neon-fixture/state/pipeline-state.json"

case "${1:-}" in
  advance)
    echo "advancing pipeline..." ;;
  transition)
    case "${2:-}" in
      violation) echo "dev" ;;
      deviation) echo "architect" ;;
      pass) echo "next" ;;
    esac ;;
esac
