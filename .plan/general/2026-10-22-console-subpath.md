# 2026-10-22 — 콘솔 subpath 배포 추가

- Date: 2026-10-22
- GitHub Issue: None
- Jira: ARTEL-1203 (상위 ARTEL-1202)
- Status: Draft

## Goal
같은 백엔드를 사용하는 콘솔을 artel.kr/console에서 제공한다.

## Non-goals
백엔드 이전, 기존 루트 배포 제거, 다른 미커밋 변경 배포는 하지 않는다.

## Context / Constraints
현재 운영 Vercel commit fb2ad9c 기준 별도 worktree. onboarding은 20b62dc 기준.
기존 공개 origin home.stage.artel.kr를 사용한다. 보호된 vercel.app 주소로 rewrite하지 않는다.

## Approach (Checklist)
- [x] **Step 0: Recon** — 두 Vercel 프로젝트, 현재 production SHA 및 공개 origin 확인.
- [ ] **Step 1: Implementation** — Vercel 전용 build에서 루트와 dist/console 두 Vite 출력 생성. BASE_URL로 router basename, SDK/MCP 경로, 수동 asset 경로 구성. basename의 trailing slash 제거. subpath OAuth에 return_to 전달하고 auth_error 처리. 콘솔 Vercel fallback을 /console/index.html과 /index.html로 분리.
- [ ] **Step 2: Tests** — root/subpath 테스트, build/lint, static asset MIME 및 하위 경로 새로고침, 로그인 링크, SDK/MCP 화면을 preview에서 확인.
- [ ] **Step 3: Rollout / Rollback** — 콘솔 검증 배포 후 onboarding /console 및 /console/:path* rewrite를 같은 prefix로 origin에 전달. 기존 콘솔 링크를 /console로 변경. 검증 후 production 배포. 문제 발생 시 이전 deployment로 복구.

## Validation
- **Commands to run:** npm test; npm run lint; npm run build:vercel; npm run build
- **Expected output:** 두 빌드 통과, /console와 /console/projects에서 console HTML 및 JS/CSS/SVG 제공, 기존 루트 동작 유지.
- 실제 OAuth 완료는 사용자 세션 접근 여부에 따라 검증 범위를 명시한다. 오류 복귀와 return_to는 별도 확인한다.

## Risks & Rollback
- **Risks:** 기존 배포 backend가 return_to를 지원하는지 확인 필요. Vercel 정적 파일 우선순위와 protection은 preview 및 public origin에서 검증한다.
- **Rollback steps:** onboarding 이전 production deployment를 먼저 복구하고 콘솔 이전 deployment를 복구한다.

## Open Questions
- 없음. 사용자가 현재 콘솔과 같은 백엔드 사용을 확인했다.

## Review
- FAST: trailing slash를 제거한 router basename 사용을 반영했다.
- MEDIUM: 두 출력으로 root/subpath asset 경로를 명확히 분리한다. 동적 basename과 asset alias 방식은 사용하지 않는다.

## OAuth 운영 호환 처리
- 실제 backend의 OAuth 취소 응답은 return_to를 무시하고 home.stage.artel.kr/login으로 돌아온다.
- backend 미커밋 작업은 배포하지 않는다. home.stage.artel.kr의 기존 화면 경로만 artel.kr/console로 임시 redirect한다. /console upstream과 정적 파일은 제외한다.
- SDK/MCP도 진입부터 artel.kr로 이동하므로 parked request가 같은 origin에 남는다. root/local/Docker 빌드는 유지한다.

