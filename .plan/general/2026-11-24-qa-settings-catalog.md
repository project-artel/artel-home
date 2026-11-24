# 2026-11-24 — 서버 설정 목록으로 QA 실행 폼 구성

- Date: 2026-11-24
- Jira: ARTEL-1474

## Goal

QA 실행 화면에서 Agent 서버에 공개된 옵션의 값, 범위, 설명, 지원 엔진과 이미지 제약을 읽고 선택한 설정을 실행 요청에 포함한다.

## Non-goals

엔진 목록과 게임별 cheat·behavior 설정은 기존 API에서 관리한다.

## Context / Constraints

서버 기본값은 요청에서 생략한다. 기존 브라우저에 저장한 선택과 `web-v1` 통계 label을 유지한다. 서버의 50자 제한을 넘는 새 조합은 별도 label로 기록한다.

## Approach (Checklist)

- Orchestration의 `GET /api/qa-arch-options`를 통해 공개 옵션을 조회한다.
- 받은 목록으로 컨트롤을 만들고 엔진, 선택한 모델과 다른 옵션에 맞지 않는 값을 요청에서 제외한다.
- 목록을 읽지 못하면 재시도를 제공하고, 저장한 설정이 필요한 실행을 막는다.

## Validation

`npm test` 1,700개와 `npm run build`가 통과했다. `npm run lint`에는 기존 경고 2개가 남았다. 로컬 Home에서 서버가 반환한 14개 옵션 중 Code Mode를 켰다. vision을 끈 동안 다른 설정을 바꾼 뒤 다시 켰을 때 screen capture 선택이 복원됐다. 목록 요청에 503을 반환한 뒤 재시도로 정상 목록을 다시 받았다. Home이 만든 7개 설정 조합을 Agent 세션 API에서 수락했다.

## Risks & Rollback

Agent, Orchestration, Home 순서로 배포한다. Home 변경을 되돌려도 기존 설정 데이터와 실행 이력은 유지된다.

## Open Questions

없음.
