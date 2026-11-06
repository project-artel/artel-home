# 2026-07-30 — Artel 브랜드 심볼과 포인트 컬러 적용

- Date: 2026-07-30
- GitHub Issue: None
- Jira Issue: ARTEL-211
- Status: Complete

## Goal

선정된 Artel 심볼과 coral 포인트 컬러를 Home 디자인 토큰, 셸, 로그인, favicon에 일관되게 적용한다.

## Non-goals

- 상태 색상 의미 변경
- 컴포넌트 재설계
- 새 UI 또는 이미지 의존성 추가

## Context / Constraints

- 하나의 재현 가능한 SVG를 모든 브랜드 표면에서 재사용한다.
- `#F04B3A`는 브랜드와 주요 CTA에만 사용하고 액션·선택·상태 토큰은 기존 의미와 값을 유지한다.
- 기존 CSS 토큰 구조와 접근성 기준을 보존한다.

## Approach (Checklist)

- [x] **Step 0: Recon** 기존 토큰, 셸, 로그인, favicon 참조 확인
- [x] **Step 1: Implementation** 브랜드 토큰, SVG, 셸/로그인/favicon 적용
- [x] **Step 2: Tests** lint, typecheck, build, SVG 정적 검사
- [x] **Step 3: Rollout / Rollback** 정적 자산 배포; 문제 시 변경 커밋 revert

## Validation

- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`, SVG 경로/색상 정적 검사
- **Expected output:** 모든 명령 성공, 빌드 산출물에 favicon 포함

## Risks & Rollback

- **Risks:** coral CTA와 cyan 액션이 함께 쓰이므로 브랜드 강조와 작업 상태의 의미 구분을 유지해야 한다.
- **Rollback steps:** ARTEL-211 Home 변경 커밋을 revert한다.

## Open Questions

- 없음
