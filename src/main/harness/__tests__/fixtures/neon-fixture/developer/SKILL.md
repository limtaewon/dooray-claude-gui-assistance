---
name: neon-fixture-developer
description: >
  Use when: developer 페이즈 진입 시, BE/FE 코드 변경을 실행해야 할 때.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task, mcp__mysql__query, mcp__mysql__find_tables
---

# neon-fixture — Developer (구현자)

## 역할 카드
- **역할**: BE/FE 구현 + 교차검증
- **위험**: @Transactional 사용, BO 생략

## Layer 2 진입 확인 질문

BOImpl 메서드명과 적용될 AOP 트랜잭션 속성은?
