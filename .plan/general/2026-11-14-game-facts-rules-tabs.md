# 변수 메타데이터에 게임 정보 · 규칙 탭 추가

- Date: 2026-11-14
- GitHub Issue: None
- Status: Verified

## Goal

코딩 에이전트가 MCP(`modify_facts`, `modify_rules`)로 선언한 `fact`·`rule` 을 콘솔에서 볼 수 있게 한다.
「변수 메타데이터」 화면에 「게임 정보」(`fact`)와 「규칙」(`rule`) 탭을 더한다.

## Non-goals

콘솔에서 `fact`·`rule` 을 등록·수정·삭제하는 일. 선언은 지금처럼 MCP 가 한다. 서버 API 변경.

## Context / Constraints

- 서버는 `GET /api/projects/{projectId}/game-facts` 하나로 `fact` 와 `rule` 을 함께 돌려준다(V177). 콘솔은 이 경로를 아직 부르지 않았다.
- `fact`·`rule` 은 프로젝트 단위다. 화면 위쪽의 빌드 고르기는 「게임 변수」 탭에만 해당한다.
- 한국어 화면에서 `fact` 는 「게임 정보」로 부른다. 「팩트」는 음차라 QA 담당자가 뜻을 알기 어렵고, 「관찰 값」은 서버의 `observables` 와 겹친다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `GameFactController`·`GameFactDtos` 응답 모양, `GameIdentitiesSection` 탭 구조 확인
- [x] **Step 1: Implementation** — `gameFactApi.ts` 에서 응답을 경계에서 파싱, `GameFactTables.tsx` 의 두 표, 탭 · 개수 · 로딩 · 실패 · 빈 화면 연결, 규칙의 게임 정보 칩에서 게임 정보 줄로 이동
- [x] **Step 2: Tests** — 파서 · 경로 · 규칙 수 집계 단위 테스트, 로컬 self-host 스택에서 두 테마 화면 확인
- [x] **Step 3: Rollout / Rollback** — 콘솔만 바뀐다. 되돌리면 탭 둘이 사라질 뿐 데이터는 그대로다

## Validation

- **Commands to run:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- **Expected output:** 테스트 전부 통과, 변경 파일에 lint 오류 없음(develop 에 있던 다른 파일의 오류 5개는 그대로)

## Risks & Rollback

- **Risks:** 서버가 응답 모양을 바꾸면 파서가 실패 화면을 띄운다(빈 목록으로 숨기지 않는다).
- **Rollback steps:** 이 PR 을 되돌린다.

## Open Questions

- 로컬 확인은 `deploy/docker-compose.yml` 로 띄운 orch(`ghcr.io/project-artel/orchestration:develop`)에 테스트 계정 · 프로젝트를 만들고 WV #7 과 같은 `fact` 17개 · `rule` 18개를 넣어 했다. 빌드 행은 SDK 없이 만들 수 없어 DB 에 직접 넣었다.
