# 2026-11-03 — TC 명세 등급 status 제거

- Date: 2026-11-03
- GitHub Issue: None
- Jira: ARTEL-1322 (상위 ARTEL-1320)
- Status: Implemented

## Goal
TC 명세 등급을 DB·서버·생성·API·화면에서 제거.

## Non-goals
QA verificationStatus, content map status 및 원본 scenario quality 변경.

## Context / Constraints
기존 미커밋 변경을 보존하고 최신 develop의 별도 worktree에서 이번 변경만 적용했다.

## Approach (Checklist)
- [x] **Step 0: Recon**: 전체 TC 입출력과 export 참조 확인.
- [x] **Step 1: Implementation**: TC 타입·응답 parser와 프로젝트 agent specStatus 제거. 목록·상세·편집·시나리오 가져오기의 등급 열·chip 및 관련 번역·CSS 제거. 기본 표 6열, 비교 표 7열과 skeleton·virtual spacer 일치.
- [x] **Step 2: Tests**: npm run build 통과. npm test 1590개 통과. status 없는 API fixture를 사용한 Playwright 확인: 1280px/360px, light/dark 목록과 편집 상세; 등급 표시 없음, 화면 바깥 가로 overflow 없음, pageerror 없음. 캡처는 .plan/assets/2026-11-03-remove-tc-spec-status/에 저장.
- [x] **Step 3: Rollout / Rollback**: 서버·DB 계약 변경 후 소비자를 적용한다. 운영 배포는 수행하지 않는다.

## Validation
npm run build 통과. npm test 1590개 통과. status 없는 API fixture를 사용한 Playwright 확인: 1280px/360px, light/dark 목록과 편집 상세; 등급 표시 없음, 화면 바깥 가로 overflow 없음, pageerror 없음. 캡처는 .plan/assets/2026-11-03-remove-tc-spec-status/에 저장.

## Risks & Rollback
화면 검증은 mock API 기반이며 서버 계약은 별도 서버 integration test로 검증했다. 서버 변경 후 적용하며 rollback은 이 commit revert.

## Open Questions
없음. 알려진 검증 제한은 위에 기록했다.
