# 관리자 화면에 콘솔 디자인 적용

- Date: 2026-11-06
- GitHub Issue: None
- Status: Verified

## Goal

콘솔의 관리자 화면에 공통 페이지 구조와 내비게이션을 적용하고 ARTEL 웹 디자인 기준을 문서화한다.

## Non-goals

권한, API, URL, 표시 문구 변경.

## Context / Constraints

배포 경로는 `artel-home`의 `/admin`이다. Blueprint Paper 토큰과 기존 콘솔 컴포넌트를 재사용한다.

## Approach (Checklist)

- [x] **Step 0: Recon** — 관리자 경로와 기존 페이지, 이슈 내비게이션 확인
- [x] **Step 1: Implementation** — 공통 내비게이션 추출, 관리자 레이아웃 적용, 디자인 기준 문서화
- [x] **Step 2: Tests** — 빌드, 테스트, 로그인한 화면의 두 테마 및 모바일 확인
- [x] **Step 3: Rollout / Rollback** — 관리자 레이아웃과 공통 내비게이션을 함께 적용

## Validation

- **Commands to run:** `npm run build`, `npm test`, `git diff --check`
- **Expected output:** 관리자와 이슈 화면의 현재 섹션이 같은 방식으로 표시되고 좁은 화면에서 항목이 줄바꿈된다.

## Risks & Rollback

- **Risks:** 공통 내비게이션을 사용하는 이슈 화면도 모바일 확인 대상이다.
- **Rollback steps:** 관리자 레이아웃과 공통 내비게이션 변경을 함께 되돌린다.

## Open Questions

- 격리된 PostgreSQL과 Redis에 연결한 실제 서버에서 로컬 관리자 세션으로 확인했다.
