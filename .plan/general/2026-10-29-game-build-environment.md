# 2026-10-29 — 게임 버전 실행 환경 표시 추가

- Date: 2026-10-29
- GitHub Issue: ARTEL-1293 (스토리 ARTEL-1291, 서버 ARTEL-1292)
- Status: Implemented

## Goal
게임 버전이 보이는 곳에서 Editor / Standalone을 명시한다. QA 히스토리는 실제 실행 빌드의 환경을 사용한다.

## Non-goals
빌드 선택, 버전 판정, SDK 등록 동작을 변경하지 않는다.

## Context / Constraints
기존 checkout의 작업 파일을 보존한다. 최신 develop을 기준으로 `.work/build-environment-home`과 `.work/build-environment-server`에 이번 변경만 분리한다. QA 기록은 현재 instance 상태로 추정하지 않는다. 필드가 없으면 환경 미확인으로 표시한다. 현재 server의 ARTEL-1180 계약은 버전 목록, TR 빌드, 판정 이력, 생성 후보에 isEditor를 제공한다. 모든 parser가 이 필드를 보존하고 누락 시 Unknown을 표시한다.

## Approach (Checklist)
- [x] **Step 0: Recon** 버전 표시와 QA summary SQL 확인
- [x] **Step 1: Implementation** 공통 표시 함수, 버전 표시 호출부, QA summary의 nullable isEditor 추가
- [x] **Step 2: Tests** true/false/null 파싱과 표시, 기존 회귀 테스트, typecheck, lint, build, 화면 확인
- [ ] **Step 3: Rollout / Rollback** 서버 계약을 먼저 반영하며 구버전 서버 응답은 미확인으로 표시

## Validation
- **Commands to run:** npm test, npm run typecheck, npm run lint, npm run build; QA launch 서버 통합 테스트
- **Expected output:** 표시와 파싱 테스트 통과, 변경 코드 정적 검사 통과

## Risks & Rollback
- **Risks:** 같은 버전의 Editor와 Standalone 혼동, 이전 응답을 false로 잘못 처리하는 경우
- **Rollback steps:** 이 작업에서 추가한 필드와 표시 변경만 되돌린다.

## Open Questions
없음.

## Review
카드 머리는 기준 버전, 각 실행 타일과 선택 상세는 실제 실행 버전 및 환경을 표시한다. BuildSwitcher, 빌드 목록/상세, 대시보드, 성능 선택, 게임 선택, 최근 실행, 버전 트리, TC 상세 및 선택/확인 창을 점검한다. 동일 TR의 Editor/Standalone 실행을 번갈아 선택하는 fixture로 확인한다.

## Results
- home 테스트 1591개, typecheck, build 통과.
- 서버 QaLaunchReadIntegrationTest 13개 통과. 실제 PostgreSQL에서 현재 instance build를 바꿔도 과거 실행의 목록 및 판정 상세 환경을 유지한다.
- 390px/1440px, light/dark의 실제 컴포넌트 fixture에서 세 환경의 실행 선택, 상세 표시, 페이지 overflow 및 브라우저 오류 확인. 운영 E2E는 아니다.
- 전체 lint 오류 4개는 원래 useCaseListNav, RunListPanel, RunNameCrumb, useStepEditor에서도 재현된다. 변경 파일의 오류는 RunListPanel의 기존 set-state-in-effect 1건뿐이다.
- plan-review와 pair-review PASS. 서버 반영 뒤 home 반영이 필요하며 배포는 하지 않았다.

## 버전 옆 환경 표시 보완
모든 게임 버전 바로 뒤에 실행 환경을 표시한다. label이 있어도 `version · Editor/Standalone/Unknown · label` 순서를 사용한다. 비용 차트 tooltip과 프로젝트 챗의 QA 실행 요약에도 같은 표시를 적용한다.
