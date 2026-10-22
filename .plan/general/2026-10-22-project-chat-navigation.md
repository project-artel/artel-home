# 2026-10-22 — 프로젝트 챗 화면 분리 및 네비게이션 그룹 추가

- Date: 2026-10-22
- GitHub Issue: None
- Jira: ARTEL-1206
- Status: Implemented

## Goal
대시보드 본문 옆에 Project Agent 패널을 유지하고, 별도 챗 경로에서 전체 화면 대화를 제공한다. 네비게이션은 케이스, QA, 프로젝트 데이터, 관리 그룹으로 구분한다.

## Non-goals
백엔드 API, 대화 저장 방식, 기존 화면 URL을 변경하지 않는다. 그룹 접기 기능은 추가하지 않는다.

## Context / Constraints
기존 index 화면은 챗이 열리면 대시보드를 숨긴다. AgentSessionProvider를 유지해 화면 이동 중 대화를 보존한다. 전체 챗은 저장된 dock 열림 상태를 변경하지 않으며 X를 표시하지 않는다. flag가 꺼진 상태의 챗 주소는 대시보드로 이동한다.

## Approach (Checklist)
- [x] **Step 0: Recon** — 기존 workspace, dock, routes, 반응형 CSS 확인. Fast/medium/heavy 계획 검토 PASS.
- [x] **Step 1: Implementation** — `/projects/:projectId/chat` 추가, 대시보드 오른쪽 dock 유지, section metadata 기반 네비 그룹과 한국어·영어 labels 적용.
- [x] **Step 2: Tests** — 경로 경계, 그룹 구성, 저장된 dock 선택, 모바일 챗, flag off, 대화 유지 검증.
- [ ] **Step 3: Rollout / Rollback** — draft PR 제출. 기존 VITE_PROJECT_AGENT flag 유지. 변경 commit revert로 복원.

## Validation
- **Commands to run:** npm test, npm run build, 변경 파일 eslint.
- **Expected output:** 기존 경로 통과, 챗과 대시보드 구별, 1024/1440px 및 모바일에서 화면 정상 표시. light/dark 확인.
- 브라우저는 fixture API를 사용한 UI 검증과 실제 backend 통합 검증을 구분해 기록한다.

## Risks & Rollback
- **Risks:** 모바일에서 기존 agent 숨김 규칙이 전체 챗도 숨길 수 있어 명시적 예외를 검증한다. 전체 챗 진입이 dock 저장값을 덮어쓰지 않도록 상태를 route에서 계산한다.
- **Rollback steps:** 변경 commit revert. 데이터 변경 없음.

## Open Questions
없음. 전체 챗의 X는 제거하고 네비게이션으로 이동한다.

## Results
- 전체 1,354 tests 통과, flag on/off production build 통과, 변경 TS/TSX eslint 통과. 기존 bundle 크기 경고는 남아 있다.
- Playwright + fixture API로 1440/1024/360px, light/dark, 펼친/접힌 네비 검증. 전체 챗에서 대시보드 본문과 X가 없고, 대시보드에서는 오른쪽 dock을 함께 표시한다.
- 대화 메시지 및 입력 중인 내용 유지, dock 닫기 → 전체 챗 → 대시보드 복귀 시 닫힘 선택 유지 확인.
- flag off 빌드의 /chat 직접 접근은 dashboard로 redirect되며 메뉴도 숨겨진다.
- Fast/medium/heavy 계획 검토 및 pair-review-critic PASS.
- 실제 backend에 새 메시지를 전송하는 통합 검증은 하지 않았다. 스크린샷은 fixture 자료를 표시한다.
