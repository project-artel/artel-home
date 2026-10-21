# 2026-10-21 · 화면 지도: 최신 빌드를 기본으로 열고 SDK 연결 상태를 자동 갱신한다 (ARTEL-1185)

- Date: 2026-10-21
- GitHub Issue: None (Jira ARTEL-1185)
- Status: Implemented · ARTEL-1179 위에 쌓임
- 시안: https://claude.ai/artifact/Q7jGjugLh4yQsPJzWbgUDA

## Goal

1. `?build=` 없이 열면 빌드 고르기의 "최신" 과 같은 빌드가 열린다. project 1 은 10월의 에디터 빌드 `1.4.0` 대신 9월의 출시 빌드 `1.0` 이 열렸다.
2. `evidence` 줄에서 SDK 연결 상태와 확인 시각을 보이고, game instance 추가·삭제·연결·해제를 SSE로 반영한다.

## Non-goals

- QA · 매크로의 `selectBuild`(에디터 제외)는 그대로다.
- 서버의 기존 `GAME_INSTANCES` 이벤트를 사용한다. 서버 이벤트 계약과 SDK 재연결 동작은 바꾸지 않는다.

## Approach

- `latestBuild.ts`: `newestFirst`(등록이 늦은 것부터, 에디터 포함)를 빌드 고르기 순서와 기본값이 같이 쓴다.
- `SdkStatus`: 확인하는 중 · 연결 상태를 확인하지 못했습니다 · SDK 연결 안 됨 · SDK 연결됨(한 대면 이름) · SDK 연결됨 n대. 늘 확인 시각을 붙인다.
- `useProjectChange(projectId, 'GAME_INSTANCES', ...)`로 변경 알림과 재연결의 `ready`를 받으면 목록을 다시 읽는다. 수동 새로고침 버튼은 제거한다.
- 10초 폴링은 조회 실패와 누락된 알림 복구용으로 유지한다. 숨겨진 탭에서는 멈추고, 탭 복귀 시 즉시 읽는다.
- 초기 조회와 재조회는 같은 effect에서 처리한다. 새 요청이 시작되면 이전 요청을 취소하고, 취소된 결과를 무시한다. 재조회 실패 시 같은 프로젝트의 성공한 목록과 확인 시각을 유지한다.
- 게임 고르기는 두 대 이상 붙었을 때만. 안내 문장은 짧게, 대시 없이.

## Validation

- SSE 구독 변경: `npm test`, `npx tsc -b --pretty false`, 변경 파일 `eslint`, `git diff --check`로 검증한다.
- 서버 `develop`의 `0c8e52a89dc0b6786ae42f2894578d24f1610d67`에서 등록·삭제·SDK 연결·해제의 `GAME_INSTANCES` 발행을 확인했다. 실제 배포 서버와의 통합 검증은 별도다.
- 아래 스크린샷과 기존 검증은 수동 버튼 제거 전 기록이다.

- `npm test` 1320 통과, `npx tsc -b`, 바꾼 파일 `eslint`.
- project 1 이 `?build=8`(1.4.0) 로 열림. 브라우저에서 `/game-instances` 응답을 바꿔 안 붙음 · 확인 중 · 한 대 · 두 대 · 확인 실패를 다크 · 라이트로 확인.

![최신 빌드 · 안 붙음](../assets/2026-10-21-content-map-sdk-status/01-latest-build-not-connected-dark.png)
![한 대](../assets/2026-10-21-content-map-sdk-status/02-connected-one-dark.png)
![두 대 · 라이트](../assets/2026-10-21-content-map-sdk-status/03-connected-two-light.png)

## Risks

- 에디터 빌드는 등록 시각이 처음 붙은 때라, 그 뒤에 출시 빌드를 새로 등록하면 그 출시 빌드가 최신으로 열린다.
